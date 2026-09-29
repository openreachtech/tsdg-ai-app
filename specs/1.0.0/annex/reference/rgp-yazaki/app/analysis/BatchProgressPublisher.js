import BATCH_PROGRESS_EVENT_KIND_CONSTANT_HASH from '../constants/batchProgressEventKind.js'

import BatchFileSummaryFormatter from '../tools/BatchFileSummaryFormatter.js'

import BatchFile from '../../sequelize/models/BatchFile.js'
import BatchFileKind from '../../sequelize/models/BatchFileKind.js'
import ProcessingStatus from '../../sequelize/models/ProcessingStatus.js'

import BatchProgressUpdatedSubscriptionResolver from '../../server/graphql/resolvers/operator/actual/subscriptions/BatchProgressUpdatedSubscriptionResolver.js'

import BatchProgressReader from './BatchProgressReader.js'

const {
  BATCH_PROGRESS_EVENT_KIND,
} = BATCH_PROGRESS_EVENT_KIND_CONSTANT_HASH

/*
 * What the two batch-level events say where the file-level one names a file. Null rather than absent
 * because the contract declares the field on every event and only fills it on one
 * (30-api-contract.md §3.3) - a client switching on `eventKind` reads it as "not this kind", where a
 * missing key would read as "this client is out of date".
 */
const ABSENT_BATCH_FILE = null

/*
 * And what every event but the completion says about the verdicts. Until the last file settles these
 * are figures still moving, so a client that rendered them would count a batch as verified early.
 */
const ABSENT_JUDGMENT_COUNTS = {
  okCount: null,
  ngCount: null,
}

/**
 * Publishes what one batch is doing, as it does it (`API-S001`).
 *
 * **The channel is never written here.** The topic is built by
 * `BatchProgressUpdatedSubscriptionResolver`, the class the browser also derives its channel from,
 * so the two sides cannot drift - and a drift would show up as silence rather than as an error
 * (`ADR-13`).
 *
 * **Publishing is allowed to fail.** Nothing here catches, because the caller has somewhere to log
 * and this class does not; what matters is that a broker that refuses must not fail the analysis,
 * which is the worker's decision to make and is where it is made. The events are an optimization
 * over `API-Q002`, so a lost one costs a client one polling interval (`NFR-022`).
 *
 * **Which event goes out when is fixed by `40-backend.md` §8**, not chosen here: a file state change
 * on every `ST-01` transition, batch progress after each file settles, and the completion when
 * `ST-02` settles.
 */
export default class BatchProgressPublisher {
  /**
   * Constructor.
   *
   * @param {{
   *   verificationBatchId: number
   *   subscriptionBroker: import('@openreachtech/renchan').SubscriptionBroker
   *   progressReader: BatchProgressReader
   * }} params - Parameters of this constructor.
   */
  constructor ({
    verificationBatchId,
    subscriptionBroker,
    progressReader,
  }) {
    this.verificationBatchId = verificationBatchId
    this.subscriptionBroker = subscriptionBroker
    this.progressReader = progressReader
  }

  /**
   * Factory method.
   *
   * @param {{
   *   verificationBatchId: number
   *   subscriptionBroker: import('@openreachtech/renchan').SubscriptionBroker
   *   progressReader?: BatchProgressReader
   * }} params - Parameters of this method.
   * @returns {BatchProgressPublisher} - Instance of this class.
   */
  static create ({
    verificationBatchId,
    subscriptionBroker,
    progressReader = BatchProgressReader.create({
      verificationBatchId,
    }),
  }) {
    return new this({
      verificationBatchId,
      subscriptionBroker,
      progressReader,
    })
  }

  /**
   * Publish that one file has changed state (`ST-01`).
   *
   * The file is read back rather than described from what the caller knows, so the event carries the
   * row as it now stands - including the duration and the failure reason the transition just wrote.
   *
   * @param {{
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async publishFileStateChange ({
    batchFileId,
  }) {
    const batchFile = await this.findBatchFileSummary({
      batchFileId,
    })

    await this.publishEvent({
      eventKind: BATCH_PROGRESS_EVENT_KIND.FILE_STATE_CHANGED,
      batchFile,
      judgmentCounts: ABSENT_JUDGMENT_COUNTS,
    })
  }

  /**
   * Publish that the batch has moved, after a file settled.
   *
   * Sent beside the file's own event rather than instead of it, because they answer different
   * questions: one file changed, and the bar moved. A client that only wanted the second would still
   * have to know which files failed (`CMP-04`).
   *
   * @returns {Promise<void>}
   */
  async publishBatchProgress () {
    await this.publishEvent({
      eventKind: BATCH_PROGRESS_EVENT_KIND.BATCH_PROGRESS,
      batchFile: ABSENT_BATCH_FILE,
      judgmentCounts: ABSENT_JUDGMENT_COUNTS,
    })
  }

  /**
   * Publish that the batch has settled (`ST-02`).
   *
   * This is the event that raises the operator's completion notice wherever they are, which is the
   * whole of `FR-022` - so it carries the verdict counts a notice has to state.
   *
   * @returns {Promise<void>}
   */
  async publishBatchCompletion () {
    const judgmentCounts = await this.progressReader.readJudgmentCounts()

    await this.publishEvent({
      eventKind: BATCH_PROGRESS_EVENT_KIND.BATCH_COMPLETED,
      batchFile: ABSENT_BATCH_FILE,
      judgmentCounts,
    })
  }

  /**
   * Read the batch's figures and publish one event carrying them.
   *
   * @param {{
   *   eventKind: string
   *   batchFile: graphql.operator.BatchFileSummary | null
   *   judgmentCounts: {
   *     okCount: number | null
   *     ngCount: number | null
   *   }
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async publishEvent ({
    eventKind,
    batchFile,
    judgmentCounts,
  }) {
    const progress = await this.progressReader.readProgress()

    await this.publishPayload({
      payload: this.buildPayload({
        eventKind,
        batchFile,
        judgmentCounts,
        progress,
      }),
    })
  }

  /**
   * Build what one event says.
   *
   * @param {{
   *   eventKind: string
   *   batchFile: graphql.operator.BatchFileSummary | null
   *   judgmentCounts: {
   *     okCount: number | null
   *     ngCount: number | null
   *   }
   *   progress: {
   *     doneCount: number
   *     totalCount: number
   *     statusName: string
   *   }
   * }} params - Parameters of this method.
   * @returns {graphql.operator.BatchProgressUpdatedResult} - The event.
   */
  buildPayload ({
    eventKind,
    batchFile,
    judgmentCounts,
    progress,
  }) {
    return {
      verificationBatchId: this.verificationBatchId,
      eventKind,
      batchFile,
      doneCount: progress.doneCount,
      totalCount: progress.totalCount,
      statusName: progress.statusName,
      okCount: judgmentCounts.okCount,
      ngCount: judgmentCounts.ngCount,
    }
  }

  /**
   * Put one payload on this batch's channel.
   *
   * @param {{
   *   payload: graphql.operator.BatchProgressUpdatedResult
   *   BatchProgressUpdatedSubscriptionResolverCtor?: typeof BatchProgressUpdatedSubscriptionResolver
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async publishPayload ({
    payload,
    BatchProgressUpdatedSubscriptionResolverCtor = BatchProgressUpdatedSubscriptionResolver,
  }) {
    const topic = BatchProgressUpdatedSubscriptionResolverCtor.buildTopic({
      payload,
      channelQuery: {
        verificationBatchId: this.verificationBatchId,
      },
    })

    await this.subscriptionBroker.publish(topic)
  }

  /**
   * Read one file in the shape the schema declares for it.
   *
   * Answers null when the file has gone rather than throwing: a publish is not worth failing a job
   * over, and the event's other fields still say something true about the batch.
   *
   * @param {{
   *   batchFileId: number
   *   BatchFileSummaryFormatterCtor?: typeof BatchFileSummaryFormatter
   * }} params - Parameters of this method.
   * @returns {Promise<graphql.operator.BatchFileSummary | null>} - The file, or null.
   */
  async findBatchFileSummary ({
    batchFileId,
    BatchFileSummaryFormatterCtor = BatchFileSummaryFormatter,
  }) {
    const batchFile = /** @type {*} */ (
      await BatchFile.findByPk(
        batchFileId,
        {
          include: [
            BatchFileKind,
            ProcessingStatus,
          ],
        }
      )
    )

    if (!batchFile) {
      return null
    }

    return BatchFileSummaryFormatterCtor.create({
      batchFile,
    })
      .formatSummary()
  }
}

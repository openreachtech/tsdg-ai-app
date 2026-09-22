import BatchFile from '../../sequelize/models/BatchFile.js'
import BatchFileKind from '../../sequelize/models/BatchFileKind.js'
import ProcessingStatus from '../../sequelize/models/ProcessingStatus.js'

/**
 * Writes the one line `JOB-01` leaves behind for each file it analyzed (`OPS-09`).
 *
 * **Why a line on success too.** The worker already logs failures, and that was mistaken for
 * enough: a batch that is merely slow raises no error, so a log of failures alone says nothing
 * about it. `OPS-09` asks that "a stalled or slow batch is diagnosable from the log alone, without
 * reproducing it", which only holds if every job reports how long it took, whatever became of it.
 *
 * **The readings are counted, not read.** `OPS-09` asks the line for how many readings were taken,
 * because that is what separates a provider that was slow from one that answered twice and stopped.
 * The count comes from the run's own tally rather than from `TBL-06`, which holds nothing until a
 * set is whole (`NFR-023`) - counting rows would answer zero on exactly the run worth explaining.
 *
 * **Ids, kinds and outcomes - never content.** The payload carries no file name, no amount and no
 * extraction. `OPS-09` forbids document content in the log, and `SEC-003` counts a log line as an
 * exposure path like any other; the ids here identify a row to anyone who can already read the
 * database, and say nothing to anyone who cannot. `#buildOutcomePayload()` is where that holds, and
 * its test asserts the payload whole rather than field by field, so a field carrying a client's
 * figures cannot be added without turning a test red.
 *
 * **The row is read again rather than reused.** The copy the worker opened the job with predates
 * every transition this line reports - status, duration and failure reason are all written after it
 * (`ST-01`). Reporting from the stale copy would log the state the file was in before the work.
 */
export default class BatchFileOutcomeLogger {
  /**
   * Constructor.
   *
   * @param {{
   *   jobName: string
   *   timber: Console
   * }} params - Parameters of this constructor.
   */
  constructor ({
    jobName,
    timber,
  }) {
    this.jobName = jobName
    this.timber = timber
  }

  /**
   * Factory method.
   *
   * @param {{
   *   jobName: string
   *   timber: Console
   * }} params - Parameters of this method.
   * @returns {BatchFileOutcomeLogger} - Instance of this class.
   */
  static create ({
    jobName,
    timber,
  }) {
    return new this({
      jobName,
      timber,
    })
  }

  /**
   * Write what became of one file.
   *
   * Answers without writing anything when the file has gone. A row deleted between settling and
   * logging is not worth a second failure on the way out of a job, and the line it would have
   * written names nothing that still exists.
   *
   * @param {{
   *   batchFileId: number
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async logOutcome ({
    batchFileId,
    readingProgressTally,
  }) {
    const batchFile = await this.findSettledBatchFile({
      batchFileId,
    })

    if (!batchFile) {
      return
    }

    this.timber.info(
      this.buildOutcomePayload({
        batchFile,
        readingProgressTally,
      })
    )
  }

  /**
   * Read the file as it stands now, with the kind and the state named rather than numbered.
   *
   * @param {{
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<BatchFileWithKindEntity | null>} - The file, or null when no row carries the id.
   */
  async findSettledBatchFile ({
    batchFileId,
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

    return batchFile
  }

  /**
   * Build what the line says.
   *
   * The six figures `OPS-09` names - file id, kind, outcome, duration, readings taken, failure
   * reason - plus the two that make a line findable among the others: the job that wrote it, because
   * `logs/job.log` also carries `JOB-02`, and the batch, because "a stalled batch" is the thing being
   * diagnosed and its files are otherwise unrelated lines.
   *
   * `durationSeconds` and `failureReasonCode` answer null on a file that never ran or never failed.
   * That is the row's own value rather than a substitute, so a line reading `durationSeconds: null`
   * says "this file settled without being timed", which is itself a finding.
   *
   * **`readingCount` travels with the count it fell short of.** Alone it cannot be read: two of
   * three readings is a provider that stopped, none of none is a cover sheet nobody asked the AI to
   * read (`ENV-043`), and both would print as a small number next to a failure. The pair says which,
   * the way `FAIL-01`'s own sentence does (`ReadingProgressTally#buildFailureParameters()`).
   *
   * @param {{
   *   batchFile: BatchFileWithKindEntity
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {{
   *   jobName: string
   *   batchFileId: number
   *   verificationBatchId: number
   *   fileKindName: string
   *   statusName: string
   *   durationSeconds: number | null
   *   readingCount: number
   *   targetReadingCount: number
   *   failureReasonCode: string | null
   * }} - The line's payload.
   */
  buildOutcomePayload ({
    batchFile,
    readingProgressTally,
  }) {
    return {
      jobName: this.jobName,
      batchFileId: batchFile.id,
      verificationBatchId: batchFile.VerificationBatchId,
      fileKindName: batchFile.BatchFileKind.name,
      statusName: batchFile.ProcessingStatus.name,
      durationSeconds: batchFile.durationSeconds,
      readingCount: readingProgressTally.completedReadingCount,
      targetReadingCount: readingProgressTally.targetReadingCount,
      failureReasonCode: batchFile.failureReasonCode,
    }
  }
}

/**
 * @typedef {import('../../sequelize/models/BatchFile.js').BatchFileEntity & {
 *   BatchFileKind: import('../../sequelize/models/BatchFileKind.js').BatchFileKindEntity
 *   ProcessingStatus: import('../../sequelize/models/ProcessingStatus.js').ProcessingStatusEntity
 * }} BatchFileWithKindEntity
 */

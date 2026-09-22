import PROCESSING_STATUS_CONSTANT_HASH from '../constants/processingStatus.js'

import BatchFile from '../../sequelize/models/BatchFile.js'

const {
  PROCESSING_STATUS,
} = PROCESSING_STATUS_CONSTANT_HASH

const MILLISECONDS_PER_SECOND = 1000

/**
 * Moves one file through `ST-01` and records how long it took.
 *
 * **The business times are their own columns, never the audit ones.** `started_at` and
 * `finished_at` say when the work happened; `created_at` and `updated_at` say when a row was
 * touched, and a migration backfill moves those without any business event having occurred. A
 * duration computed from audit columns would quietly become wrong the first time anybody ran one.
 *
 * **`failure_reason_code` and `failure_parameters` are cleared on the way in.** A file re-entering
 * `processing` after a retry carries the code of the run that failed, and a stale reason on a running
 * row reads as "failed again" on the screen (`ST-01`). The parameters go with it: numbers left from
 * the previous run would be substituted into whatever sentence the next failure produces, so a
 * timeout after three readings could be reported with the counts of the run before it.
 */
export default class BatchFileProcessingRecorder {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFileId: number
   *   startedAt: Date
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFileId,
    startedAt,
  }) {
    this.batchFileId = batchFileId
    this.startedAt = startedAt
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFileId: number
   *   startedAt?: Date
   * }} params - Parameters of this method.
   * @returns {BatchFileProcessingRecorder} - Instance of this class.
   */
  static create ({
    batchFileId,
    startedAt = new Date(),
  }) {
    return new this({
      batchFileId,
      startedAt,
    })
  }

  /**
   * Record that the worker has picked this file up.
   *
   * @returns {Promise<void>}
   */
  async recordStart () {
    await BatchFile.update(
      {
        ProcessingStatusId: PROCESSING_STATUS.PROCESSING.ID,
        startedAt: this.startedAt,
        finishedAt: null,
        durationSeconds: null,
        failureReasonCode: null,
        failureParameters: null,
      },
      {
        where: {
          id: this.batchFileId,
        },
      }
    )
  }

  /**
   * Record that the run handed the file back without analyzing it (`ST-01`).
   *
   * **`started_at` is cleared, and that is the point of the transition.** Step 1 of the DN branch
   * already moved the file to `processing` and stamped it; re-queueing it in place would leave a file
   * reading `processing` in nobody's hands, and the duration finally recorded would measure the wait
   * for the cover sheet rather than the work on the document (§5.3 step 2).
   *
   * The failure columns are cleared with it, for the same reason `recordStart()` clears them: the row
   * is going back to the state it was uploaded in, and a reason left over from an earlier run reads
   * on the screen as a file that failed again.
   *
   * @returns {Promise<void>}
   */
  async recordReturnToWaiting () {
    await BatchFile.update(
      {
        ProcessingStatusId: PROCESSING_STATUS.WAITING.ID,
        startedAt: null,
        finishedAt: null,
        durationSeconds: null,
        failureReasonCode: null,
        failureParameters: null,
      },
      {
        where: {
          id: this.batchFileId,
        },
      }
    )
  }

  /**
   * Record that the file was analyzed.
   *
   * @param {{
   *   finishedAt?: Date
   * }} [params] - Parameters of this method.
   * @returns {Promise<void>}
   */
  async recordCompletion ({
    finishedAt = new Date(),
  } = {}) {
    await BatchFile.update(
      {
        ProcessingStatusId: PROCESSING_STATUS.COMPLETED.ID,
        finishedAt,
        durationSeconds: this.generateDurationSeconds({
          finishedAt,
        }),
      },
      {
        where: {
          id: this.batchFileId,
        },
      }
    )
  }

  /**
   * Record that the run could not analyze the file.
   *
   * The duration is recorded on a failure too: how long a file took to fail is what separates a
   * timeout from a provider that refused instantly (`OPS-09`).
   *
   * **The parameters are stored rather than derived when read** (`DR-13` `DR-09`). 1.0.0 rebuilt
   * `FAIL-02`'s two numbers in the formatter, which only worked because the page cap is still
   * readable afterwards; the readings a timed-out run got through are not - nothing on the row
   * remembers them, and rule 14 leaves no `TBL-06` row to count. What the sentence substitutes has to
   * be written down at the moment the failure is known.
   *
   * @param {{
   *   failureReasonCode: string
   *   failureParameters: Record<string, number> | null
   *   finishedAt?: Date
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async recordFailure ({
    failureReasonCode,
    failureParameters,
    finishedAt = new Date(),
  }) {
    await BatchFile.update(
      {
        ProcessingStatusId: PROCESSING_STATUS.FAILED.ID,
        finishedAt,
        durationSeconds: this.generateDurationSeconds({
          finishedAt,
        }),
        failureReasonCode,
        failureParameters,
      },
      {
        where: {
          id: this.batchFileId,
        },
      }
    )
  }

  /**
   * Work out how long the run took, in whole seconds.
   *
   * @param {{
   *   finishedAt: Date
   * }} params - Parameters of this method.
   * @returns {number} - Seconds elapsed.
   */
  generateDurationSeconds ({
    finishedAt,
  }) {
    return Math.round(
      (finishedAt.getTime() - this.startedAt.getTime()) / MILLISECONDS_PER_SECOND
    )
  }
}

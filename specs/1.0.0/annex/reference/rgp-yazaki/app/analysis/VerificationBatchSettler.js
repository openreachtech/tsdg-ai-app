import BATCH_FILE_KIND_CONSTANT_HASH from '../constants/batchFileKind.js'
import PROCESSING_STATUS_CONSTANT_HASH from '../constants/processingStatus.js'

import BatchFile from '../../sequelize/models/BatchFile.js'
import VerificationBatch from '../../sequelize/models/VerificationBatch.js'

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH
const {
  PROCESSING_STATUS,
} = PROCESSING_STATUS_CONSTANT_HASH

const MILLISECONDS_PER_SECOND = 1000

/*
 * A batch is still running while any of its files is in one of these. Asking the files rather than
 * counting jobs is what makes the answer survive a worker restart: the rows are the record, the
 * queue is not.
 */
const UNSETTLED_STATUS_IDS = [
  PROCESSING_STATUS.WAITING.ID,
  PROCESSING_STATUS.PROCESSING.ID,
]

/**
 * Settles a batch once none of its files is still running (`ST-02`).
 *
 * **A batch is `completed` even when some of its files failed.** The question an operator has is
 * not "did everything work" but "which rows need me", and that is the NG count and the failed
 * count, both already in the summary (`FR-043`). A `partially_failed` state would add a word to
 * every screen and answer nothing.
 *
 * **`failed` is reserved for every file failing**, which nearly always means the environment broke
 * rather than the documents being bad - and that deserves its own state because the response is
 * different: fix the host, not the paperwork.
 *
 * **A cover sheet alone never settles a batch** (`ST-02`). The sequence that first motivated the
 * clause is gone since 1.0.2 - `API-M005` sees every file of the upload before a batch exists
 * (`SEQ-02`), so no PDF arrives under a batch the cover sheet's job has already finished - but the
 * case it guards outlives it, because it is about what a batch holds rather than about when its
 * files arrived. A batch whose only file is a cover sheet is reachable, and without the debit note
 * clause that one job settles it: the completion notice fires (`FR-022`) and `API-Q004` becomes
 * legal on a batch with zero debit notes.
 *
 * **A batch that never receives a debit note therefore stays `processing`, with no timeout.** That is
 * the truth of it - nothing failed and nothing more will happen - and `SCR-02` shows it as such.
 * Settling it on a clock would report a batch as finished on the strength of how long nobody uploaded
 * anything.
 *
 * Called after each file settles, so it runs many times per batch and must be harmless when the
 * batch is still running. It checks before it writes, writes nothing when anything is left, and
 * narrows the write itself so that runs finishing together cannot each claim to have settled it.
 */
export default class VerificationBatchSettler {
  /**
   * Constructor.
   *
   * @param {{
   *   verificationBatchId: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    verificationBatchId,
  }) {
    this.verificationBatchId = verificationBatchId
  }

  /**
   * Factory method.
   *
   * @param {{
   *   verificationBatchId: number
   * }} params - Parameters of this method.
   * @returns {VerificationBatchSettler} - Instance of this class.
   */
  static create ({
    verificationBatchId,
  }) {
    return new this({
      verificationBatchId,
    })
  }

  /**
   * Settle the batch, if its last file has just finished.
   *
   * @param {{
   *   finishedAt?: Date
   * }} [params] - Parameters of this method.
   * @returns {Promise<boolean>} - true: the batch settled on this call.
   */
  async settleBatch ({
    finishedAt = new Date(),
  } = {}) {
    const unsettledFileCount = await this.countUnsettledFiles()

    if (unsettledFileCount > 0) {
      return false
    }

    const debitNoteFileCount = await this.countDebitNoteFiles()

    if (debitNoteFileCount === 0) {
      return false
    }

    return this.writeSettledBatch({
      finishedAt,
    })
  }

  /**
   * Count the files of this batch that are still going to change.
   *
   * @returns {Promise<number>} - How many files are waiting or processing.
   */
  async countUnsettledFiles () {
    return BatchFile.count({
      where: {
        VerificationBatchId: this.verificationBatchId,
        ProcessingStatusId: UNSETTLED_STATUS_IDS,
      },
    })
  }

  /**
   * Count the debit notes the batch holds, whatever became of them.
   *
   * **Failed ones count.** What this answers is whether the batch ever received the documents it
   * exists to verify, not whether they could be read: a batch whose two debit notes both failed is a
   * finished batch with two rows needing attention, and `resolveSettledStatusId()` is what decides
   * which settled state that is.
   *
   * By kind id rather than by joining the master, because the id is what `TBL-04` carries and a
   * count that joined would have to say `distinct` to stay a count of files.
   *
   * @returns {Promise<number>} - How many debit notes the batch holds.
   */
  async countDebitNoteFiles () {
    return BatchFile.count({
      where: {
        VerificationBatchId: this.verificationBatchId,
        BatchFileKindId: BATCH_FILE_KIND.DEBIT_NOTE_PDF.ID,
      },
    })
  }

  /**
   * Write the settled state and the total the batch took.
   *
   * **The write is conditional on the batch still being unsettled, and the affected row count is
   * what says whether this call is the one that settled it.** Counting unsettled files above and
   * then writing is two steps, and the worker runs `JOB_CONCURRENCY` files at once (`NFR-011`): the
   * last few finish close enough together that each of their runs counts zero unsettled files and
   * each believes it settled the batch.
   *
   * Measured, not supposed. Three files retried together produced three `batch_completed` events on
   * a real socket, which is three completion notices for one batch (`FR-022`). Narrowing the `where`
   * makes the database pick one winner, the way `VerificationBatchReopener` already does.
   *
   * @param {{
   *   finishedAt: Date
   * }} params - Parameters of this method.
   * @returns {Promise<boolean>} - true: this call is the one that settled the batch.
   */
  async writeSettledBatch ({
    finishedAt,
  }) {
    const completedFileCount = await this.countCompletedFiles()

    const batch = await this.findBatch()

    const [updatedRowCount] = await VerificationBatch.update(
      {
        ProcessingStatusId: this.resolveSettledStatusId({
          completedFileCount,
        }),
        finishedAt,
        totalDurationSeconds: this.generateTotalDurationSeconds({
          batch,
          finishedAt,
        }),
      },
      {
        where: {
          id: this.verificationBatchId,
          ProcessingStatusId: UNSETTLED_STATUS_IDS,
        },
      }
    )

    return updatedRowCount > 0
  }

  /**
   * Count the files of this batch that were analyzed.
   *
   * @returns {Promise<number>} - How many files completed.
   */
  async countCompletedFiles () {
    return BatchFile.count({
      where: {
        VerificationBatchId: this.verificationBatchId,
        ProcessingStatusId: PROCESSING_STATUS.COMPLETED.ID,
      },
    })
  }

  /**
   * Find the batch being settled.
   *
   * @returns {Promise<import('../../sequelize/models/VerificationBatch.js').VerificationBatchEntity | null>} - The batch.
   */
  async findBatch () {
    return /** @type {*} */ (
      VerificationBatch.findByPk(this.verificationBatchId)
    )
  }

  /**
   * Decide which settled state the batch lands in.
   *
   * @param {{
   *   completedFileCount: number
   * }} params - Parameters of this method.
   * @returns {number} - Processing status id.
   */
  resolveSettledStatusId ({
    completedFileCount,
  }) {
    if (completedFileCount > 0) {
      return PROCESSING_STATUS.COMPLETED.ID
    }

    return PROCESSING_STATUS.FAILED.ID
  }

  /**
   * Work out how long the batch took, in whole seconds.
   *
   * Measured from when the batch started rather than from when it was uploaded: the wait in the
   * queue is not work the system did, and reporting it as such would make a busy host look slow at
   * analyzing (`FR-043`).
   *
   * @param {{
   *   batch: import('../../sequelize/models/VerificationBatch.js').VerificationBatchEntity | null
   *   finishedAt: Date
   * }} params - Parameters of this method.
   * @returns {number | null} - Seconds elapsed, or null when the batch never started.
   */
  generateTotalDurationSeconds ({
    batch,
    finishedAt,
  }) {
    if (!batch?.startedAt) {
      return null
    }

    return Math.round(
      (finishedAt.getTime() - batch.startedAt.getTime()) / MILLISECONDS_PER_SECOND
    )
  }
}

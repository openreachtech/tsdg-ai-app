import PROCESSING_STATUS_CONSTANT_HASH from '../constants/processingStatus.js'

import VerificationBatch from '../../sequelize/models/VerificationBatch.js'

const {
  PROCESSING_STATUS,
} = PROCESSING_STATUS_CONSTANT_HASH

/*
 * A batch has settled once it is in one of these. Only a settled batch can be reopened - one that
 * is still waiting or processing is already open, and writing to it would restart a clock that is
 * running.
 */
const SETTLED_STATUS_IDS = [
  PROCESSING_STATUS.COMPLETED.ID,
  PROCESSING_STATUS.FAILED.ID,
]

/**
 * Puts a settled batch back to `waiting` when it has work again (`ST-02`).
 *
 * **One caller since 1.0.2, and it is `API-M004`.** The other was `API-M003`, reopening a batch a
 * file had arrived for after it settled - a real sequence while every stored file was enqueued as
 * it landed. It is not one any more: a batch does not exist until `API-M005` has seen the whole
 * upload (`SEQ-02`), so nothing can arrive after its batch has started, and `ST-02` dropped the
 * edge that described it. What is left here is the operator asking for the failed files of a
 * settled batch, which `ST-02` keeps and which nothing about this class had to change.
 *
 * **Back to `waiting`, not straight to `processing`.** The retried files are `waiting`, and nothing
 * is running yet - a batch reading `processing` while every file of it waits would state something
 * no row agrees with. `VerificationBatchStarter` then moves it on when the first file is actually
 * picked up, which is the transition `ST-02` already defines, and that is also what gives the run a
 * fresh `started_at`: the starter only fires on `waiting`, so a batch set to `processing` here
 * would keep the previous run's `started_at` and report a duration measured across however long the
 * operator took to press Retry.
 *
 * **`finished_at` and `total_duration_seconds` are cleared, `started_at` is not.** The starter owns
 * `started_at` and overwrites it on the next pick-up; the two that describe a finished run are
 * cleared here, because a batch that is running again has not finished.
 *
 * **The settled states are in the `where`, not in a read.** The database decides whether this call
 * had anything to reopen, so two requests arriving together cannot both read `completed` and both
 * write a reopening.
 */
export default class VerificationBatchReopener {
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
   * @returns {VerificationBatchReopener} - Instance of this class.
   */
  static create ({
    verificationBatchId,
  }) {
    return new this({
      verificationBatchId,
    })
  }

  /**
   * Reopen the batch, if it had settled.
   *
   * @param {{
   *   transaction?: import('sequelize').Transaction | null
   * }} [params] - Parameters of this method.
   * @returns {Promise<boolean>} - true: this call was the one that reopened it.
   */
  async reopenBatch ({
    transaction = null,
  } = {}) {
    const [updatedRowCount] = await VerificationBatch.update(
      {
        ProcessingStatusId: PROCESSING_STATUS.WAITING.ID,
        finishedAt: null,
        totalDurationSeconds: null,
      },
      {
        where: {
          id: this.verificationBatchId,
          ProcessingStatusId: SETTLED_STATUS_IDS,
        },
        transaction,
      }
    )

    return updatedRowCount > 0
  }
}

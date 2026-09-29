import PROCESSING_STATUS_CONSTANT_HASH from '../constants/processingStatus.js'

import VerificationBatch from '../../sequelize/models/VerificationBatch.js'

const {
  PROCESSING_STATUS,
} = PROCESSING_STATUS_CONSTANT_HASH

/**
 * Moves a batch from `waiting` to `processing` when its first file is picked up (`ST-02`).
 *
 * **Every file's run calls this, and only the first one changes anything.** The update carries
 * `waiting` in its own `where`, so the database decides which run is first rather than this class
 * reading the state and then writing it - two workers starting two files of one batch in the same
 * millisecond would both read `waiting` and both write `started_at`, and the batch's duration would
 * be measured from whichever won.
 */
export default class VerificationBatchStarter {
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
   * @returns {VerificationBatchStarter} - Instance of this class.
   */
  static create ({
    verificationBatchId,
  }) {
    return new this({
      verificationBatchId,
    })
  }

  /**
   * Mark the batch as running, if nothing has yet.
   *
   * @param {{
   *   startedAt?: Date
   * }} [params] - Parameters of this method.
   * @returns {Promise<boolean>} - true: this call was the one that started the batch.
   */
  async startBatch ({
    startedAt = new Date(),
  } = {}) {
    const [updatedRowCount] = await VerificationBatch.update(
      {
        ProcessingStatusId: PROCESSING_STATUS.PROCESSING.ID,
        startedAt,
        finishedAt: null,
        totalDurationSeconds: null,
      },
      {
        where: {
          id: this.verificationBatchId,
          ProcessingStatusId: PROCESSING_STATUS.WAITING.ID,
        },
      }
    )

    return updatedRowCount > 0
  }
}

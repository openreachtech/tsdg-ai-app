import PROCESSING_STATUS_CONSTANT_HASH from '../constants/processingStatus.js'

import BatchFile from '../../sequelize/models/BatchFile.js'
import DebitNoteResult from '../../sequelize/models/DebitNoteResult.js'
import ProcessingStatus from '../../sequelize/models/ProcessingStatus.js'
import VerificationBatch from '../../sequelize/models/VerificationBatch.js'

const {
  PROCESSING_STATUS,
} = PROCESSING_STATUS_CONSTANT_HASH

/*
 * A file counts as done once it has reached a state it will not leave on its own. Failed counts as
 * done: the operator is told how many failed separately (`CMP-04`), and leaving them out of the
 * total would show a bar that never fills on a batch that has finished.
 */
const DONE_STATUS_IDS = [
  PROCESSING_STATUS.COMPLETED.ID,
  PROCESSING_STATUS.FAILED.ID,
]

/**
 * The figures a progress event carries about one batch (`API-S001`).
 *
 * **Counted at read time, never stored.** The batch row holds no totals (`40-backend.md` §2.2), so
 * these cannot go stale behind a retry that replaces a judgment (`DR-06`) - and the same counting
 * rules serve `API-Q002`, which is what lets a client fall back to polling and see the same numbers
 * (`NFR-022`).
 *
 * **Two counts rather than one and a subtraction.** `okCount` and `ngCount` are each counted, so a
 * judgment that is somehow neither shows up as a gap instead of hiding in the difference - the same
 * choice `API-Q002` makes over the array it already holds.
 */
export default class BatchProgressReader {
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
   * @returns {BatchProgressReader} - Instance of this class.
   */
  static create ({
    verificationBatchId,
  }) {
    return new this({
      verificationBatchId,
    })
  }

  /**
   * Read what every progress event says, whichever kind it is.
   *
   * @returns {Promise<{
   *   doneCount: number
   *   totalCount: number
   *   statusName: string
   * }>} - The figures.
   */
  async readProgress () {
    const doneCount = await this.countDoneFiles()
    const totalCount = await this.countTotalFiles()
    const statusName = await this.findStatusName()

    return {
      doneCount,
      totalCount,
      statusName,
    }
  }

  /**
   * Count the files that have finished, whether they were analyzed or failed.
   *
   * @returns {Promise<number>} - How many files are done.
   */
  async countDoneFiles () {
    return BatchFile.count({
      where: {
        VerificationBatchId: this.verificationBatchId,
        ProcessingStatusId: DONE_STATUS_IDS,
      },
    })
  }

  /**
   * Count every file of the batch, the cover sheet included.
   *
   * **Files, not debit notes**, and the reason is the third number beside this one. `SCR-04` shows
   * done, total and failed together, and `failed` is `failedFileCount` from `API-Q002` - a count of
   * files, driving a control that opens a dialog of failed *files* (`CMP-10`). Counting debit notes
   * here would let `failed` exceed `total` on a batch whose cover sheet and whose single debit note
   * both failed.
   *
   * This was left unsaid in the contract until the SPA team measured the consequence: they counted
   * debit notes, so one batch read 3/3 on the socket and 2/2 on the polling fallback - the one thing
   * `ADR-13` promises cannot happen. Both SDL copies now say which, and `50-frontend.md` §3.2 no
   * longer reads as though the bar counted debit notes.
   *
   * @returns {Promise<number>} - How many files the batch holds.
   */
  async countTotalFiles () {
    return BatchFile.count({
      where: {
        VerificationBatchId: this.verificationBatchId,
      },
    })
  }

  /**
   * Read which `ST-02` state the batch is in.
   *
   * Answers the empty string rather than throwing when the batch has gone: this runs on the way out
   * of a job, after the row was read once already, and a batch deleted in between is not worth
   * failing a publish over - the event is an optimization, and `API-Q002` is the durable answer
   * (`ADR-13`).
   *
   * @returns {Promise<string>} - The state's name, or the empty string when no batch carries the id.
   */
  async findStatusName () {
    const verificationBatch = /** @type {*} */ (
      await VerificationBatch.findByPk(
        this.verificationBatchId,
        {
          include: [
            ProcessingStatus,
          ],
        }
      )
    )

    return verificationBatch
      ?.ProcessingStatus
      ?.name
      ?? ''
  }

  /**
   * Count how the batch's debit notes were judged.
   *
   * Read only for the completion event, because until the last file settles these are figures still
   * moving and a client that rendered them mid-run would count a batch as verified early.
   *
   * @returns {Promise<{
   *   okCount: number
   *   ngCount: number
   * }>} - The counts.
   */
  async readJudgmentCounts () {
    const okCount = await this.countJudgedDebitNotes({
      isOverallPassed: true,
    })
    const ngCount = await this.countJudgedDebitNotes({
      isOverallPassed: false,
    })

    return {
      okCount,
      ngCount,
    }
  }

  /**
   * Count the batch's debit notes that were judged one way.
   *
   * @param {{
   *   isOverallPassed: boolean
   * }} params - Parameters of this method.
   * @returns {Promise<number>} - How many carry that verdict.
   */
  async countJudgedDebitNotes ({
    isOverallPassed,
  }) {
    return DebitNoteResult.count({
      where: {
        VerificationBatchId: this.verificationBatchId,
        isOverallPassed,
      },
    })
  }
}

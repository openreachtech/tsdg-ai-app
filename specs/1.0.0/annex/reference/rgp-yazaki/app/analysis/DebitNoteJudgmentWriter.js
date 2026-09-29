import DebitNoteNgReason from '../../sequelize/models/DebitNoteNgReason.js'
import DebitNoteResult from '../../sequelize/models/DebitNoteResult.js'

/**
 * Stores the verdict on one debit note and the reasons behind it (`TBL-07` `TBL-11`).
 *
 * **A retry replaces the whole verdict, reasons included** (`DR-06`). Reasons are rewritten rather
 * than added to, because a reason left over from a previous reading would keep a corrected document
 * NG, and the operator would fix the same defect twice and see it survive.
 *
 * **Reasons are stored as a code and its parameters, never as a sentence** (`DR-09` `ADR-05`). The
 * screen and the report each render them through their own dictionary, so the wording can change
 * without a migration and without invalidating what was judged last month.
 */
export default class DebitNoteJudgmentWriter {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity
   *   debitNoteJudgment: verification.DebitNoteJudgment
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFile,
    debitNoteJudgment,
  }) {
    this.batchFile = batchFile
    this.debitNoteJudgment = debitNoteJudgment
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity
   *   debitNoteJudgment: verification.DebitNoteJudgment
   * }} params - Parameters of this method.
   * @returns {DebitNoteJudgmentWriter} - Instance of this class.
   */
  static create ({
    batchFile,
    debitNoteJudgment,
  }) {
    return new this({
      batchFile,
      debitNoteJudgment,
    })
  }

  /**
   * Write the verdict and its reasons, in one transaction.
   *
   * One transaction because a result without its reasons is a document reported NG with nothing
   * said about why, which is worse for the operator than no answer at all (`FR-051`).
   *
   * @returns {Promise<void>}
   */
  async writeJudgment () {
    await DebitNoteResult.beginTransaction(async transaction => {
      await this.destroyPreviousJudgment({
        transaction,
      })

      const debitNoteResult = /** @type {*} */ (
        await DebitNoteResult.create(
          this.buildResultAttributes(),
          {
            transaction,
          }
        )
      )

      await DebitNoteNgReason.bulkCreate(
        this.buildNgReasonAttributes({
          debitNoteResultId: debitNoteResult.id,
        }),
        {
          transaction,
        }
      )
    })
  }

  /**
   * Delete the previous verdict of this file, its reasons first.
   *
   * **The reasons have to go explicitly.** There is no DB foreign key to cascade for us (rule 1),
   * so deleting the result alone leaves its `TBL-11` rows behind pointing at an id nothing holds -
   * and on SQLite that id is handed to the next row inserted, which makes the orphans reattach to
   * the replacement verdict. A retry then reports a reason the new judgment never produced, which
   * is exactly what `DR-06` says a retry must not do.
   *
   * @param {{
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async destroyPreviousJudgment ({
    transaction,
  }) {
    const previousResults = await DebitNoteResult.findAll({
      where: {
        BatchFileId: this.batchFile.id,
      },
      transaction,
    })

    await DebitNoteNgReason.destroy({
      where: {
        DebitNoteResultId: previousResults.map(it => /** @type {*} */ (it).id),
      },
      transaction,
    })

    await DebitNoteResult.destroy({
      where: {
        BatchFileId: this.batchFile.id,
      },
      transaction,
    })
  }

  /**
   * Build the `TBL-07` row of one judgment.
   *
   * @returns {{
   *   VerificationBatchId: number
   *   BatchFileId: number
   *   CoverSheetRowId: number | null
   *   debitNoteNumber: string | null
   *   extractedAmountMinorUnits: number | null
   *   isExcelTotalPassed: boolean
   *   isAmountPassed: boolean
   *   isSignatureDetected: boolean
   *   isOverallPassed: boolean
   *   judgedAt: Date
   * }} - The row.
   */
  buildResultAttributes () {
    return {
      VerificationBatchId: this.batchFile.VerificationBatchId,
      BatchFileId: this.batchFile.id,
      CoverSheetRowId: this.debitNoteJudgment.CoverSheetRowId,
      debitNoteNumber: this.debitNoteJudgment.debitNoteNumber,
      extractedAmountMinorUnits: this.debitNoteJudgment.extractedAmountMinorUnits,
      isExcelTotalPassed: this.debitNoteJudgment.isExcelTotalPassed,
      isAmountPassed: this.debitNoteJudgment.isAmountPassed,
      isSignatureDetected: this.debitNoteJudgment.isSignatureDetected,
      isOverallPassed: this.debitNoteJudgment.isOverallPassed,
      judgedAt: this.debitNoteJudgment.judgedAt,
    }
  }

  /**
   * Build the `TBL-11` rows of one judgment.
   *
   * @param {{
   *   debitNoteResultId: number
   * }} params - Parameters of this method.
   * @returns {Array<{
   *   DebitNoteResultId: number
   *   NgReasonCodeId: number
   *   parameters: Record<string, *>
   * }>} - The rows, empty when the document is OK.
   */
  buildNgReasonAttributes ({
    debitNoteResultId,
  }) {
    return this.debitNoteJudgment.ngReasons
      .map(ngReason => ({
        DebitNoteResultId: debitNoteResultId,
        NgReasonCodeId: ngReason.NgReasonCodeId,
        parameters: ngReason.parameters,
      }))
  }
}

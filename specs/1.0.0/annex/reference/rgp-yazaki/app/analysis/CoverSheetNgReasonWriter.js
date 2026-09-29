import CoverSheetNgReason from '../../sequelize/models/CoverSheetNgReason.js'

/**
 * Stores what check ⑤ found about one cover sheet (`TBL-16`).
 *
 * **These findings hang from the file, not from a debit note.** `TBL-11.DebitNoteResultId` is
 * `NOT NULL` and `ENG-04` runs before a single PDF of the batch has been judged, so a finding
 * produced by the cover-sheet job has nothing there to hang from - and `NG-007` changes no verdict
 * anyway (`DR-01` `FR-092`), so copying it onto every debit note would state 200 times something
 * that is true once about one worksheet row.
 *
 * **It takes the whole set or none of it**, the rule `TBL-06` and `TBL-14` are written under. One
 * transaction deletes every finding this file has and writes the set that replaces it, so a retry
 * cannot leave a disagreement from the previous run beside the new ones, and a run that agrees where
 * the last one did not cannot leave the old finding standing (`DR-06`).
 */
export default class CoverSheetNgReasonWriter {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFileId: number
   *   ngReasons: Array<verification.NgReason>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFileId,
    ngReasons,
  }) {
    this.batchFileId = batchFileId
    this.ngReasons = ngReasons
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFileId: number
   *   ngReasons: Array<verification.NgReason>
   * }} params - Parameters of this method.
   * @returns {CoverSheetNgReasonWriter} - Instance of this class.
   * @public
   */
  static create ({
    batchFileId,
    ngReasons,
  }) {
    return new this({
      batchFileId,
      ngReasons,
    })
  }

  /**
   * Write the file's findings, replacing whatever a previous run of it left.
   *
   * @returns {Promise<void>}
   * @public
   */
  async writeNgReasons () {
    await CoverSheetNgReason.beginTransaction(async transaction => {
      await CoverSheetNgReason.destroy({
        where: {
          BatchFileId: this.batchFileId,
        },
        transaction,
      })

      await CoverSheetNgReason.bulkCreate(
        this.buildNgReasonAttributes(),
        {
          transaction,
        }
      )
    })
  }

  /**
   * Build one `TBL-16` row per finding, in the order `ENG-04` reported them.
   *
   * @returns {Array<{
   *   BatchFileId: number
   *   NgReasonCodeId: number
   *   parameters: Record<string, unknown>
   * }>} - The rows.
   */
  buildNgReasonAttributes () {
    return this.ngReasons
      .map(ngReason => this.buildNgReasonAttribute({
        ngReason,
      }))
  }

  /**
   * Build one `TBL-16` row.
   *
   * @param {{
   *   ngReason: verification.NgReason
   * }} params - Parameters of this method.
   * @returns {{
   *   BatchFileId: number
   *   NgReasonCodeId: number
   *   parameters: Record<string, unknown>
   * }} - The row.
   */
  buildNgReasonAttribute ({
    ngReason,
  }) {
    return {
      BatchFileId: this.batchFileId,
      NgReasonCodeId: ngReason.NgReasonCodeId,
      parameters: ngReason.parameters,
    }
  }
}

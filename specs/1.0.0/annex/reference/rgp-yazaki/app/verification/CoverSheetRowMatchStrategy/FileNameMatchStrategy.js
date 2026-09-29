import path from 'path'

import BaseCoverSheetRowMatchStrategy from './BaseCoverSheetRowMatchStrategy.js'

/**
 * The second matching rule: the debit note's number is embedded in its file name (`ENG-02` rule 2).
 *
 * **This is what saves a document whose printed number could not be read.** Subsidiaries name the
 * file after the debit note, so the number survives on the outside of a scan the AI could make
 * nothing of - and a document matched this way still has its amount compared, rather than becoming
 * an `NG-006` about a number that is right there in the file name.
 *
 * **The file name is reduced to the same key as the row** (`FR-038`), which is what makes
 * `HIB-002YEVMP26-003.pdf` find the sheet's `HIB-002/YEVMP26-003`. The observed pair differs by one
 * slash, so a rule comparing the verbatim forms would have matched neither of the two documents we
 * have measurements for.
 *
 * The rule is loose on purpose: `FAKE-DN-1001_signed.pdf` is meant to match. What makes looseness
 * safe is that ambiguity is never resolved here - two rows matching produces `NG-006` listing both
 * rather than the longer or the first of them (`FR-037`).
 *
 * @extends {BaseCoverSheetRowMatchStrategy}
 */
export default class FileNameMatchStrategy extends BaseCoverSheetRowMatchStrategy {
  /**
   * Collect the rows whose number the file name carries.
   *
   * @override
   * @returns {Array<verification.ComparedCoverSheetRow>} - The candidates.
   */
  collectMatchedRows () {
    const normalizedFileName = this.generateNormalizedFileName()

    return this.collectKeyedRows()
      .filter(coverSheetRow =>
        normalizedFileName.includes(coverSheetRow.normalizedDebitNoteNumber)
      )
  }

  /**
   * Generate the file name as a key of the same form the rows carry.
   *
   * The extension goes first because it is the one part of the name that never carries the number,
   * and `.pdf` would otherwise survive normalization as `PDF` and sit inside the key. What remains
   * is folded exactly as a row's number is - separators out, upper-cased - so the two sides are
   * comparable by construction rather than by both call sites remembering to agree.
   *
   * @returns {string} - The compared name.
   */
  generateNormalizedFileName () {
    const baseFileName = path.basename(
      this.fileName,
      path.extname(this.fileName)
    )

    return this.generateNormalizedNumber({
      debitNoteNumber: baseFileName,
    })
  }
}

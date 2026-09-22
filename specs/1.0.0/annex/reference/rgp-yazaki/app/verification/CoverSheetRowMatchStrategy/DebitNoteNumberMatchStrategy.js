import BaseCoverSheetRowMatchStrategy from './BaseCoverSheetRowMatchStrategy.js'

/**
 * The first matching rule: the number read from the PDF is a row's number (`ENG-02` rule 1).
 *
 * **Exact equality between normalized keys, with nothing else forgiven** (`FR-038`). The two sides
 * disagree about slashes, hyphens and spaces and about nothing more, so those come out and the
 * comparison stays exact: a rule that also ignored letters or digits would pair `FAKE-DN-1001` with
 * `FAKE-DN-1O01` and be right most of the time, and the times it was wrong would be invisible - a
 * matched row is what an amount is then compared against (`FR-031`).
 *
 * When this rule finds nothing, the file name still gets its turn.
 *
 * @extends {BaseCoverSheetRowMatchStrategy}
 */
export default class DebitNoteNumberMatchStrategy extends BaseCoverSheetRowMatchStrategy {
  /**
   * Collect the rows carrying the number the PDF states.
   *
   * @override
   * @returns {Array<verification.ComparedCoverSheetRow>} - The candidates.
   */
  collectMatchedRows () {
    const {
      debitNoteNumber,
    } = this

    if (!debitNoteNumber) {
      return []
    }

    const normalizedDebitNoteNumber = this.generateNormalizedNumber({
      debitNoteNumber,
    })

    return this.collectKeyedRows()
      .filter(coverSheetRow =>
        coverSheetRow.normalizedDebitNoteNumber === normalizedDebitNoteNumber
      )
  }
}

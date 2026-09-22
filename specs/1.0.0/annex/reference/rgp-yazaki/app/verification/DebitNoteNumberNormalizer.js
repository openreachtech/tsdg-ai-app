/*
 * What is removed before two debit note numbers are compared: slashes, hyphens and whitespace.
 *
 * Exactly the three the sheet and the file name disagree about (`FR-038`). The sheet writes
 * `HIB-002/YEVMP26-003` and the subsidiary names the file `HIB-002YEVMP26-003.pdf`, so the
 * separators are decoration on one side and absent on the other. Nothing else is stripped: dropping
 * a letter or a digit would pair two genuinely different documents.
 */
const SEPARATOR_PATTERN = /[\s/-]/gu

/**
 * One debit note number in the form `ENG-02` matches on (`FR-038`).
 *
 * **This is a key, not a display value.** The verbatim number keeps its own column, because it is
 * what the operator can find in their own workbook; showing them a normalized key they cannot
 * search for would move the problem rather than remove it.
 *
 * **Upper-cased rather than lower-cased**, which is arbitrary but has to be one of the two: the
 * value is stored and indexed, so both sides of a comparison must have been folded the same way,
 * and a rule written down beats a rule inferred from whichever call site ran first.
 */
export default class DebitNoteNumberNormalizer {
  /**
   * Constructor.
   *
   * @param {{
   *   debitNoteNumber: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    debitNoteNumber,
  }) {
    this.debitNoteNumber = debitNoteNumber
  }

  /**
   * Factory method.
   *
   * @param {{
   *   debitNoteNumber: string
   * }} params - Parameters of this method.
   * @returns {DebitNoteNumberNormalizer} - Instance of this class.
   */
  static create ({
    debitNoteNumber,
  }) {
    return new this({
      debitNoteNumber,
    })
  }

  /**
   * Generate the matching key.
   *
   * @returns {string} - The key, which is empty when the number was nothing but separators.
   */
  generateNormalizedNumber () {
    return this.debitNoteNumber
      .replace(SEPARATOR_PATTERN, '')
      .toUpperCase()
  }
}

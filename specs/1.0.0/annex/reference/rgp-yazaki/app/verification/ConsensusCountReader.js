/**
 * Reads a whole number back out of the canonical string `ENG-05` agreed on (`TBL-14`).
 *
 * **`consensus_value` is one string column for four kinds of value**, so the two counts stored in it
 * - a document's page count, and its total in minor units - come back as text and have to be turned
 * into numbers before anything compares or stores them. This is the inverse of
 * `ReadingValueCanonicalizer#canonicalizeCount()`, and it exists so that the turn happens by one
 * rule rather than by a `Number()` written wherever it was needed.
 *
 * **A value nobody agreed on stays null, and never becomes `0`** (`DR-05` `ADR-09`). `Number(null)`
 * is `0` in this language, and a zero would be compared: `NG-002` against a cover sheet row, or a
 * page cap against a document nobody could measure. An unreadable figure that arrives as a zero is
 * the exact defect `DR-03` exists to prevent, and it arrives silently.
 */
export default class ConsensusCountReader {
  /**
   * Constructor.
   *
   * @param {{
   *   consensusValue: string | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    consensusValue,
  }) {
    this.consensusValue = consensusValue
  }

  /**
   * Factory method.
   *
   * @param {{
   *   consensusValue: string | null
   * }} params - Parameters of this method.
   * @returns {ConsensusCountReader} - Instance of this class.
   */
  static create ({
    consensusValue,
  }) {
    return new this({
      consensusValue,
    })
  }

  /**
   * Read the count the readings agreed on.
   *
   * **Two guards, and neither can fire on a value this system wrote.** `#canonicalizeCount()` writes
   * `String(number)` and nothing else; a column is still a column, and a row written by hand or by a
   * later backfill must not be rounded into a figure the readings never produced. The first refuses
   * anything that is not a whole number JavaScript holds exactly; the second refuses anything not
   * written the way a canonical count is written, which is what disposes of the empty string -
   * `Number('')` is `0`, and a zero is the one wrong answer this class exists to prevent.
   *
   * @returns {number | null} - The count, or null when the readings agreed on none.
   */
  readCount () {
    if (this.consensusValue === null) {
      return null
    }

    const count = Number(this.consensusValue)

    if (!Number.isSafeInteger(count)) {
      return null
    }

    if (String(count) !== this.consensusValue) {
      return null
    }

    return count
  }
}

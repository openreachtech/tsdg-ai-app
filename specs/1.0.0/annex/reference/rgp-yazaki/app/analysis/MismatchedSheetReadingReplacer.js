/**
 * Replaces every cover-sheet reading that is not of the judged worksheet with one that read nothing
 * (`SEC-009` `ADR-23`, §5.3 cover-sheet branch step 5).
 *
 * **The model is looking at a workbook the operator never saw.** `ADR-23` extracts the judged
 * worksheet into a file of its own so the six previous months never leave the host, and the cost of
 * that is stated rather than waved past: a bug in the extraction would put the model in front of the
 * wrong month, and every row it read would then disagree with the parse. The reading's own
 * `sheetName` is what catches it, which is why the prompt asks for the tab label verbatim.
 *
 * **A mismatch is counted as unread rather than dropped.** The denominator of an agreement is how
 * many readings were taken, not how many turned out usable (`TERM-15`), so a discarded reading has
 * to keep its place in the set and contribute nothing - which is exactly what an extraction that
 * read nothing does. Dropping it would turn one unusable reading out of three into a confident
 * `2/2`.
 *
 * **Three mismatches leave every field with no consensus at all**, which reads correctly as "we
 * could not get a usable reading" - and is a far better answer than a worksheet of disagreements
 * blamed on a subsidiary for a file we assembled ourselves (`DR-03`).
 */
export default class MismatchedSheetReadingReplacer {
  /**
   * Constructor.
   *
   * @param {{
   *   judgedSheetName: string
   *   emptyExtraction: ai.NormalizedCoverSheetExtraction
   * }} params - Parameters of this constructor.
   */
  constructor ({
    judgedSheetName,
    emptyExtraction,
  }) {
    this.judgedSheetName = judgedSheetName
    this.emptyExtraction = emptyExtraction
  }

  /**
   * Factory method.
   *
   * **The empty extraction is handed in rather than written here.** What "read nothing" looks like
   * is §7.2's answer and the AI layer owns it, so a class in `app/analysis/` that spelled the shape
   * out would be a second copy of the contract - and the copy that stops being updated.
   *
   * @param {{
   *   judgedSheetName: string
   *   emptyExtraction: ai.NormalizedCoverSheetExtraction
   * }} params - Parameters of this method.
   * @returns {MismatchedSheetReadingReplacer} - Instance of this class.
   */
  static create ({
    judgedSheetName,
    emptyExtraction,
  }) {
    return new this({
      judgedSheetName,
      emptyExtraction,
    })
  }

  /**
   * Answer the readings with every mismatched one replaced, in reading order.
   *
   * @param {{
   *   normalizedExtractions: Array<ai.NormalizedCoverSheetExtraction>
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedCoverSheetExtraction>} - One entry per reading taken.
   */
  replaceMismatchedReadings ({
    normalizedExtractions,
  }) {
    return normalizedExtractions
      .map(normalizedExtraction => this.resolveComparableReading({
        normalizedExtraction,
      }))
  }

  /**
   * Answer one reading as it stands, or as one that read nothing.
   *
   * @param {{
   *   normalizedExtraction: ai.NormalizedCoverSheetExtraction
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedCoverSheetExtraction} - The reading to reduce.
   */
  resolveComparableReading ({
    normalizedExtraction,
  }) {
    const isReadingOfJudgedSheet = this.isReadingOfJudgedSheet({
      normalizedExtraction,
    })

    if (!isReadingOfJudgedSheet) {
      return this.emptyExtraction
    }

    return normalizedExtraction
  }

  /**
   * Check whether one reading is of the worksheet the judgment used.
   *
   * **Compared verbatim, including a trailing space.** `TBL-13.sheet_name` stores a worksheet's name
   * exactly as its tab is labelled, and the observed workbook's tabs carry a trailing space and a
   * stray bracket. Trimming either side here would make this pass on a name the judgment would not
   * have recognized, which is the one thing it exists to refuse.
   *
   * A reading that read no name at all is a mismatch: it cannot be shown to be of the judged
   * worksheet, and "cannot be shown" is what this guard acts on rather than "is known to differ".
   *
   * @param {{
   *   normalizedExtraction: ai.NormalizedCoverSheetExtraction
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the reading may be compared.
   */
  isReadingOfJudgedSheet ({
    normalizedExtraction,
  }) {
    return normalizedExtraction.sheetName.value === this.judgedSheetName
  }
}

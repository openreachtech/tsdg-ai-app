/*
 * The key a reading that read nothing is counted under (§6.1 step 1).
 *
 * **It cannot collide with a real key, and that is the point rather than a precaution.** Every real
 * key is `JSON.stringify` of a two-element array, so it begins with `[`; this one begins with a
 * letter. Without a marker of its own, "the model returned nothing" would compare equal to itself
 * *and* to a null value, and three readings that all found nothing would be indistinguishable from
 * three that disagreed - one is `NG-005` and the other `NG-008`, and they tell the operator to do
 * different things.
 */
const ABSENT_READING_KEY = 'absent reading'

/**
 * Steps 2 to 6 of `ENG-05`: what one field's readings agreed on, and how firmly.
 *
 * **It knows nothing about §7.2.** It is handed one field's canonical values, one per reading, in
 * the order the readings were taken, and it counts. That is what lets the same arithmetic serve a
 * debit note number, an amount, a page count and a signature flag without a branch per kind, and
 * what makes `NFR-030` checkable: the same inputs always give the same row.
 *
 * **A strict majority is required** - `agreed * 2 > total`. With three readings that means two or
 * three; with one reading it means one, so `OCR_REPEAT_COUNT=1` degrades exactly to the single
 * reading of 1.0.0 at a `1/1` agreement (`FR-144`). Three different answers are `1/3`, and the
 * most-frequent of three distinct values is not a majority: nothing is kept (`FR-143`).
 *
 * **An absent value can win, and that is a different finding from a disagreement.** Two of three
 * readings finding no amount is a majority saying there was nothing to read - `NG-005` - and the
 * row records the same null `NG-008` would, which is why `#isMajorityReached()` and not the null is
 * what tells them apart (§6.2).
 *
 * **Provenance comes from the first reading, in index order, whose value equals the consensus**
 * (step 6), and it is taken whole. A reading that produced the agreed value without locating it
 * leaves the region null rather than borrowing one from another reading, because `FR-131` wants a
 * value with no region to say so rather than outline a guess.
 */
export default class FieldConsensusResolver {
  /**
   * Constructor.
   *
   * @param {{
   *   readingFieldValues: Array<verification.ReadingFieldValue>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    readingFieldValues,
  }) {
    this.readingFieldValues = readingFieldValues
  }

  /**
   * Factory method.
   *
   * @param {{
   *   readingFieldValues: Array<verification.ReadingFieldValue>
   * }} params - Parameters of this method.
   * @returns {FieldConsensusResolver} - Instance of this class.
   */
  static create ({
    readingFieldValues,
  }) {
    return new this({
      readingFieldValues,
    })
  }

  /**
   * Resolve what the readings agreed on for this field.
   *
   * @returns {verification.FieldConsensus} - The consensus, and how many readings produced it.
   */
  resolveConsensus () {
    const comparisonKeys = this.buildComparisonKeys()

    const agreedComparisonKey = this.findAgreedComparisonKey({
      comparisonKeys,
    })

    const agreedReadingCount = this.countMatchingKeys({
      comparisonKeys,
      comparisonKey: agreedComparisonKey,
    })
    const totalReadingCount = comparisonKeys.length

    if (!this.isMajorityReached({
      agreedReadingCount,
      totalReadingCount,
    })) {
      return {
        consensusValue: null,
        currencyCode: null,
        agreedReadingCount,
        totalReadingCount,
        isMajorityReached: false,
        pageNumber: null,
        region: null,
      }
    }

    const agreedReadingFieldValue = this.findAgreedReadingFieldValue({
      comparisonKeys,
      agreedComparisonKey,
    })

    return {
      consensusValue: agreedReadingFieldValue.canonicalValue,
      currencyCode: agreedReadingFieldValue.currencyCode,
      agreedReadingCount,
      totalReadingCount,
      isMajorityReached: true,
      pageNumber: agreedReadingFieldValue.pageNumber,
      region: agreedReadingFieldValue.region,
    }
  }

  /**
   * Build the key each reading is counted under.
   *
   * @returns {Array<string>} - One key per reading, in the order the readings were taken.
   */
  buildComparisonKeys () {
    return this.readingFieldValues
      .map(readingFieldValue => this.buildComparisonKey({
        readingFieldValue,
      }))
  }

  /**
   * Build the key one reading is counted under.
   *
   * **The currency is part of the key, never a column beside it.** `100` in USD and `100` in JPY are
   * two answers, and counting them as one would report an agreement the readings never reached
   * (`DR-05`).
   *
   * @param {{
   *   readingFieldValue: verification.ReadingFieldValue
   * }} params - Parameters of this method.
   * @returns {string} - The key.
   */
  buildComparisonKey ({
    readingFieldValue,
  }) {
    if (readingFieldValue.canonicalValue === null) {
      return ABSENT_READING_KEY
    }

    return JSON.stringify([
      readingFieldValue.canonicalValue,
      readingFieldValue.currencyCode,
    ])
  }

  /**
   * Find the key the most readings produced.
   *
   * **The first of several equally frequent keys wins, and the choice never shows.** Keys tied at
   * the top cannot reach a strict majority, so the value is dropped whichever one is named - what
   * the tie-break buys is a row that comes out the same on every run (`NFR-030`).
   *
   * @param {{
   *   comparisonKeys: Array<string>
   * }} params - Parameters of this method.
   * @returns {string | null} - The key, or null when there were no readings.
   */
  findAgreedComparisonKey ({
    comparisonKeys,
  }) {
    return comparisonKeys
      .reduce(
        (agreedComparisonKey, comparisonKey) => this.resolveLeadingKey({
          comparisonKeys,
          comparisonKey,
          agreedComparisonKey,
        }),
        /** @type {string | null} */ (null)
      )
  }

  /**
   * Answer which of two keys leads: the one just counted, or the one already leading.
   *
   * @param {{
   *   comparisonKeys: Array<string>
   *   comparisonKey: string
   *   agreedComparisonKey: string | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The leading key.
   */
  resolveLeadingKey ({
    comparisonKeys,
    comparisonKey,
    agreedComparisonKey,
  }) {
    if (!this.isMoreFrequentKey({
      comparisonKeys,
      comparisonKey,
      agreedComparisonKey,
    })) {
      return agreedComparisonKey
    }

    return comparisonKey
  }

  /**
   * Answer whether one key was produced by more readings than the leading key.
   *
   * @param {{
   *   comparisonKeys: Array<string>
   *   comparisonKey: string
   *   agreedComparisonKey: string | null
   * }} params - Parameters of this method.
   * @returns {boolean} - true: it leads.
   */
  isMoreFrequentKey ({
    comparisonKeys,
    comparisonKey,
    agreedComparisonKey,
  }) {
    const comparedCount = this.countMatchingKeys({
      comparisonKeys,
      comparisonKey,
    })

    return comparedCount > this.countMatchingKeys({
      comparisonKeys,
      comparisonKey: agreedComparisonKey,
    })
  }

  /**
   * Count how many readings produced one key.
   *
   * @param {{
   *   comparisonKeys: Array<string>
   *   comparisonKey: string | null
   * }} params - Parameters of this method.
   * @returns {number} - The count.
   */
  countMatchingKeys ({
    comparisonKeys,
    comparisonKey,
  }) {
    return comparisonKeys
      .filter(comparedKey => comparedKey === comparisonKey)
      .length
  }

  /**
   * Answer whether the leading key holds a strict majority (§6.1 step 3).
   *
   * @param {{
   *   agreedReadingCount: number
   *   totalReadingCount: number
   * }} params - Parameters of this method.
   * @returns {boolean} - true: more than half the readings produced it.
   */
  isMajorityReached ({
    agreedReadingCount,
    totalReadingCount,
  }) {
    return agreedReadingCount * 2 > totalReadingCount
  }

  /**
   * Find the reading the consensus takes its provenance from (§6.1 step 6).
   *
   * @param {{
   *   comparisonKeys: Array<string>
   *   agreedComparisonKey: string | null
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - The first reading that produced the consensus.
   */
  findAgreedReadingFieldValue ({
    comparisonKeys,
    agreedComparisonKey,
  }) {
    const agreedReadingIndex = comparisonKeys.indexOf(
      /** @type {string} */ (agreedComparisonKey)
    )

    return this.readingFieldValues[agreedReadingIndex]
  }
}

/**
 * How far the readings of one run got, in the two numbers a `FAIL-` sentence substitutes
 * (`TBL-04.failure_parameters`).
 *
 * **It exists because the run that needs these numbers is the run that was abandoned.** `FAIL-01`
 * reads *"the job passed `JOB_TIMEOUT_SECONDS` after {completedReadingCount} of
 * {targetReadingCount} readings"* (`CMP-10`), and the allowance is a race the analysis loses -
 * nothing inside it gets to report where it had reached. Counting the rows the file has instead
 * would answer zero every time, because rule 14 writes the set only once it is whole (`NFR-023`).
 *
 * **One tally belongs to one run, and the worker owns it**: the processors are built once and shared
 * across every file the worker analyzes at a time (`JOB_CONCURRENCY`), so a count kept on a processor
 * would be the count of whatever else was being read alongside.
 *
 * The completed readings are held as their ordinals rather than as a number, because a property may
 * not be reassigned after the constructor - and because the ordinals say **which** readings arrived,
 * which is worth more than how many when a run has to be explained.
 */
export default class ReadingProgressTally {
  /**
   * Constructor.
   *
   * @param {{
   *   targetReadingCount: number
   *   completedReadingIndexes: Array<number>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    targetReadingCount,
    completedReadingIndexes,
  }) {
    this.targetReadingCount = targetReadingCount
    this.completedReadingIndexes = completedReadingIndexes
  }

  /**
   * Factory method.
   *
   * @param {{
   *   targetReadingCount: number
   *   completedReadingIndexes?: Array<number>
   * }} params - Parameters of this method.
   * @returns {ReadingProgressTally} - Instance of this class.
   */
  static create ({
    targetReadingCount,
    completedReadingIndexes = [],
  }) {
    return new this({
      targetReadingCount,
      completedReadingIndexes,
    })
  }

  /**
   * get: How many readings have come back so far.
   *
   * @returns {number} - The count.
   */
  get completedReadingCount () {
    return this.completedReadingIndexes.length
  }

  /**
   * Record that one reading came back.
   *
   * @param {{
   *   readingIndex: number
   * }} params - Parameters of this method.
   * @returns {void}
   */
  recordCompletedReading ({
    readingIndex,
  }) {
    this.completedReadingIndexes.push(readingIndex)
  }

  /**
   * Build what a `FAIL-01` or `FAIL-03` sentence substitutes (`DR-13`).
   *
   * **The two numbers are not the same quantity twice.** `targetReadingCount` is what the job set
   * out to take; `completedReadingCount` is what arrived, and on a failed run they differ - which is
   * the finding itself (`30-api-contract.md` §3). Neither is `BatchFileSummary.readingCount`, which
   * counts the rows that were stored.
   *
   * @returns {{
   *   targetReadingCount: number
   *   completedReadingCount: number
   * }} - The parameters.
   */
  buildFailureParameters () {
    return {
      targetReadingCount: this.targetReadingCount,
      completedReadingCount: this.completedReadingCount,
    }
  }
}

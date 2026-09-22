import FAILURE_REASON_CODE_CONSTANT_HASH from '../constants/failureReasonCode.js'

const {
  FAILURE_REASON_CODE,
} = FAILURE_REASON_CODE_CONSTANT_HASH

/**
 * A failure of analyzing one file, carrying the code the operator will be shown (`FAIL-01` to
 * `FAIL-03`).
 *
 * **It exists so a processor can say how it failed without knowing where that is written.** The
 * processor knows a document ran past the page cap; only the job knows there is a
 * `batch_files.failure_reason_code` column and a `ST-01` transition to make. Throwing a plain
 * `Error` would leave the job guessing from a message string, and a reworded message would silently
 * turn `FAIL-02` into `FAIL-03` - which matters, because `UX-06` tells the operator that one is
 * worth retrying and the other never is (`FR-023`).
 *
 * Anything thrown that is *not* one of these is `FAIL-03`: an unforeseen failure is an
 * infrastructure failure until someone classifies it, and that is the code that invites a retry.
 *
 * **It carries what the failure's sentence substitutes, not the sentence** (`DR-13` `DR-09`). Each
 * code names different values - `FAIL-02` the page count and the cap, `FAIL-01` and `FAIL-03` the
 * readings asked for against the readings that arrived (`CMP-10`) - and the values are what travel,
 * because the SPA and the report render them in the operator's own language. A failure that carried
 * a rendered clause would put English in a Japanese screen, which is the one thing `DR-13` forbids
 * outright.
 *
 * @extends {Error}
 */
export default class BatchFileAnalysisFailure extends Error {
  /**
   * Constructor.
   *
   * @param {{
   *   message: string
   *   failureReasonCode: string
   *   failureParameters: Record<string, number>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    message,
    failureReasonCode,
    failureParameters,
  }) {
    super(message)

    this.failureReasonCode = failureReasonCode
    this.failureParameters = failureParameters
  }

  /**
   * Factory method.
   *
   * @param {{
   *   message: string
   *   failureReasonCode: string
   *   failureParameters: Record<string, number>
   * }} params - Parameters of this method.
   * @returns {BatchFileAnalysisFailure} - Instance of this class.
   */
  static create ({
    message,
    failureReasonCode,
    failureParameters,
  }) {
    return new this({
      message,
      failureReasonCode,
      failureParameters,
    })
  }

  /**
   * Factory method of a document longer than the cap (`FAIL-02`).
   *
   * @param {{
   *   pageCount: number
   *   pageCap: number
   * }} params - Parameters of this method.
   * @returns {BatchFileAnalysisFailure} - Instance of this class.
   */
  static createPageCapExceeded ({
    pageCount,
    pageCap,
  }) {
    return this.create({
      message: `page count ${pageCount} is over the cap of ${pageCap}`,
      failureReasonCode: FAILURE_REASON_CODE.PAGE_CAP_EXCEEDED,
      // The two names `CMP-10` substitutes into the sentence. `pageCap` rather than `cap`: 1.0.0
      // built these at read time under the shorter name, and a renderer asked for `{pageCap}` would
      // have printed the placeholder rather than the number.
      failureParameters: {
        pageCount,
        pageCap,
      },
    })
  }

  /**
   * Factory method of a run that outlasted its allowance (`FAIL-01`).
   *
   * @param {{
   *   timeoutSeconds: number
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {BatchFileAnalysisFailure} - Instance of this class.
   */
  static createJobTimedOut ({
    timeoutSeconds,
    readingProgressTally,
  }) {
    return this.create({
      message: `analysis ran past its allowance of ${timeoutSeconds} seconds`,
      failureReasonCode: FAILURE_REASON_CODE.JOB_TIMEOUT,

      /*
       * How far the readings had got when the allowance ran out, which is what `FAIL-01`'s sentence
       * asks for: *"after {completedReadingCount} of {targetReadingCount} readings"*. The tally is
       * the only thing that can answer it - the allowance is a race the analysis loses, so nothing
       * inside the run gets to report where it had reached, and the file holds no rows to count
       * because rule 14 writes the set only once it is whole.
       */
      failureParameters: readingProgressTally.buildFailureParameters(),
    })
  }

  /**
   * Factory method of a provider that could not be reached or would not answer (`FAIL-03`).
   *
   * **`FAIL-03` absorbed a second cause in 1.0.1 rather than gaining a fourth code**: "the provider
   * refused" and "only two of three readings arrived" are the same event seen from the loop, and
   * `UX-06` grades a failure by what to do about it - press retry - rather than by what went wrong
   * inside. The counts are what tell the two apart on the screen (`NFR-023`).
   *
   * @param {{
   *   batchFileId: number
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {BatchFileAnalysisFailure} - Instance of this class.
   */
  static createProviderCallFailed ({
    batchFileId,
    readingProgressTally,
  }) {
    return this.create({
      message: `no answer from the ai provider for batch file: ${batchFileId}`,
      failureReasonCode: FAILURE_REASON_CODE.PROVIDER_CALL_FAILED,
      failureParameters: readingProgressTally.buildFailureParameters(),
    })
  }

  /**
   * Read the code to record for anything thrown while analyzing a file.
   *
   * @param {{
   *   error: Error
   * }} params - Parameters of this method.
   * @returns {string} - The `FAIL-` code.
   */
  static resolveFailureReasonCode ({
    error,
  }) {
    if (error instanceof this) {
      return error.failureReasonCode
    }

    return FAILURE_REASON_CODE.PROVIDER_CALL_FAILED
  }

  /**
   * Read what to substitute into the sentence of anything thrown while analyzing a file.
   *
   * **Null for anything this class did not raise**, and `TBL-04.failure_parameters` is nullable for
   * exactly that reason: an unforeseen failure is recorded as `FAIL-03` because that is the code that
   * invites a retry, but nobody counted anything, and inventing a `0 of 3` would put a measurement in
   * the operator's sentence that was never taken. The renderer falls back to the code alone.
   *
   * @param {{
   *   error: Error
   * }} params - Parameters of this method.
   * @returns {Record<string, number> | null} - What the sentence substitutes, or null.
   */
  static resolveFailureParameters ({
    error,
  }) {
    if (error instanceof this) {
      return error.failureParameters
    }

    return null
  }
}

import {
  setTimeout as scheduleTimeout,
} from 'timers/promises'

import {
  env,
} from '../globals/_.js'

import EnvironmentLimit from '../tools/EnvironmentLimit.js'

import BatchFileAnalysisFailure from './BatchFileAnalysisFailure.js'

const MILLISECONDS_PER_SECOND = 1000

/*
 * How long one file may take when `JOB_TIMEOUT_SECONDS` (`ENV-024`) says nothing usable.
 *
 * **Fifteen minutes, raised from five in 1.0.0, because the allowance now covers
 * `OCR_REPEAT_COUNT` provider calls rather than one** (`FR-025`). Leaving it at five would fail
 * healthy files part way through their readings, and rule 14 means such a file stores nothing at
 * all - so the number that used to be generous became the one that lost the work
 * (`90-operations.md` §2.5).
 *
 * Still short enough that a hung provider call does not hold a concurrency slot for an afternoon.
 */
const FALLBACK_TIMEOUT_SECONDS = 900

/**
 * Gives one file's analysis an allowance, and fails it as `FAIL-01` when it runs past (`ENV-024`).
 *
 * **The allowance exists because a stuck run is invisible otherwise.** A provider that accepts a
 * request and never answers leaves the file reading `processing` forever, which the operator cannot
 * tell from a file that is merely slow - and cannot retry, because `ST-01` only allows a retry from
 * `failed`. Timing out converts an indefinite wait into a stated failure the operator can act on.
 *
 * The timer is a promise cancelled through an `AbortController` rather than a handle cleared later,
 * so finishing early disposes of it without anything having to remember an id.
 *
 * **Known limit: the work is abandoned, not cancelled.** Racing stops this class waiting; it cannot
 * stop an HTTP request already in flight, because nothing below here takes an `AbortSignal`. A
 * provider that answers after the allowance therefore still runs to completion in the background
 * and may write its result to a file already recorded as failed. Closing that hole means threading
 * cancellation through the AI layer, which is a change to `AI-02` rather than to this class.
 */
export default class AnalysisTimeLimit {
  /**
   * Constructor.
   *
   * @param {{
   *   timeoutSeconds: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    timeoutSeconds,
  }) {
    this.timeoutSeconds = timeoutSeconds
  }

  /**
   * Factory method.
   *
   * @param {{
   *   timeoutSeconds?: number
   * }} [params] - Parameters of this method.
   * @returns {AnalysisTimeLimit} - Instance of this class.
   */
  static create ({
    timeoutSeconds = EnvironmentLimit.create({
      limitLike: env.JOB_TIMEOUT_SECONDS,
      fallbackLimit: FALLBACK_TIMEOUT_SECONDS,
    })
      .generateLimit(),
  } = {}) {
    return new this({
      timeoutSeconds,
    })
  }

  /**
   * Run one analysis, and fail it if it outlasts the allowance.
   *
   * @param {{
   *   runAnalysis: () => Promise<void>
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   * @throws {BatchFileAnalysisFailure} - When the analysis runs past the allowance.
   */
  async runWithinLimit ({
    runAnalysis,
    readingProgressTally,
  }) {
    const abortController = new AbortController()

    return Promise.race([
      this.runAndDisposeTimer({
        runAnalysis,
        abortController,
      }),
      this.failAfterAllowance({
        abortController,
        readingProgressTally,
      }),
    ])
  }

  /**
   * Run the analysis, and dispose of the timer however it ends.
   *
   * @param {{
   *   runAnalysis: () => Promise<void>
   *   abortController: AbortController
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async runAndDisposeTimer ({
    runAnalysis,
    abortController,
  }) {
    return runAnalysis()
      .finally(() => abortController.abort())
  }

  /**
   * Wait out the allowance, and fail if it is ever reached.
   *
   * An aborted wait means the analysis finished first, and answers nothing: the race has already
   * settled on the other side, so this side must not turn a normal finish into a timeout.
   *
   * @param {{
   *   abortController: AbortController
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   * @throws {BatchFileAnalysisFailure} - When the allowance is reached.
   */
  async failAfterAllowance ({
    abortController,
    readingProgressTally,
  }) {
    const hasReachedAllowance = await scheduleTimeout(
      this.generateTimeoutMilliseconds(),
      true,
      {
        signal: abortController.signal,
      }
    )
      .catch(() => false)

    if (!hasReachedAllowance) {
      return
    }

    throw this.buildTimeoutFailure({
      readingProgressTally,
    })
  }

  /**
   * Build the failure a run that outlasted its allowance is recorded as.
   *
   * **The tally is relayed rather than read here.** How far the readings got is the run's business
   * and this class only holds a clock, but `FAIL-01`'s sentence names those two numbers (`CMP-10`) -
   * so the failure is built where the allowance is known, from a count kept where the readings are
   * taken.
   *
   * @param {{
   *   readingProgressTally: import('./ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {BatchFileAnalysisFailure} - The failure.
   */
  buildTimeoutFailure ({
    readingProgressTally,
  }) {
    return BatchFileAnalysisFailure.createJobTimedOut({
      timeoutSeconds: this.timeoutSeconds,
      readingProgressTally,
    })
  }

  /**
   * Express the allowance in the unit a timer takes.
   *
   * @returns {number} - Milliseconds.
   */
  generateTimeoutMilliseconds () {
    return this.timeoutSeconds * MILLISECONDS_PER_SECOND
  }
}

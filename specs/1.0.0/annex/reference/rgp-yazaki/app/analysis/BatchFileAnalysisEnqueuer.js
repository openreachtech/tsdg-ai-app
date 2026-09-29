import AnalyzeBatchFileJobDispatcher from '../jobs/analyze-batch-file/AnalyzeBatchFileJobDispatcher.js'

/*
 * How many times a file just put on the queue has waited for its cover sheet, which is none.
 *
 * Stated rather than left out: the worker counts up from whatever the body carries, and a payload
 * that named the count only after the first wait would make the first run the one case nobody
 * declared (`JOB-01` DN branch step 2).
 */
const FIRST_COVER_SHEET_WAIT_COUNT = 0

/**
 * Puts the files it is handed on the queue for `JOB-01` to analyze.
 *
 * **Storing a file does not lead here** (`FR-152`). Only two operations ask a batch to be read:
 * `API-M004` with the ones that failed, and `API-M006` with all of them - which is specified and
 * not implemented in this version (`ADR-24`). Until 1.0.2 this class stood at the end of the upload
 * path, and it needed no renaming to leave: it is named for what it does rather than for who asks.
 *
 * **Enqueueing happens after the transaction has committed**, never inside it. A job carries only
 * an id and the worker reads the row, so a job dispatched inside a transaction that then rolled
 * back would name a file that never existed - and the worker would fail on it, loudly, for a batch
 * the operator never successfully created.
 *
 * One dispatcher serves the whole call rather than one per file: a retry can carry every file of a
 * batch, and opening a queue connection for each of two hundred would spend more time connecting
 * than enqueueing.
 */
export default class BatchFileAnalysisEnqueuer {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFileIds: Array<number>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFileIds,
  }) {
    this.batchFileIds = batchFileIds
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFileIds: Array<number>
   * }} params - Parameters of this method.
   * @returns {BatchFileAnalysisEnqueuer} - Instance of this class.
   */
  static create ({
    batchFileIds,
  }) {
    return new this({
      batchFileIds,
    })
  }

  /**
   * Enqueue one job per file, and let go of the connection afterwards.
   *
   * **A failed enqueue is raised, never swallowed.** `BaseJobDispatcher#dispatchJob()` catches
   * everything `queue.add()` throws and answers with a response carrying `hasError()`, and it logs
   * nothing - so a caller that ignores the return value turns a dead queue into a silent success.
   * The file would sit in `waiting` with no job, the operator would be told it went
   * through, and nothing sweeps `waiting` rows: `API-M004` re-enqueues `failed` files only.
   *
   * @returns {Promise<void>}
   * @throws {Error} - One or more files did not reach the queue.
   */
  async enqueueAnalysisJobs () {
    const jobDispatcher = await this.createJobDispatcher()

    try {
      const failedDispatches = await this.dispatchEachFile({
        jobDispatcher,
      })

      this.refuseIncompleteEnqueue({
        failedDispatches,
      })
    } finally {
      await jobDispatcher.teardown()
    }
  }

  /**
   * Create the dispatcher this upload enqueues through.
   *
   * @returns {Promise<AnalyzeBatchFileJobDispatcher>} - The dispatcher.
   */
  async createJobDispatcher () {
    return AnalyzeBatchFileJobDispatcher.createAsync()
  }

  /**
   * Enqueue the files one after another over the one connection.
   *
   * Sequential rather than concurrent: they share a dispatcher, and the queue writes are cheap
   * enough that parallelism would buy nothing but a harder failure to read.
   *
   * **Every file is attempted even after one fails**, and the failures are collected rather than
   * thrown from inside the fold. A transient refusal on the second of twenty would otherwise
   * abandon the remaining eighteen, which is a worse outcome than the one that prompted it.
   *
   * The fold accumulates every outcome and the selection happens after it, so the callback does one
   * thing: each file's answer is appended whatever it was, and the ones that went on the queue -
   * which answer null - are dropped at the end.
   *
   * @param {{
   *   jobDispatcher: AnalyzeBatchFileJobDispatcher
   * }} params - Parameters of this method.
   * @returns {Promise<Array<FailedDispatch>>} - One entry per file that did not reach the queue.
   */
  async dispatchEachFile ({
    jobDispatcher,
  }) {
    const dispatchOutcomes = await this.batchFileIds.reduce(
      async (previousOutcomes, batchFileId) => {
        const outcomes = await previousOutcomes

        const dispatchOutcome = await this.dispatchOneFile({
          jobDispatcher,
          batchFileId,
        })

        return outcomes.concat(dispatchOutcome)
      },
      /** @type {Promise<Array<FailedDispatch | null>>} */ (Promise.resolve([]))
    )

    return dispatchOutcomes
      .filter(dispatchOutcome => dispatchOutcome !== null)
  }

  /**
   * Enqueue one file, and say so when it did not go on the queue.
   *
   * @param {{
   *   jobDispatcher: AnalyzeBatchFileJobDispatcher
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<FailedDispatch | null>} - Why it failed, or null when the job is queued.
   */
  async dispatchOneFile ({
    jobDispatcher,
    batchFileId,
  }) {
    const dispatchResponse = await jobDispatcher.dispatchJob({
      body: {
        batchFileId,
        coverSheetWaitCount: FIRST_COVER_SHEET_WAIT_COUNT,
      },
      keepsConnection: true,
    })

    if (!dispatchResponse.hasError()) {
      return null
    }

    return {
      batchFileId,
      errorMessage: dispatchResponse.errorMessage,
    }
  }

  /**
   * Raise when any file did not reach the queue.
   *
   * The dispatcher's own message travels with the ids, because the framework carries it on the
   * response and writes it nowhere - this is the only place it can still be read.
   *
   * @param {{
   *   failedDispatches: Array<FailedDispatch>
   * }} params - Parameters of this method.
   * @returns {void}
   * @throws {Error} - One or more files did not reach the queue.
   */
  refuseIncompleteEnqueue ({
    failedDispatches,
  }) {
    if (failedDispatches.length === 0) {
      return
    }

    const details = failedDispatches
      .map(failedDispatch => `${failedDispatch.batchFileId}: ${failedDispatch.errorMessage}`)
      .join(', ')

    throw new Error(`JOB-01 was not enqueued - ${details}`)
  }
}

/**
 * @typedef {{
 *   batchFileId: number
 *   errorMessage: string | null
 * }} FailedDispatch
 */

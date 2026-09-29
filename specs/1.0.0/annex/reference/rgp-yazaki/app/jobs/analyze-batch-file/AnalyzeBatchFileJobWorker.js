import {
  BaseJobWorker,
} from '@openreachtech/renchan-job-bullmq'

import FILE_PROCESSING_LIMIT_CONSTANT_HASH from '../../constants/fileProcessingLimit.js'

import {
  env,
} from '../../globals/_.js'

import AnalysisTimeLimit from '../../analysis/AnalysisTimeLimit.js'
import BatchFileAnalysisFailure from '../../analysis/BatchFileAnalysisFailure.js'
import BatchFileOutcomeLogger from '../../analysis/BatchFileOutcomeLogger.js'
import BatchFileProcessingRecorder from '../../analysis/BatchFileProcessingRecorder.js'
import BatchProgressPublisher from '../../analysis/BatchProgressPublisher.js'
import ReadingProgressTally from '../../analysis/ReadingProgressTally.js'
import VerificationBatchSettler from '../../analysis/VerificationBatchSettler.js'
import VerificationBatchStarter from '../../analysis/VerificationBatchStarter.js'

import EnvironmentLimit from '../../tools/EnvironmentLimit.js'

import BatchFile from '../../../sequelize/models/BatchFile.js'
import BatchFileKind from '../../../sequelize/models/BatchFileKind.js'

import AnalyzeBatchFileJobDispatcher from './AnalyzeBatchFileJobDispatcher.js'
import AnalyzeBatchFileJobManifest from './AnalyzeBatchFileJobManifest.js'

const {
  FILE_PROCESSING_LIMIT,
} = FILE_PROCESSING_LIMIT_CONSTANT_HASH

/*
 * How many files this worker analyzes at once when `JOB_CONCURRENCY` (`ENV-023`) says nothing
 * usable. Fixed rather than adaptive (`NFR-011`): each slot may hold a provider call, so the number
 * is the operator's lever on cost and on how hard the host is pushed, not something to infer.
 */
const FALLBACK_CONCURRENCY = 3

const MILLISECONDS_PER_SECOND = 1000

/*
 * How many times a body that predates the counter has waited, which nobody recorded and is therefore
 * none. A job enqueued before this deploy carries no count, and starting it at zero gives that file
 * the full three waits rather than none (`JOB-01` DN branch step 2).
 */
const FIRST_COVER_SHEET_WAIT_COUNT = 0

/**
 * Analyzes one uploaded file (`JOB-01`).
 *
 * **The worker holds no analysis of its own.** It reads the row the body names, finds the processor
 * that claims the file's kind, and runs it. What a cover sheet or a debit note actually goes
 * through lives in `app/analysis/`, so this file stays about the queue: the two procedures are long
 * enough that keeping them here would bury the plumbing.
 *
 * @extends {BaseJobWorker}
 */
export default class AnalyzeBatchFileJobWorker extends BaseJobWorker {
  /** @override */
  static get ManifestCtor () {
    return AnalyzeBatchFileJobManifest
  }

  /**
   * Build the worker options.
   *
   * @override
   * @param {{
   *   concurrency?: number
   * }} [params] - Parameters of this method.
   * @returns {import('bullmq').WorkerOptions} - Worker options.
   */
  buildOptionHash ({
    concurrency = EnvironmentLimit.create({
      limitLike: env.JOB_CONCURRENCY,
      fallbackLimit: FALLBACK_CONCURRENCY,
    })
      .generateLimit(),
  } = {}) {
    return {
      ...super.buildOptionHash(),

      concurrency,
    }
  }

  /**
   * Analyze the file the body names.
   *
   * **Whether the file is ready is asked inside the run, not before it** (`ST-01`). Step 1 of the DN
   * branch moves the file to `processing` and announces it; only then does the job discover that the
   * cover sheet has not settled, and the honest thing is to put the file back in `waiting` rather
   * than to have never picked it up.
   *
   * @override
   * @param {{
   *   body: {
   *     batchFileId: number
   *     coverSheetWaitCount?: number
   *   }
   *   context: import('../../contexts/AppJobContext.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async executeJob ({
    body,
    context,
  }) {
    const batchFile = await this.findBatchFile({
      batchFileId: body.batchFileId,
    })

    const processor = this.resolveProcessor({
      batchFile,
      context,
    })

    return this.runAnalysis({
      batchFile,
      processor,
      context,
      // A body enqueued before this counter existed carries none, and gets the full three waits.
      coverSheetWaitCount: body.coverSheetWaitCount
        ?? FIRST_COVER_SHEET_WAIT_COUNT,
    })
  }

  /**
   * Run one analysis from end to end, recording what became of it.
   *
   * **A file that fails does not fail the queue.** The error is written onto the file as a `FAIL-`
   * code and the run returns normally, because a thrown job would hand the decision to BullMQ's
   * retry semantics - and `DR-07` says a retry is the operator's deliberate act, not the queue's
   * reflex (`40-backend.md` §5.3).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   processor: import('../../analysis/BaseBatchFileAnalysisProcessor.js').default
   *   context: import('../../contexts/AppJobContext.js').default
   *   coverSheetWaitCount: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async runAnalysis ({
    batchFile,
    processor,
    context,
    coverSheetWaitCount,
  }) {
    const recorder = this.createProcessingRecorder({
      batchFileId: batchFile.id,
    })

    const progressPublisher = this.createProgressPublisher({
      batchFile,
      context,
    })

    const outcomeLogger = this.createOutcomeLogger()

    const readingProgressTally = this.createReadingProgressTally({
      processor,
    })

    await this.analyzeAndRecord({
      batchFile,
      processor,
      recorder,
      progressPublisher,
      readingProgressTally,
      coverSheetWaitCount,
    })

    await this.logJobOutcome({
      outcomeLogger,
      batchFileId: batchFile.id,
      readingProgressTally,
    })

    await this.settleBatch({
      batchFile,
      progressPublisher,
    })
  }

  /**
   * Create the recorder one run's `ST-01` transitions are written through.
   *
   * @param {{
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {BatchFileProcessingRecorder} - The recorder.
   */
  createProcessingRecorder ({
    batchFileId,
  }) {
    return BatchFileProcessingRecorder.create({
      batchFileId,
    })
  }

  /**
   * Create the tally this run's readings are counted onto (`FAIL-01` `FAIL-03`).
   *
   * **One per run, and owned here rather than by the processor.** The processors are built once and
   * shared, and this worker analyzes `JOB_CONCURRENCY` files through them at a time, so a count kept
   * on a processor would mix the readings of files being read alongside each other.
   *
   * How many readings to expect is the processor's to say: a cover sheet takes none until `ENV-043`
   * turns `AI-05` on, and a sentence claiming it was part way through three would be inventing them.
   *
   * @param {{
   *   processor: import('../../analysis/BaseBatchFileAnalysisProcessor.js').default
   *   ReadingProgressTallyCtor?: typeof ReadingProgressTally
   * }} params - Parameters of this method.
   * @returns {ReadingProgressTally} - The tally.
   */
  createReadingProgressTally ({
    processor,
    ReadingProgressTallyCtor = ReadingProgressTally,
  }) {
    return ReadingProgressTallyCtor.create({
      targetReadingCount: processor.targetReadingCount,
    })
  }

  /**
   * Create the publisher one run's progress is announced through (`API-S001`).
   *
   * The broker comes off the share rather than being built here, because it holds Redis connections
   * and this method runs once per analyzed file.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   context: import('../../contexts/AppJobContext.js').default
   * }} params - Parameters of this method.
   * @returns {BatchProgressPublisher} - The publisher.
   */
  createProgressPublisher ({
    batchFile,
    context,
  }) {
    return BatchProgressPublisher.create({
      verificationBatchId: batchFile.VerificationBatchId,
      subscriptionBroker: context.share.subscriptionBroker,
    })
  }

  /**
   * Create the logger one run's outcome is recorded through (`OPS-09`).
   *
   * @param {{
   *   BatchFileOutcomeLoggerCtor?: typeof BatchFileOutcomeLogger
   * }} [params] - Parameters of this method.
   * @returns {BatchFileOutcomeLogger} - The logger.
   */
  createOutcomeLogger ({
    BatchFileOutcomeLoggerCtor = BatchFileOutcomeLogger,
  } = {}) {
    return BatchFileOutcomeLoggerCtor.create({
      jobName: this.Ctor.jobName,
      timber: this.engine.timber,
    })
  }

  /**
   * Mark the batch as running, which only the first of its files actually does.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async startBatch ({
    batchFile,
  }) {
    await VerificationBatchStarter.create({
      verificationBatchId: batchFile.VerificationBatchId,
    })
      .startBatch()
  }

  /**
   * Analyze the file, and record either the result or the failure.
   *
   * **A file that is not ready yet goes back to `waiting` and returns from inside the try** (§5.3 DN
   * branch step 2). Inside, because a re-enqueue that the queue refuses must reach the catch: a file
   * left `waiting` with no job is unrecoverable - `API-M004` re-enqueues `failed` files only, and
   * nothing sweeps `waiting` - so a dead queue has to become `FAIL-03`, which an operator can retry.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   processor: import('../../analysis/BaseBatchFileAnalysisProcessor.js').default
   *   recorder: BatchFileProcessingRecorder
   *   progressPublisher: BatchProgressPublisher
   *   readingProgressTally: ReadingProgressTally
   *   coverSheetWaitCount: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async analyzeAndRecord ({
    batchFile,
    processor,
    recorder,
    progressPublisher,
    readingProgressTally,
    coverSheetWaitCount,
  }) {
    try {
      await this.startBatch({
        batchFile,
      })

      await recorder.recordStart()

      await this.publishFileState({
        progressPublisher,
        batchFileId: batchFile.id,
      })

      await this.analyzeOrReturnFile({
        batchFile,
        processor,
        recorder,
        readingProgressTally,
        coverSheetWaitCount,
      })
    } catch (error) {
      this.logWorkerError({
        error,
      })

      await this.recordFailure({
        recorder,
        error,
      })
    }

    /*
     * Outside the try, because every ending moves the file and the operator is owed the news of it.
     * Reaching here through the catch means the file now reads `failed`; reaching it after a wait
     * means the file reads `waiting` again - both are state changes like any other (`ST-01`).
     */
    await this.publishFileTransition({
      progressPublisher,
      batchFileId: batchFile.id,
    })
  }

  /**
   * Analyze the file, or hand it back to the queue because it is not ready to be (§5.3 step 2).
   *
   * **The branch lives in its own method so that both endings are awaited by the caller's `try`.**
   * A rejection from either has to reach that catch: a re-enqueue the queue refuses would otherwise
   * leave the file in `waiting` with no job behind it, and nothing sweeps `waiting` - `API-M004`
   * re-enqueues `failed` files only. Recorded as `FAIL-03`, the operator can retry it.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   processor: import('../../analysis/BaseBatchFileAnalysisProcessor.js').default
   *   recorder: BatchFileProcessingRecorder
   *   readingProgressTally: ReadingProgressTally
   *   coverSheetWaitCount: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async analyzeOrReturnFile ({
    batchFile,
    processor,
    recorder,
    readingProgressTally,
    coverSheetWaitCount,
  }) {
    const isReadyToAnalyze = await processor.isReadyToAnalyze({
      batchFile,
      coverSheetWaitCount,
    })

    if (!isReadyToAnalyze) {
      return this.returnFileToWaiting({
        batchFile,
        recorder,
        coverSheetWaitCount,
      })
    }

    return this.analyzeWithinAllowance({
      batchFile,
      processor,
      recorder,
      readingProgressTally,
    })
  }

  /**
   * Analyze the file inside the allowance, and record that it was analyzed (`FAIL-01`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   processor: import('../../analysis/BaseBatchFileAnalysisProcessor.js').default
   *   recorder: BatchFileProcessingRecorder
   *   readingProgressTally: ReadingProgressTally
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async analyzeWithinAllowance ({
    batchFile,
    processor,
    recorder,
    readingProgressTally,
  }) {
    await this.createAnalysisTimeLimit()
      .runWithinLimit({
        runAnalysis: () => processor.analyzeBatchFile({
          batchFile,
          readingProgressTally,
        }),
        readingProgressTally,
      })

    return recorder.recordCompletion()
  }

  /**
   * Write the failure onto the file, and give up quietly if even that cannot be written.
   *
   * The last line of the failure path has nowhere left to report to. A throw from here would
   * escape `runAnalysis()` and take the job with it, which is the outcome the whole method exists
   * to prevent - so it is logged and swallowed. What it costs is a file left mid-transition; what
   * it buys is that the batch still settles below, and every other file of the batch still runs.
   *
   * @param {{
   *   recorder: BatchFileProcessingRecorder
   *   error: Error
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async recordFailure ({
    recorder,
    error,
  }) {
    try {
      await recorder.recordFailure({
        failureReasonCode: BatchFileAnalysisFailure.resolveFailureReasonCode({
          error,
        }),
        // What the failure's sentence substitutes, or null when nothing counted anything: an
        // unforeseen error is recorded as `FAIL-03` because that is the code that invites a retry,
        // and a `0 of 3` nobody measured would be worse than the code alone (`DR-13`).
        failureParameters: BatchFileAnalysisFailure.resolveFailureParameters({
          error,
        }),
      })
    } catch (recordingError) {
      this.logWorkerError({
        error: recordingError,
      })
    }
  }

  /**
   * Announce that the file has changed state, and carry on if the announcement fails.
   *
   * **A refused publish must not fail the run.** The event is an optimization over `API-Q002`, so
   * losing one costs a watching client a single polling interval (`ADR-13` `NFR-022`) - where a throw
   * from here would abandon a file mid-analysis over a screen update. Logged rather than swallowed
   * silently, because a broker that refuses every time is a real fault and the log is where it
   * surfaces (`OPS-09`).
   *
   * @param {{
   *   progressPublisher: BatchProgressPublisher
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async publishFileState ({
    progressPublisher,
    batchFileId,
  }) {
    try {
      await progressPublisher.publishFileStateChange({
        batchFileId,
      })
    } catch (error) {
      this.logWorkerError({
        error,
      })
    }
  }

  /**
   * Announce a file that has moved, and the batch figures that moved with it.
   *
   * **Two events rather than one**, in the order `40-backend.md` §8 lists them: the file changed
   * state, and then the batch's done count moved. They answer different questions, and a client that
   * only read the second would still have to learn which files failed (`CMP-04`).
   *
   * **Every ending of a run comes through here**, including a file handed back to `waiting` for its
   * cover sheet. The figures have not moved in that case and the frame says so, which is cheaper than
   * a second path that publishes only half of what the others do.
   *
   * @param {{
   *   progressPublisher: BatchProgressPublisher
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async publishFileTransition ({
    progressPublisher,
    batchFileId,
  }) {
    try {
      await progressPublisher.publishFileStateChange({
        batchFileId,
      })

      await progressPublisher.publishBatchProgress()
    } catch (error) {
      this.logWorkerError({
        error,
      })
    }
  }

  /**
   * Create the allowance one run is held to (`FAIL-01`).
   *
   * @returns {AnalysisTimeLimit} - The allowance.
   */
  createAnalysisTimeLimit () {
    return AnalysisTimeLimit.create()
  }

  /**
   * Record what became of the file, and carry on if even that cannot be recorded.
   *
   * **A line that cannot be written must not undo the work it describes.** By the time this runs
   * the file already reads `completed` or `failed`, so a throw would escape a run whose row is
   * already settled - the same trap `settleBatch()` documents below. The failure is reported the
   * only way still open to it, as an error line, and the run goes on.
   *
   * @param {{
   *   outcomeLogger: BatchFileOutcomeLogger
   *   batchFileId: number
   *   readingProgressTally: ReadingProgressTally
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async logJobOutcome ({
    outcomeLogger,
    batchFileId,
    readingProgressTally,
  }) {
    try {
      await outcomeLogger.logOutcome({
        batchFileId,
        readingProgressTally,
      })
    } catch (error) {
      this.logWorkerError({
        error,
      })
    }
  }

  /**
   * Settle the batch, which does nothing until its last file has finished.
   *
   * **This runs after the file has already been recorded, so it must not throw.** A failure here
   * would escape a run whose file already reads `completed`, and `ST-01` never re-enqueues a
   * completed file - so the batch would sit in `processing` with no operator action able to
   * recover it, and `API-M004` could not help because it only re-enqueues `failed` files. Logged
   * and swallowed instead: the next file of the batch settles it, and the last one leaves a
   * logged error rather than a silently unfinished batch.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   progressPublisher: BatchProgressPublisher
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async settleBatch ({
    batchFile,
    progressPublisher,
  }) {
    try {
      const isSettledBatch = await VerificationBatchSettler.create({
        verificationBatchId: batchFile.VerificationBatchId,
      })
        .settleBatch()

      if (!isSettledBatch) {
        return
      }

      /*
       * Only the run that actually settles the batch announces it. The settler is called after every
       * file and answers false while anything is still going, so publishing regardless would raise
       * the operator's completion notice once per file of the batch (`FR-022`).
       */
      await progressPublisher.publishBatchCompletion()
    } catch (error) {
      this.logWorkerError({
        error,
      })
    }
  }

  /**
   * Find the file to analyze, with the kind that decides how.
   *
   * @param {{
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<import('../../../sequelize/models/BatchFile.js').BatchFileEntity>} - The file.
   * @throws {Error} - When no such file exists.
   */
  async findBatchFile ({
    batchFileId,
  }) {
    const batchFile = await BatchFile.findByPk(batchFileId, {
      include: [
        BatchFileKind,
      ],
    })

    if (!batchFile) {
      throw new Error(`no batch file of id: ${batchFileId}`)
    }

    return /** @type {*} */ (batchFile)
  }

  /**
   * Resolve which processor analyzes this file.
   *
   * Throws on a kind nothing claims rather than skipping the file. A row can only reach an
   * unclaimed kind through a master table nobody seeded or a migration half applied, and in both
   * cases a file quietly reported as analyzed would be worse than a loud failure (`TBL-12`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   context: import('../../contexts/AppJobContext.js').default
   * }} params - Parameters of this method.
   * @returns {import('../../analysis/BaseBatchFileAnalysisProcessor.js').default} - The processor.
   * @throws {Error} - When no processor claims the file's kind.
   */
  resolveProcessor ({
    batchFile,
    context,
  }) {
    const batchFileKindName = batchFile.BatchFileKind.name

    const processor = context.share
      .bulkBatchFileAnalysisProcessorsLoader
      .resolveProcessor({
        batchFileKindName,
      })

    if (!processor) {
      throw new Error(`no analysis processor of batch file kind: ${batchFileKindName}`)
    }

    return processor
  }

  /**
   * Hand the file back to `waiting` and put a later job in the queue for it (`ST-01`).
   *
   * **`started_at` is cleared with the transition**, so the duration finally recorded measures the
   * work on the document rather than the wait for its cover sheet. Re-queueing the file in place
   * would leave it reading `processing` in nobody's hands for as long as the wait lasted.
   *
   * The state change itself is announced by the run's own trailing publish, which every ending
   * shares: a file handed back has moved, exactly as one that completed or failed has.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   recorder: BatchFileProcessingRecorder
   *   coverSheetWaitCount: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   * @throws {Error} - When the later job did not reach the queue.
   */
  async returnFileToWaiting ({
    batchFile,
    recorder,
    coverSheetWaitCount,
  }) {
    await recorder.recordReturnToWaiting()

    return this.requeueLater({
      batchFileId: batchFile.id,
      coverSheetWaitCount: coverSheetWaitCount + 1,
    })
  }

  /**
   * Put this file back on the queue to be looked at again shortly.
   *
   * **One job goes back, and the count goes with it.** A debit note whose cover sheet is still being
   * parsed has nothing to judge against yet, and holding a concurrency slot open while waiting would
   * let one slow cover sheet stall the whole batch.
   *
   * **What stops the loop is the count, not a deadline.** 1.0.0 bounded the wait by the clock because
   * the payload was one id; 1.0.1 puts the count in the payload, so three waits of
   * `COVER_SHEET_WAIT_SECONDS` cost three round trips whatever the host is doing - and the third one
   * lets the note be judged without the Excel side rather than waiting on a worker that may have been
   * killed mid-run (`40-backend.md` §5.3, `ENV-026`).
   *
   * **A refused enqueue is raised rather than ignored.** `dispatchJob()` catches what the queue
   * throws and answers with `hasError()`, so a caller that read nothing would leave a `waiting` file
   * with no job behind it - and nothing sweeps `waiting`. Raising it lets the catch above record
   * `FAIL-03`, which the operator can retry (`API-M004`).
   *
   * @param {{
   *   batchFileId: number
   *   coverSheetWaitCount: number
   *   waitSeconds?: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   * @throws {Error} - When the job did not reach the queue.
   */
  async requeueLater ({
    batchFileId,
    coverSheetWaitCount,
    waitSeconds = EnvironmentLimit.create({
      limitLike: env.COVER_SHEET_WAIT_SECONDS,
      fallbackLimit: FILE_PROCESSING_LIMIT.COVER_SHEET_WAIT_SECONDS,
    })
      .generateLimit(),
  }) {
    const dispatcher = await this.createJobDispatcher()

    const dispatchResponse = await dispatcher.dispatchJob({
      body: {
        batchFileId,
        coverSheetWaitCount,
      },
      optionHash: {
        delay: waitSeconds * MILLISECONDS_PER_SECOND,
      },
    })

    if (dispatchResponse.hasError()) {
      throw new Error(`JOB-01 was not re-enqueued for batch file: ${batchFileId} - ${dispatchResponse.errorMessage}`)
    }
  }

  /**
   * Create the dispatcher a wait is re-enqueued through.
   *
   * Built here rather than held on the share, because waiting is the uncommon path and a queue
   * connection opened at start-up for it would be idle in every process that never waits.
   *
   * @returns {Promise<AnalyzeBatchFileJobDispatcher>} - The dispatcher.
   */
  async createJobDispatcher () {
    return AnalyzeBatchFileJobDispatcher.createAsync()
  }

  /**
   * Handle the queue reporting the job done.
   *
   * @override
   * @returns {void}
   */
  onJobCompleted () {
    // noop: what the run did to the file is recorded on the file itself (`ST-01`).
  }

  /**
   * Handle the queue reporting the job failed.
   *
   * @override
   * @param {{
   *   error: Error
   * }} params - Parameters of this method.
   * @returns {void}
   */
  onJobFailed ({
    error,
  }) {
    this.logWorkerError({
      error,
    })
  }

  /**
   * Handle a progress report.
   *
   * **Stays a noop, and `API-S001` is published from the transitions themselves instead**
   * (`publishFileState()` and `publishFileTransition()`). `40-backend.md` §5.1 names this hook as the
   * place progress is published, and it cannot be: BullMQ calls it as a synchronous event listener,
   * so a promise returned from here is never awaited and a publish that failed would surface as an
   * unhandled rejection rather than in the log.
   *
   * Routing through it would also mean writing the payload into the queue with `updateProgress()`
   * only to read it back out, for events whose truth is already in the rows the transition just
   * wrote.
   *
   * @override
   * @returns {void}
   */
  onJobProgress () {
    // noop: see above.
  }

  /**
   * Handle the worker itself failing.
   *
   * @override
   * @param {{
   *   error: Error
   * }} params - Parameters of this method.
   * @returns {void}
   */
  onWorkerError ({
    error,
  }) {
    this.logWorkerError({
      error,
    })
  }

  /**
   * Log a failure of this worker.
   *
   * @param {{
   *   error: Error
   * }} params - Parameters of this method.
   * @returns {void}
   */
  logWorkerError ({
    error,
  }) {
    this.engine.timber.error({
      jobName: this.Ctor.jobName,
      message: error.message,
    })
  }
}

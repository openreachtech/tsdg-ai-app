import {
  BaseJobDispatcher,
} from '@openreachtech/renchan-job-bullmq'

import AppJobEngine from '../../AppJobEngine.js'

import AnalyzeBatchFileJobManifest from './AnalyzeBatchFileJobManifest.js'

/*
 * One run per enqueue (`40-backend.md` §5.1). BullMQ would already stop at one without this, but
 * leaving it to the default would make "no automatic retry" look like something nobody chose. It
 * was chosen: each run calls the provider, so a silent retry multiplies cost and hides a systematic
 * failure behind eventual success. The operator sees `failed` and presses retry (`API-M004` `UC-03`).
 */
const SINGLE_ATTEMPT = 1

/**
 * Enqueues `JOB-01` `analyze-batch-file`, one job per file.
 *
 * **Two callers reach it, and the upload is neither** (`JOB-01` `FR-152`): `API-M006` with every
 * file of one batch, and `API-M004` with the failed files of one batch. Both enqueue the same way -
 * the file's id and nothing more - so a retry is not a second kind of run, just another run.
 * **Nothing else writes this queue.**
 *
 * **`API-M006` is specified and not implemented in 1.0.2** (`ADR-24`), so a 1.0.2 host enqueues
 * nothing at all. That is the version's headline rather than an oversight: 1.0.0 and 1.0.1 enqueued
 * from `API-M002` and `API-M003` as each file was stored, and a call put back on the upload path
 * would restore that silently - a worker handed a file it should not have been given cannot tell.
 *
 * @extends {BaseJobDispatcher}
 */
export default class AnalyzeBatchFileJobDispatcher extends BaseJobDispatcher {
  /** @override */
  static get EngineCtor () {
    return AppJobEngine
  }

  /** @override */
  static get ManifestCtor () {
    return AnalyzeBatchFileJobManifest
  }

  /** @override */
  static get optionHash () {
    return {
      defaultJobOptions: {
        attempts: SINGLE_ATTEMPT,
      },
    }
  }
}

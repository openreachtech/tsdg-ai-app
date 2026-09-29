import {
  BaseJobWorker,
} from '@openreachtech/renchan-job-bullmq'

import {
  Op,
} from 'sequelize'

import GeminiUploadedFile from '../../../sequelize/models/GeminiUploadedFile.js'

import PurgeExpiredProviderUploadsJobManifest from './PurgeExpiredProviderUploadsJobManifest.js'

const WORKER_CONCURRENCY = 1

/**
 * Clears the records of provider uploads the provider has already deleted (`JOB-02` `ST-03`).
 *
 * **It calls no provider.** The Files API deletes a file about 48 hours after it arrives, so by the
 * time a row here is past its `expires_at` there is nothing left to delete; a delete call would fail
 * noisily every night for no benefit. What this removes is *our record* of the upload, so `TBL-08`
 * keeps answering "what is currently out there" truthfully (`OPS-08`).
 *
 * That is also why it is the one job in this system that touches nothing but its own table, and why
 * it runs one at a time: two sweeps racing would delete the same rows twice over.
 *
 * @extends {BaseJobWorker}
 */
export default class PurgeExpiredProviderUploadsJobWorker extends BaseJobWorker {
  /** @override */
  static get ManifestCtor () {
    return PurgeExpiredProviderUploadsJobManifest
  }

  /**
   * Build the worker options.
   *
   * @override
   * @returns {import('bullmq').WorkerOptions} - Worker options.
   */
  buildOptionHash () {
    return {
      ...super.buildOptionHash(),

      concurrency: WORKER_CONCURRENCY,
    }
  }

  /**
   * Run the sweep.
   *
   * Answers with the count alone: a worker's return value is stored in Redis, and the rows this
   * deleted are of no use to anybody once they are gone.
   *
   * @override
   * @param {{
   *   context: import('../../contexts/AppJobContext.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<{
   *   deletedCount: number
   * }>} - How many records were cleared.
   */
  async executeJob ({
    context,
  }) {
    const deletedCount = await this.deleteExpiredUploadedFiles({
      sweptAt: context.now,
    })

    this.logDeletedCount({
      context,
      deletedCount,
    })

    return {
      deletedCount,
    }
  }

  /**
   * Delete every record whose file the provider has already expired.
   *
   * @param {{
   *   sweptAt: Date
   * }} params - Parameters of this method.
   * @returns {Promise<number>} - How many rows were deleted.
   */
  async deleteExpiredUploadedFiles ({
    sweptAt,
  }) {
    return GeminiUploadedFile.destroy({
      where: {
        expiresAt: {
          [Op.lte]: sweptAt,
        },
      },
    })
  }

  /**
   * Log what the sweep removed.
   *
   * Logged even when it removed nothing, because "the sweep ran and found nothing" and "the sweep
   * did not run" are the two things this line exists to tell apart (`OPS-09`).
   *
   * @param {{
   *   context: import('../../contexts/AppJobContext.js').default
   *   deletedCount: number
   * }} params - Parameters of this method.
   * @returns {void}
   */
  logDeletedCount ({
    context,
    deletedCount,
  }) {
    context.timber.info({
      jobName: this.Ctor.jobName,
      deletedCount,
    })
  }

  /**
   * Handle the queue reporting the job done.
   *
   * @override
   * @returns {void}
   */
  onJobCompleted () {
    // noop: what the sweep did is already logged by the job itself.
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
   * @override
   * @returns {void}
   */
  onJobProgress () {
    // noop: the sweep is one statement and has no progress to report.
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

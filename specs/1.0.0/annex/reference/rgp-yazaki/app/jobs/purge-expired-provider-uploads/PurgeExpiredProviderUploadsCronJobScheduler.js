import {
  BaseCronJobScheduler,
} from '@openreachtech/renchan-job-bullmq'

import AppJobEngine from '../../AppJobEngine.js'

import PurgeExpiredProviderUploadsJobManifest from './PurgeExpiredProviderUploadsJobManifest.js'

/**
 * Registers the nightly run of `JOB-02` (`ST-03`).
 *
 * The schedule itself is not here: this class only says which queue is repeated and under which id,
 * and `AppJobSchedulerService` states when. That split is the framework's, and it is what lets the
 * hour be changed without touching the job.
 *
 * @extends {BaseCronJobScheduler}
 */
export default class PurgeExpiredProviderUploadsCronJobScheduler extends BaseCronJobScheduler {
  /** @override */
  static get EngineCtor () {
    return AppJobEngine
  }

  /** @override */
  static get ManifestCtor () {
    return PurgeExpiredProviderUploadsJobManifest
  }

  /** @override */
  static get schedulerId () {
    return 'purge-expired-provider-uploads-nightly'
  }
}

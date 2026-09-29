import {
  BaseJobDispatcher,
} from '@openreachtech/renchan-job-bullmq'

import AppJobEngine from '../../AppJobEngine.js'

import PurgeExpiredProviderUploadsJobManifest from './PurgeExpiredProviderUploadsJobManifest.js'

/**
 * Enqueues `JOB-02` `purge-expired-provider-uploads`.
 *
 * The scheduler is what normally enqueues it, nightly. This exists so the sweep can also be run on
 * demand - after a day the worker was down, or while answering "is anything of ours still on the
 * provider" during handover (`OPS-08`).
 *
 * @extends {BaseJobDispatcher}
 */
export default class PurgeExpiredProviderUploadsJobDispatcher extends BaseJobDispatcher {
  /** @override */
  static get EngineCtor () {
    return AppJobEngine
  }

  /** @override */
  static get ManifestCtor () {
    return PurgeExpiredProviderUploadsJobManifest
  }
}

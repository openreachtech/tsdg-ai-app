import {
  BaseJobManifest,
} from '@openreachtech/renchan-job-bullmq'

/**
 * Queue name and payload shape of `JOB-02` `purge-expired-provider-uploads`.
 *
 * **The body is empty on purpose.** The job's whole input is the clock: every row past its
 * `expires_at` goes, whichever batch it belonged to. A body naming a batch or a date would be a
 * parameter nobody has a reason to vary, and would let a scheduled run and a manual run mean
 * different things.
 *
 * @extends {BaseJobManifest}
 */
export default class PurgeExpiredProviderUploadsJobManifest extends BaseJobManifest {
  /** @override */
  static get jobName () {
    return 'purge-expired-provider-uploads'
  }

  /** @override */
  static get bodySchema () {
    return {}
  }
}

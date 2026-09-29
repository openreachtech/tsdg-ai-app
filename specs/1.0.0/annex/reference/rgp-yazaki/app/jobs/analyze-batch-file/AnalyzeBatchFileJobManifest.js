import {
  BaseJobManifest,
} from '@openreachtech/renchan-job-bullmq'

import {
  ScalarHash,
} from '@openreachtech/mentsu-schema'

const {
  Integer,
} = ScalarHash

/**
 * Queue name and payload shape of `JOB-01` `analyze-batch-file`.
 *
 * **The body carries an id and one counter** (`40-backend.md` §5.3). Everything a run needs - the
 * batch the file belongs to, its kind, its stored path, the model in force - is read from the
 * database once the worker starts. A job that waited in the queue across a deploy therefore acts on
 * current data, and the retry of `API-M004` re-reads rather than replays: a body carrying those
 * values would freeze them at enqueue time, which is exactly what a retry exists to escape.
 *
 * **`coverSheetWaitCount` is the exception, and it is one because there is nowhere to read it from.**
 * How many times *this dispatch* has waited for the cover sheet is state of the dispatch rather than
 * of the document, and a `TBL-04` column would make a transient wait look like an attribute of the
 * file - visible on the screen, surviving the run, and meaning nothing after it. A body from before
 * this counter existed simply arrives without it and starts at zero.
 *
 * @extends {BaseJobManifest}
 */
export default class AnalyzeBatchFileJobManifest extends BaseJobManifest {
  /** @override */
  static get jobName () {
    return 'analyze-batch-file'
  }

  /** @override */
  static get bodySchema () {
    return {
      batchFileId: Integer,
      coverSheetWaitCount: Integer,
    }
  }
}

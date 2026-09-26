# hor-renchan-job-bullmq
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-renchan-job-bullmq/ -->

**Read the source above whenever this leaves a question open.**

`@openreachtech/renchan-job-bullmq` is the job framework: **BullMQ queues on Redis**, wrapped in renchan base classes. A job is a **template of class files in one directory** under `app/jobs/<job-name>/`. Two long-running processes share **one Redis** (`pm2.config.cjs`):

- **GraphQL API** (`server/index.js`) — handles requests and **enqueues** jobs (producer).
- **Job Daemon** (`scripts/startJobDaemon.js`) — **runs** the workers (consumer) and **publishes progress** back over Redis PubSub.

## The file triple — one directory per job

| File | Base class | Responsibility |
| --- | --- | --- |
| `<Name>JobManifest.js` | `BaseJobManifest` | the **queue name** (`jobName`) + the **body schema** |
| `<Name>JobWorker.js` | `BaseJobWorker` | **consume**: `executeJob()` + lifecycle hooks |
| `<Name>JobDispatcher.js` | `BaseJobDispatcher` | **produce**: enqueue + per-queue `optionHash` |
| `<Name>CronJobScheduler.js` / `<Name>IntervalJobScheduler.js` | `BaseCronJobScheduler` / `BaseIntervalJobScheduler` | (scheduled jobs only) register a repeatable job |

```
app/jobs/send-report-email/
├── SendReportEmailJobManifest.js    # queue name + body schema
├── SendReportEmailJobWorker.js      # consume: executeJob + hooks
├── SendReportEmailJobDispatcher.js  # produce: enqueue + queue options
└── .keepDirectory.js
```

- The directory name is **kebab-case and equals the `jobName`** (the BullMQ queue name).
- Classes are PascalCase with the fixed suffixes `JobManifest` / `JobWorker` / `JobDispatcher` (and `CronJobScheduler` / `IntervalJobScheduler`).
- Keep the layout identical across jobs. Structural comments are English; domain-explanation comments in the real files are Japanese — match the surrounding code.

## Manifest — queue name + body schema

```js
import { BaseJobManifest } from '@openreachtech/renchan-job-bullmq'
import { ScalarHash } from '@openreachtech/mentsu-schema'

const { Integer, Text } = ScalarHash

export default class ContentGenerationPublicLpJobManifest extends BaseJobManifest {
  /** @override */ static get jobName () { return 'content-generation-public-lp' }

  /** @override */
  static get bodySchema () {
    return {
      jobId: Integer,
      accessToken: Text,
    }
  }
}
```

- `jobName` is the single source of truth for the queue name; `bodySchema` validates the enqueue payload. Scalars come from `ScalarHash` (`Text` / `Integer` / …) of `@openreachtech/mentsu-schema`.
- The body is normalized/denormalized by the framework for Redis transport, so it may carry rich values (`Date`, `BigNumber`), not just primitives. Keep the body **minimal** — usually just ids/tokens; load the full row from the DB in the worker.

## Worker — executeJob + lifecycle hooks

```js
import { BaseJobWorker } from '@openreachtech/renchan-job-bullmq'
import AlphaJobManifest from './AlphaJobManifest.js'

export default class AlphaJobWorker extends BaseJobWorker {
  /** @override */ static get ManifestCtor () { return AlphaJobManifest }

  /** @override */
  async executeJob ({
    body,
    context,
    parcel,
  }) {
    this.timber.log(`[${this.Ctor.jobName}] started with body:`, body)

    // ... the work ...

    // WARNING: the return value is stored in Redis. Return only the minimum necessary —
    // never arrays of entities / large blobs (memory pressure + instability).
    return {
      executedAt: new Date().toISOString(),
    }
  }

  // Implement the four lifecycle hooks too (return null for a fire-and-forget job):
  //   onJobCompleted / onJobFailed / onJobProgress / onWorkerError
}
```

- `body` is the validated, normalized payload; `context` is the per-job DI object (Context); `parcel` wraps the BullMQ job (`parcel.jobModel.job` for `updateProgress`, token, abort signal).
- The four lifecycle hooks are **abstract and must be implemented**. Use `this.timber` for console logging and `this.ensureLogger()` for the per-job file logger.
- **`executeJob`'s return value is persisted in Redis — keep it tiny.**
- Make `executeJob` **idempotent** (BullMQ may re-run). Expensive jobs checkpoint progress to the DB and resume on retry.

## Dispatcher — enqueue + per-queue options

```js
import { BaseJobDispatcher } from '@openreachtech/renchan-job-bullmq'
import ContentGenerationJobEngine from '../../ContentGenerationJobEngine.js'
import SendReportEmailJobManifest from './SendReportEmailJobManifest.js'

export default class SendReportEmailJobDispatcher extends BaseJobDispatcher {
  /** @override */ static get EngineCtor () { return ContentGenerationJobEngine }
  /** @override */ static get ManifestCtor () { return SendReportEmailJobManifest }

  /** @override */
  static get optionHash () {
    return {
      defaultJobOptions: {
        attempts: 3,
      },
    }
  }
}
```

`static optionHash` is BullMQ `QueueOptions` (producer defaults). **DRY:** when several dispatchers share one Engine, define a base app dispatcher that sets `EngineCtor` once, and let each job dispatcher set only `ManifestCtor`:

```js
// SampleBaseAppJobDispatcher.js
export default class SampleBaseAppJobDispatcher extends BaseJobDispatcher {
  /** @override */ static get EngineCtor () { return SampleJobEngine }
}

// jobs/alpha/AlphaJobDispatcher.js
export default class AlphaJobDispatcher extends SampleBaseAppJobDispatcher {
  /** @override */ static get ManifestCtor () { return AlphaJobManifest }
}
```

## Enqueuing

**From a resolver / handler** — use the request-scope `JobDispatcherProvider` (connection reuse):

```js
await context.share.jobDispatcherProvider.dispatchJob({
  DispatcherCtor: SendReportEmailJobDispatcher,
  body: {
    sessionToken,
  },
})
```

**Standalone (one-off script)** — self-boot, dispatch, inspect the response, tear down:

```js
const dispatcher = await AlphaJobDispatcher.createAsync()

const response = await dispatcher.dispatchJob({
  body: {
    // ...
  },
})

if (response.hasError()) {
  // response.errorMessage
}
if (response.hasResponse()) {
  // response.createDispatchedAt()  → Date the job was enqueued
}

await dispatcher.teardown()
```

- `dispatchJob({ body })` validates `body` against the Manifest schema, `queue.add`s, and returns a **DispatcherResponse** (`hasError()` / `errorMessage` / `hasResponse()` / `createDispatchedAt()`). It auto-`teardown()`s the queue connection unless `keepsConnection: true` is passed.
- `JobDispatcherProvider` (`app/tools/JobDispatcherProvider.js`) caches one Dispatcher per `DispatcherCtor` and dispatches with `keepsConnection: true`; the request Share holds one, torn down on process exit. **Do not `createAsync()` a fresh dispatcher per request.**

## Engine / Share / Context / RedisConnection

```js
export default class ContentGenerationJobEngine extends BaseJobEngine {
  /** @override */
  static get config () {
    return {
      workersPath: rootPath.to('app/jobs'),      // Daemon scans here for BaseJobWorker subclasses
      schedulersPath: rootPath.to('app/jobs'),   // scheduler registration scans here
      redisConfig: RedisConnection
        .create()
        .generateConnectionOptions(),
    }
  }

  /** @override */ static get ShareCtor () { return ContentGenerationJobShare }
  /** @override */ static get ContextCtor () { return ContentGenerationJobContext }

  /** @override */
  static get standardErrorCodeHash () {
    return {
      Unknown: '100.X000.001',
      InvalidRequest: '103.X000.001',
    }
  }

  /** @override */ static get savingLogFilePath () { return rootPath.to('logs/content-generation-job.log') }
}
```

- **Engine** — the one config object every Dispatcher / Worker / Scheduler references via `EngineCtor`. `savingLogFilePathLookup` (optional) maps specific `jobName`s to their own log files. `createAsync({ subscriptionBroker })` builds the Share, injecting the progress broker; enqueue-only callers omit it (broker stays `null`).
- **Share** — per-**process** DI (`BaseJobShare`): `processClerk`, `env`, `timber`, and the `subscriptionBroker` (or `null`).
- **Context** — per-**job** DI (`BaseJobContext`), created fresh for each execution (`createAsync({ engine })`) and handed to `executeJob`. Put per-job dependency resolution here so the worker stays thin.
- **RedisConnection** (`app/queue/RedisConnection.js`) reads `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` and produces two shapes:
  - `generateConnectionOptions()` — for BullMQ queues/workers. **Must include `maxRetriesPerRequest: null`** (BullMQ requirement).
  - `generatePubSubOptions()` — for the subscription broker (no `maxRetriesPerRequest`).
- **The API process and the Job Daemon must point at the same Redis** — that instance is both the queue and the progress-PubSub channel.
- **Connect once at boot, reuse per job** — the broker and each worker's BullMQ connection are established once at Daemon startup and live for the process; never re-create one inside a worker.

## Registration — there is none for workers

`JobWorkersDaemon` **auto-discovers every `BaseJobWorker` subclass under the engine's `workersPath`** (`DeepBulkClassLoader` scans recursively), binds each to its Manifest's `jobName`, and installs SIGINT/SIGTERM graceful shutdown. **A new job directory is picked up with no registration file.** On boot it logs one `Listening: <jobName>` per queue.

The only aggregation file in the skill is the **scheduler service** (`BaseJobSchedulerService.collectScheduleInputs()`), which lists every cron/interval schedule — needed only for scheduled jobs.

Two boot shapes:

| Path | When | Shape |
| --- | --- | --- |
| **A — simple** | no progress broker | `JobWorkersDaemon.createAsync({ EngineCtor })` → `daemon.startDaemon()` |
| **B — with a broker** | any worker publishes progress | build `SubscriptionBroker` → `Engine.createAsync({ subscriptionBroker })` → `JobWorkersDaemon.loadWorkerCtors({ engine })` → `.create({ engine, WorkerCtors }).startDaemon()` |

```js
// Path B (scripts/startJobDaemon.js)
await activate() // Sequelize (workers touch the DB)

const subscriptionBroker = SubscriptionBroker.create({
  config: {
    redisOptions: RedisConnection.create().generatePubSubOptions(),
  },
})

const engine = await ContentGenerationJobEngine.createAsync({
  subscriptionBroker,
})

const workerCtors = await JobWorkersDaemon.loadWorkerCtors({
  engine,
})

await JobWorkersDaemon
  .create({
    engine,
    WorkerCtors: workerCtors,
  })
  .startDaemon()
```

`startDaemon()` `setupWorker()`s each worker (creates the BullMQ `Worker`, waits until ready, attaches the event sink) and attaches SIGINT/SIGTERM handlers that `teardownWorker()` all workers.

**pm2** (`pm2.config.cjs`) runs the two long-lived processes: **`GraphQL API`** (producer) and **`Job Daemon`** (consumer). Schedule registration is run on demand, not as a pm2 app.

## Queues — one queue per job, not one per service

**One queue == one job directory == one Manifest `jobName`.** To add a queue, add a job directory whose Manifest returns a new `jobName`. The source repo deliberately splits the *same* work into two queues (`content-generation-internal` with `{ jobId }`, `content-generation-public-lp` with `{ jobId, accessToken }`) so they scale and subscribe independently.

- **Share logic via an app base worker, but place that base OUTSIDE `workersPath`.** The Daemon boots *every* `BaseJobWorker` subclass found under `workersPath` (`app/jobs`), and an abstract base has no `jobName`, so leaving it under `app/jobs/**` **crashes daemon startup**. Only concrete workers go under `app/jobs/**`; shared bases live elsewhere in `app/`.
- Run a **subset** of queues per Daemon with `skipJobHash` (`{ [jobName]: true }`), which filters those worker constructors out at boot.

## Per-queue tuning — retries, concurrency, rate limit

| Knob | Where | Shape |
| --- | --- | --- |
| retry attempts | Dispatcher `static optionHash` (BullMQ `QueueOptions`) | `defaultJobOptions: { attempts: 3 }` |
| concurrency, rate limiter | Worker `buildOptionHash()` (BullMQ `WorkerOptions`) | `concurrency`, `limiter` |

```js
/** @override */
buildOptionHash () {
  return {
    ...super.buildOptionHash(),

    concurrency: 5,
  }
}
```

Spread `super.buildOptionHash()` (it supplies `connection`) before adding your keys. Because both knobs are per class, two queues sharing a base worker can still carry different attempts / concurrency / limiter.

## Progress → GraphQL subscription (only if you need it)

A worker in the Daemon **publishes** progress on a `channel` namespaced by a `scope`; a GraphQL subscription resolver in the API process **subscribes** with the **same channel + scope**, over the shared Redis PubSub broker. The worker overrides `get channel ()`, `buildScope ({ jobModel })` (reads `jobModel.denormalizedBody`) and `publishProgress ({ topic, event })` (returns `null` when `this.subscriptionBroker` is absent); the resolver overrides `get channel ()` and `generateChannelQuery ({ variables })` to match. Checklist: identical channel string, identical scope keys, same Redis, Daemon injects the broker (Path B) while the enqueue path does not (publish becomes a no-op).

full text: `.claude/skills/hor-renchan-job-bullmq/references/subscriptions.md`

## Cron / interval jobs (not needed here)

`BaseCronJobScheduler` (`{ cronExpression }`) / `BaseIntervalJobScheduler` (`{ millisecond, isImmediately }`) declare `EngineCtor` + `ManifestCtor` + `schedulerId`, are listed in `BaseJobSchedulerService.collectScheduleInputs()` with a matching `schedulerId`, and are registered by a **one-shot** script (`startAllSchedulers()` → `process.exit(0)`; `stopAllSchedulers()` removes them without stopping the Daemon). Full text: `.claude/skills/hor-renchan-job-bullmq/references/daemon-and-scheduler.md`.

## What this skill does not state

Recorded so an absence is not read as a rule — these are ours to decide:

- **Transactions and commit ordering.** The skill never mentions `transaction`, `afterCommit`, or commits at all. It shows no way to defer an enqueue until a Sequelize transaction commits; every enqueue example is a bare `await …dispatchJob(…)` inside a handler. Nothing here settles dispatch-after-commit.
- **The retry default.** The only retry surface named is `defaultJobOptions.attempts` in the Dispatcher's `optionHash`, always shown as `attempts: 3`. The skill **never says what applies when `optionHash` is omitted**, and never mentions `backoff`, `removeOnComplete`/`removeOnFail`, or any other job option. "No automatic retry" is not stated anywhere — you must set the value explicitly and confirm BullMQ's own default yourself.
- **A job time limit.** The skill names no timeout, TTL, `lockDuration`, or stalled-job setting under any name. The only worker-side options it names are `concurrency` and `limiter`.
- **Enqueuing from a REST renderer, concretely.** The skill's description covers "enqueuing from a GraphQL/REST resolver" and `queues.md` names "integration REST" as an enqueue source, but **every code example is a GraphQL resolver** using `context.share.jobDispatcherProvider`. Whether a REST renderer's context exposes the same `share.jobDispatcherProvider` is not shown.
- **A per-service queue.** The skill's only rule is one queue per job directory; it never proposes or discusses a single shared queue for a whole service.

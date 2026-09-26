# #run-execution  Running a run outside the request
<!-- spec: run-execution @ sha256:4ca6fbdac9306de4df4f941e497e1e158f33e86789d53ab295f9ccf85c37d5e6 -->
<!-- repositories: backend -->

Constraint: the job is dispatched only after the creating transaction commits. A
            transaction that rolls back dispatches nothing

Constraint: one queue per service, so the heaviest operation can be scaled alone (#nfr)

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent, and the main session read the skill in full -->  <!-- wall-time: ~1200s -->
      <!--
      Three use cases and five acceptance criteria, each checked for reach. **None reaches
      forward.** Every one is answerable against a product holding `#run-contract`,
      `#provider-layer` and `#run-record` and nothing later: the POST that issues a run key
      exists, `AiRunStatusRecorder` already moves a run through its five statuses, and both
      reason codes the criteria name — `TIME_LIMIT_EXCEEDED` and `PROVIDER_CALL_FAILED` —
      were built by `#run-contract`.

      **The finding of this gate was not in the spec. It was in the code `#run-record` left.**
      `AiRunStatusRecorder`'s class docblock records an open concurrency window and names the
      feature that has to close it: its terminal-status guard reads the run and then writes it,
      which is two statements, so a second writer settling the run in between passes the guard
      on the status it read. That feature said the window belonged to "whichever of
      `#run-execution` and `#run-cancel` introduces the second concurrent writer", and left it
      because neither existed.

      **This is that feature, and the owner decided to close it here.** BullMQ delivers
      at-least-once — a worker that stalls has its job re-queued — so this feature can put two
      workers on one run, which is exactly the second writer. The fifth criterion says a run
      reaches "exactly one terminal state", and under at-least-once delivery that is a claim
      the current guard cannot make.

      What was approved, to be built at checkpoints 3 and 5: the terminal statuses move into
      the `WHERE` of the transition write, and the affected-row count decides the outcome —
      zero means another writer settled the run first, one means this writer won. **The
      read-then-write guard stays in front of it**, so a refusal still names itself rather than
      arriving as a silent no-op, which is the property `#run-record` spent four audit rounds
      establishing.

      The two alternatives were put and declined: deferring to `#run-cancel` leaves the fifth
      criterion resting on a delivery guarantee nobody makes, and configuring the queue never
      to double-deliver trades the race for a stalled run that never restarts — which
      contradicts use case 2 outright.

      **Criterion 3 was read and the reading recorded** ([[Q85]]). It names a model call, and
      §11 says the concrete job of a service belongs to that service — `#asset-media-extraction`,
      seventh. At this gate nothing calls a model, so the criterion is taken as a statement
      about the queue's retry policy: a job runs once, is never retried automatically, and a
      provider failure is recorded as `PROVIDER_CALL_FAILED`. That is checkable here by failing
      a job and observing no second delivery. Recorded so checkpoint 9 does not read this gate's
      pass as evidence that a model was ever called.
      -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — hof-uiux-context covers the shared UI/UX context, and this product declares no frontend row; digests: none taken -->  <!-- wall-time: ~1500s -->
      <!--
      Three use cases walked end to end on paper. **Two walk without a gap. The first did not,
      and the gap was in the code rather than in the spec.**

      **Use case 3 — a run going too long stops by itself.** Both halves are already stated:
      the non-functional section fixes the run time limit at **300 seconds** ("a run still going
      past it ends as failed"), and `TIME_LIMIT_EXCEEDED` is in
      `constants/aiRunFailureReasonConstants.cjs`, built by `#run-contract`. Nothing to settle.

      **Use case 2 — a run accepted before a restart is still executed.** The queue's store is
      declared and real: `docker-compose.development.yml` runs `redis:7.4`, bound to loopback
      only, with a `redis-cli ping` healthcheck, and the non-functional section names Redis 7.4
      as "the queue's store". `ioredis` is in `package.json`; **the queue library itself is
      not**, so checkpoint 5 will report it as a dependency and it goes in on an `install/`
      branch like any other. That is work, not a gap in the use case.

      **Use case 1 — the client gets its run key at once and the work happens afterwards.** The
      POST exists and answers with the run key (`#run-contract`). What does not exist is the
      thing the first acceptance criterion is written against: `AiRunAcceptor#saveAiRun()` is a
      bare `AiRun.create()` with **no transaction at all**, so "a transaction that rolls back
      dispatches nothing" is not a claim anything here could fail. A criterion nothing can fail
      is not met — it is unchecked.

      **Settled with the owner as a design decision, not a spec change**, so nothing was routed
      to `/hora-spec`. The renderer opens the transaction through `BaseRenchanModel`'s own
      `beginTransaction()`, `saveAiRun()` gains a `transaction` parameter **defaulted to null**,
      and the dispatch is registered on `transaction.afterCommit()`. Additive: the acceptor's
      body is unchanged and every existing caller keeps working, which is what the charter asks
      for over rewriting a module that has already passed acceptance.

      Two alternatives were put and declined. Dispatching straight after the `await` leaves the
      criterion's second clause vacuous and arms the trap for whoever later wraps the accept
      path — the failure this criterion exists to prevent. Having the acceptor own the
      transaction itself reads tidier now and has to be unpicked at `#asset-media-extraction`,
      which will need several tables written inside one.

      **What this buys is that the criterion becomes literally testable**: open a transaction,
      let it roll back, observe that nothing was enqueued.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- n/a: this feature adds no table and no operation, which is the checkpoint's own not-applicable clause, and it is confirmed three ways rather than taken from §11's opening line. §11 carries `### Background jobs`, `### Use cases` and `### Acceptance criteria` and no `### RESTful API`, where §12, §13, §15 and §20 each carry one. It adds no row to the data model. And `.hora/contracts/1.0.0/client-api.md` states the case itself: "The `worker` server's only consumer is the API server in the same repository, so it is cut no contract: a job payload and the database schema are closed inside the repository" — so there is no contract for a schema to agree with. The job payload type and the queue's own constants are deliberately NOT pulled forward to here: the reason this checkpoint holds types and constants is that checkpoint 4's stub needs them, and checkpoint 4 is not applicable either. They land at checkpoint 5, beside the modules that define them. -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation at all, which is the checkpoint's own not-applicable clause. The stub exists so the frontend gate can build against something before the backend gate finishes; this product declares no frontend row, and this feature adds no operation for a stub to shadow. The POST the dispatch hangs off is `#run-contract`'s, already built and already stubbed there. -->
- [x] 5. The modules the implementation needs  <!-- skills: hor-renchan-job-bullmq, hor-constant-definition, hor-type-interface, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-sequelize-model, hor-database-design, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1 catalog + 1 digester + 4 units + 1 reconciliation; wall-time: ~5400s -->
      <!--
      Eleven modules, all resolving, and the two that crossed a unit boundary reconciled by hand.

      **The catalog was searched once, before anything was written**, which is what the checkpoint
      asks for. It answered: reuse `@openreachtech/renchan-job-bullmq` for the queue connection and
      the dispatch; write the after-commit registration, the 300-second time limit and the
      conditional terminal write ourselves, because nothing tracked covers any of the three. The
      package was installed on its own branch, and `@openreachtech/mentsu-schema` with it — the job
      manifest imports `ScalarHash` from it, and it had only ever been a transitive dependency, so
      the import resolved by accident of a flat `node_modules`.

      **What the four units built.** The per-process engine and its Redis connection
      (`app/queue/`); the base job triple every AI-run job extends, outside the daemon's
      `workersPath` so auto-discovery cannot find an abstract worker and crash on boot
      (`app/aiRun/jobs/`); the module that hangs the enqueue off `transaction.afterCommit()`, with
      `saveAiRun()` gaining a defaulted `transaction` parameter and nothing else; and the
      conditional terminal write.

      **Three traps were named in the briefs and all three were real.** The house dispatcher example
      sets `attempts: 3`, which would have violated the third criterion outright — it is `1` here,
      with the reason beside it and a test asserting the whole option hash. A base worker under
      `workersPath` crashes the daemon at boot. And the dispatcher closes its own Redis connection
      after every call unless told not to: worse than a connection per run, since the queue opened
      once at `createAsync()` is shut after the first dispatch and the second run enqueues against
      a closed queue.

      **Two findings came back that no brief anticipated.** Sequelize runs `afterCommit` hooks from
      a `finally` even when the COMMIT itself failed, so a run whose commit failed still gets its job
      enqueued while no row exists ([[Q86]]) — verified in `node_modules` rather than taken on
      report. And the equipped job skill documents a surface the installed package does not have
      ([[Q87]]), which would have sent checkpoint 7's daemon down a boot path that does not exist.

      **The two units that met in the middle disagreed, and the owner settled both.** Unit 4 built a
      conditional write that throws on a lost race, keeping one idiom for every "your write did not
      happen"; unit 2's worker called three `*Once` siblings answering a boolean, because a job
      re-delivered for a finished run is an ordinary event under at-least-once delivery and throwing
      would mark every duplicate failed. Approved: add the boolean siblings, sharing one guard chain
      with their throwing counterparts rather than copying it.

      **And my own brief for that was wrong, which the implementer caught.** I wrote that `false`
      must mean the run stopped standing unsettled *between the read and the write* — the narrow
      race — which left the common case, a duplicate delivery of a long-settled run, still throwing.
      The rule is now one meaning with three causes: already settled, outraced, or **no such run**
      — the third being [[Q86]]'s mitigation, which lands through the worker's existing "told no,
      write nothing further" path with no extra code.

      **The `hooks: false` a unit needed was replaced rather than kept.** `AiRun`'s `beforeBulkUpdate`
      refuses any bulk write of the status, so the conditional write could only land by switching
      hooks off — through the very door that class's own docblock lists as one it cannot close.
      `writesAiRunStatusInBulk()` now accepts a `where` that provably excludes every terminal
      status, read from the same constant the recorder builds its condition from; everything else is
      refused exactly as before, and the refusal's own message was reworded because it had stopped
      being true.

      1700 tests in `tests/__tests__/` across 54 suites and 273 in `tests/_orders/`, both green on
      the first run. `npx eslint .` clean — after two errors of my own: a Python helper rewrote two
      environment declarations with CRLF throughout (the second time in this repository, already
      [[Q64]]), and a `toThrow()` with no message would have passed had the losing write thrown for
      the wrong reason.
      -->
- [x] 6. Actual API  <!-- n/a: this feature adds no API operation, which is the checkpoint's own not-applicable clause, and checkpoint 3 established it three ways rather than by eye. §11 carries no `### RESTful API` section where §12, §13, §15 and §20 each do; it adds no row to the data model; and `.hora/contracts/1.0.0/client-api.md` states that the worker server is cut no contract because its only consumer is the API server in the same repository. The POST this feature hangs a dispatch off is `#run-contract`'s, already built and already accepted -- what changes there is a wiring, not an operation, and checkpoint 7 owns it. The acceptance criteria this checkpoint would otherwise back with tests are backed at checkpoint 5 instead, where the modules that carry them were written: attempts of exactly 1 for the third, the time-limit race for the fourth, and the conditional write for the fifth. -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern, hor-renchan-job-bullmq, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; wall-time: ~1900s -->
      <!--
      **The placement decision came first, as this checkpoint's delegate order requires, and it was
      walked rather than assumed.** Worker, request-based: the processing is a write; it is heavy by
      the spec's own words ("a run calls a model and fetches files from elsewhere; either can be slow
      or down") and by a 300-second limit; the client system is the one asking, so it is a job
      enqueued from the request rather than a side effect after the response.

      Two findings from that walk are worth keeping. A post-worker was not merely the wrong answer
      but an **unavailable** one — the placement skill tells the post-worker story only for GraphQL,
      and this accept path is a REST renderer with no such hook. And the skill **never says when a
      dispatch may happen relative to a commit**: the after-commit rule is §11's own, so there is no
      conflict, but also no support, and all of it rests on `AiRunJobDispatchRegistrar`.

      **The implementer disagreed with my design reading and was right.** I proposed a registry
      resolving a run's category to its dispatcher, empty today, refusing an unregistered category by
      name. It built an abstract `static get JobDispatcherCtor ()` on `BaseAiRunPostRenderer`
      instead, beside the `aiRunCategory` that file already declares — because the renderer **is**
      the service and already holds that fact, so looking it up in a table adds an indirection
      carrying no new information. The refusal it wanted is the one the file's own idiom already
      gives: a renderer that names no dispatcher refuses by name the first time it is asked, with no
      empty map and no registration ordering to get wrong. What survived from my reading is the part
      that mattered: `#asset-media-extraction` supplies both members and its own job directory, and
      nothing here invents them.

      The long-lived dispatcher that reading was really carrying became `JobDispatcherProvider` on
      the REST share — one instance per dispatcher class per process, pooling the **promise** so two
      concurrent asks cannot start two builds, and closed once on `SIGINT`/`SIGTERM`. That closes all
      three failure modes named in the brief, the sharpest being that the queue opened at
      `createAsync()` is shut after the first dispatch, so the **second** accepted run would enqueue
      against a closed queue.

      The daemon boots by `JobWorkersDaemon.createAsync({ EngineCtor })` — [[Q87]]'s path, re-verified
      against the installed package rather than taken from this feature's own earlier note, with the
      reasoning written into `scripts/startJobDaemon.js` so a later reader does not "correct" it back
      toward the skill. `pm2.config.cjs` gained the daemon, and its existing app was renamed from
      `GraphQL API` to `API Server`: `server/index.js` starts three servers, two GraphQL and the REST
      one this product's clients actually call, so the old name was wrong about the surface that
      matters and only two-thirds true of the rest.

      **One new upstream defect** ([[Q88]]), worked around in our own code rather than by patching:
      the loader reads `workersPath` with an unguarded `readdirSync`, so an absent directory kills
      the daemon at boot. `app/jobs/.keepDirectory.js` is load-bearing, not scaffolding, and it works
      because the loader's own filter skips a dotted name.

      **And one limit of this gate, named rather than papered over** ([[Q89]]): acceptance criterion
      2 — a run accepted while no worker runs is executed once a worker starts — cannot be exercised
      end to end here, because `app/jobs/` holds no job yet and the daemon therefore binds no queue.
      The exit condition holds structurally rather than observably. The implementer said so instead
      of writing a test that would pass without proving it.

      1765 tests in `tests/__tests__/` across 56 suites, 275 in `tests/_orders/`, both green on the
      first run. `npx eslint .` clean.
      -->
- [x] 8. Security audit  <!-- skills: hor-security-audit (invoked in full, never through a digest); digests: n/a — an audit skill IS the criteria -->  <!-- agents: 3 audits + 3 fixes; wall-time: ~14400s -->
      <!--
      **Three rounds, and the second and third each found that the previous answer had been applied
      one level too shallow.** That progression is the finding worth keeping, more than any single
      defect in it.

      Round 1: seven findings. The one that mattered was mine — I had approved a guard that read
      `Op.notIn` out of a status condition and called that a proof, and Sequelize drops a column's
      other operators when `Op.and`/`Op.or` sits beside them. A canceled run was revived to RUNNING
      with the guard reporting the write safe. The other six: a worker logging through a logger the
      engine no-ops in production; nothing validating what crossed the queue boundary; no transport
      encryption on Redis; a rejected connection left in the pool forever; a throwing teardown
      skipping the process exit; and a shutdown sink attached twice.

      Round 2 (N1): the round-1 answer counted *own* symbols. Sequelize reads `Op.and` through the
      **prototype chain**, which no own-key inspection can see. The answer: compile the caller's
      `where` through the query generator, compare it character for character against a rendering of
      the model's own condition, and then **assign that condition to `options.where`** so the
      statement runs under the model's object rather than the caller's. N2: two waits with no bound —
      BullMQ resolves `waitUntilReady()` on `ready` and rejects only on `end`, and ioredis with
      `maxRetriesPerRequest: null` never emits `end`, so a request hung and a process asked to stop
      never took its exit. Both bounded at five seconds.

      **Round 3 (F1, HIGH): the same lesson, unapplied to the values.** Round 2 taught the guard to
      compile rather than read by key — and that was done for the `where`, while the **trigger** that
      decides whether the `where` is looked at at all still compared value keys against the literal
      string `AiRunStatusId`. A caller spelling the **column** name walks past it: Sequelize runs
      `beforeBulkUpdate` on the caller's raw keys and only afterwards maps them, passing a key it does
      not recognise into the `SET` clause verbatim. **Reproduced in the main session before being
      handed on** — run `10010006`, CANCELED, moved to RUNNING with `affected=[1]` and no refusal. The
      per-row hook was blind in the same call: with `individualHooks: true` the instance carried both
      spellings at once, so the attribute it compared had not moved.

      The answer: the trigger resolves every written key through `rawAttributes`, which knows both
      names, and refuses outright any bulk write naming a key the model declares no attribute for.
      Proved by enumerating five spellings across eight option combinations against the real table,
      **before and after** — every combination that moved a settled run now refuses, a write that
      touches no status is unchanged, and the one legitimate transition writer still lands
      `affected=1`. Verified again independently in the main session against the original
      reproduction.

      **The lint exception I asked for was withdrawn in the same round, and that is my error to
      record.** I put a whole-file exemption from every inline-disable rule to the person running the
      session, to buy one line. The auditor pointed out the narrower form: a per-file
      `no-param-reassign` setting buys the same line with no inline comment at all. The model left the
      never-add list, and that list's own warning is true again. I should have looked harder before
      asking ([[Q95]]).

      **The defect family, across all three rounds and the sibling feature's seven:** a refusal
      message, a docblock, a constant's comment or a test title stating something the code does not
      do. The guards generally held; what was wrong was what the code said about itself. Round 3
      alone rewrote four such sentences in one file, including a refusal message that named one of
      the column's two names while the trigger compared against that same one — the message was
      *describing the defect* and reading as a guarantee.

      Two further round-3 findings, both closed: a test comment claiming to prove the deadline timer
      was aborted, where `Promise.race` returns whether or not it was cleared (the abort is now
      asserted on the real signal), and a shutdown abandoned at the deadline exiting `0`, which `pm2`
      reads as clean (now exits `1`).

      Final state at commit `323dc27`: `npx eslint .` clean, `tests/__tests__/` 2276 across 71 suites
      and `tests/_orders/` 303 across 5, all green.
      -->
- [x] 9. Verify the use cases again, against the built API  <!-- skills: none matched — this gate is a reading against the built code, and the delegate covers the shared UI/UX context, which this product declares no row for; digests: none -->  <!-- wall-time: ~1800s -->
      <!--
      Three use cases, walked against what is actually in the tree rather than against the criteria.
      **Two are supported and unexercisable; the third is supported in a narrower sense than its own
      words claim, and that gap is this gate's finding.**

      Everything below was checked in the tree, not remembered. `find server/restfulapi/renderers`
      shows no concrete POST renderer — only the base, which sits outside the scanned `v1/post/`.
      `ls -a app/jobs/` showed only the keep-file at the time of this gate. And
      `grep -rl 'extends BaseAiRunJobWorker|BaseAiRunJobDispatcher|BaseAiRunPostRenderer'` over
      `app/` and `server/` returned nothing.

      **"the client system gets its run key at once and the work happens afterwards, so its own
      request never waits on a model"** — supported. The accept path obtains a dispatcher, opens a
      transaction, saves the run, registers the dispatch on `afterCommit`, and answers; the work is
      the worker's. Worth naming rather than glossing: the request *can* wait up to five seconds, on
      the queue store being unreachable, before the transaction opens. That is not a model, so the
      use case holds — but "never waits" is true of a model and not of everything.

      **"a run that was accepted is still executed after the process that accepted it has
      restarted"** — supported structurally, and this is [[Q89]] exactly. Redis is durable, the
      daemon boots and auto-discovers, the accept path enqueues after commit. Nothing had been
      written for it to discover. That changed mid-version when `#run-delivery`'s callback job
      landed under `app/jobs/` — so the daemon now binds a real queue for the first time ([[Q118]])
      — but §11 speaks of **a run's** job, and that is still `#asset-media-extraction`'s to supply.
      Not claimed observable here.

      **"a run that has been going too long stops by itself instead of holding a worker
      indefinitely"** — **this is where the gate earned its place.** The fourth acceptance criterion
      is kept in full: the race answers, the row is written `TIME_LIMIT_EXCEEDED`, and the losing
      side can never reach that row because the status is the base worker's to write. Reading the
      criteria alone, this passes.

      Reading the **use case** does not. The loser was left "to settle or reject on its own", so a
      work that ignores the race keeps running and keeps its worker slot — the daemon's concurrency
      down by one for as long as that work lives, which for a work that never settles is forever.
      That is precisely "holding a worker indefinitely". And there was **no channel at all** for the
      work to be told: `executeAiRunWork()` received a body, a context and a parcel, and nothing it
      could honour. `parcel.signal` is deliberately unused, for a reason that still stands — it is
      BullMQ's, its firing conditions are undocumented, and a limit built on it would be a limit
      nobody could state the behaviour of.

      Recorded as [[Q113]] and **fixed within this version rather than deferred**, because
      `#asset-media-extraction` is the first concrete `executeAiRunWork()` and adding the channel
      afterwards means it is written against the shape that has none. The worker now raises a signal
      of its own when the timer wins, and no docblock claims the slot is freed — nothing can make a
      work honour a signal. What changed is that ignoring it became a choice.

      **[[Q113]] stays open deliberately**, and not for want of code. The use case asks for
      something no base class can deliver: the only mechanism that truly frees a slot is killing the
      worker process, which takes the daemon's other in-flight runs with it. Either the wording
      becomes what the system keeps, or a second mechanism is designed. That is `/hora-spec`'s.

      **The gate's own limit, stated rather than implied:** no use case here could be driven end to
      end, because this feature deliberately delivers the shape every run job takes and §11 says
      outright that the concrete job belongs to the service. Every check above is a reading of built
      code plus its unit tests. The first run that goes through this lifecycle for real will be
      `#asset-media-extraction`'s, and its own gate is where these three become observable.
      -->

## Frontend gate
- [x] 10. Open the frontend  <!-- n/a: target names no frontend row -->
- [x] 11. Reconfirm UI/UX and the use cases  <!-- n/a: target names no frontend row -->
- [x] 12. Component design  <!-- n/a: target names no frontend row -->
- [x] 13. The frontend modules the implementation needs  <!-- n/a: target names no frontend row -->
- [x] 14. API client  <!-- n/a: target names no frontend row -->
- [x] 15. UI  <!-- n/a: target names no frontend row -->
- [x] 16. Wire the data-fetching logic in  <!-- n/a: target names no frontend row -->
- [x] 17. Local test environment  <!-- n/a: target names no frontend row -->

## Acceptance gate
- [ ] 18. Acceptance (E2E and unit both)

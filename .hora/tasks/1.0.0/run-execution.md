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
- [ ] 3. DB and API schemas
- [ ] 4. Stub API
- [ ] 5. The modules the implementation needs
- [ ] 6. Actual API
- [ ] 7. Worker
- [ ] 8. Security audit
- [ ] 9. Verify the use cases again, against the built API

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

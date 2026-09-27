# #run-cancel  Cancelling a run
<!-- spec: run-cancel @ sha256:9b1fc1db124b2a345f68a9796f9798abf39966f9ea539db8a426d35350ae5d78 -->
<!-- repositories: backend -->

Constraint: a run stops at a step boundary, never mid-step. Tokens spent up to the stop
            are still recorded — they are the basis for whatever the client refunds

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- agents: 0; wall-time: ~400s -->
      <!--
      Confirmed rather than drafted. §15 carries three use cases, eight acceptance criteria, an
      operation whose kind and renderer are named, and a caller stated as the client that created
      the run — with another client's run answering as though it did not exist, which is the same
      refusal `GET /v1/ai-runs/:runKey` already makes and for the same reason.

      The contract already describes `POST /v1/ai-runs/:runKey/cancellations` and
      `AiRunCancellationResponse`, so this feature starts with no drift to answer.

      **The design sentence worth carrying forward** is §15's own: *"A cancellation is a resource
      that is created, not a field that is set, so asking twice creates nothing the second time and
      answers with the state that already holds."* That is what makes criterion 5 — a run already
      terminal answers its state rather than an error — a property of the route's shape rather than
      a special case bolted onto it.
      -->
- [x] 2. Verify the use cases can be met  <!-- agents: 0; wall-time: ~500s -->
      <!--
      All three are servable, and unusually little has to be built for them: `#run-execution` left
      most of the machinery in place.

      **What already exists**, checked rather than assumed: `canceled` is one of the five run
      statuses; `AiRunTerminalStatusInspector` already treats succeeded, failed and canceled alike
      as terminal; `ai_runs` already carries both `cancelRequestedAt` and `canceledAt`; and
      `BaseAiRunJobWorker` already runs **two abort controllers**, its docblock naming them as "the
      two cancellations that run opposite ways round".

      **So the third use case is met by the schema alone** — ORT measures how long cancelling takes
      from the interval between the two timestamps, which is why there are two rather than one.

      **Three criteria name work that does not exist yet, and each is a design decision rather than
      an implementation detail.** They belong to checkpoints 3 and 5, and are written here so the
      gate that takes them is not deciding them for the first time under a deadline:

      - *"a queued run leaves the queue and ends canceled, having made zero model calls"* — either
        the job is removed from the queue by id, or the worker checks the run's state when it picks
        one up. These differ in what happens to a job already in flight between the two.
      - *"a provider call in flight is aborted, and the tokens spent up to the abort are still
        recorded"* — the abort exists; what needs deciding is that the `ai_model_calls` row is
        written on the aborted path too, which is the half a naive abort drops.
      - *"cancellation is terminal, and always delivers a terminal callback"* — `#run-delivery`
        raises a callback on terminal states, and canceled is terminal, so this should follow
        without new work. **Confirm it rather than assume it**: the word "always" is the one
        carrying the criterion.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-restfulapi-architecture, hor-type-interface, hor-constant-definition, hor-sequelize-model; digests: hora-skills-ort-renchan 0.2.1 -->  <!-- agents: 1; agent-time: ~1317s; wall-time: ~2100s -->
      <!--
      No migration and no model — §15 declares no table and both cancellation instants were already
      on `ai_runs`, already declared in `types/models/AiRun.d.ts`.

      **The route inherits `BasePostRenderer`, not `BaseAiRunPostRenderer`, and the reasoning is
      the checkpoint's most useful output.** That base is the run-*creating* accept path: an
      idempotency pair, a request-body digest, a run category, a job dispatcher, a transaction to
      hang a dispatch off. This route creates no run, so inheriting it would bring refusals it
      cannot raise and two abstract members it has no honest answer for. It also needs no
      `Idempotency-Key`, because the contract requires that header on every POST that **creates a
      run**.

      **§15's design sentence is implemented as four branches rather than a special case.** No run
      of this client under that key writes nothing and answers `404`; a terminal run writes nothing
      and answers its terminal status; an ongoing run already asked about writes nothing and
      answers its status; only an ongoing run never asked about writes `cancelRequestedAt`. The
      second answer is byte-identical to the first — the write's boolean is discarded deliberately,
      so a caller cannot tell the first ask from the fifth.

      **The first instant is never overwritten, and that is load-bearing rather than tidy.** §15's
      third use case measures the gap between `cancelRequestedAt` and `canceledAt`; a second ask
      writing a later instant would shrink that measurement by exactly how long the client waited.

      **The brief missed the fact the whole checkpoint turned on.** `AiRunStatusRecorder` already
      ships `saveAiRunCancelRequest()` and `saveCanceledAiRun()`, written by `#run-execution` for
      this feature and called by **nothing in production** until now — verified: the only
      production caller is the class this gate added. An agent that missed them would have written
      a second writer onto the same column. Carried into checkpoint 7, which needs
      `saveCanceledAiRun()`.

      **A trap `#run-list` laid for this feature, found and avoided.** That feature seeded its
      fixtures straight into the `ai_runs` development seeder, which looks like the precedent to
      follow. Its own renderer test asserts **seven exact run keys of the `107` block, ordered by
      id descending, with no id filter** — so a `108`-prefixed row seeded for the same client would
      sort to the head of page one and break them. Fixtures are created inside the `_orders` tests
      instead, on November dates clear of the window another feature's rate-limit cases count in.

      **A digest was wrong and is corrected**: `hor-restfulapi-architecture` named the path
      parameter reader `request.pathParameterHashProxy`; the tree uses `request.pathParameterHash`.
      A digest is what an implementer reads instead of the skill, so a wrong member name there is a
      wrong member name in the next file written from it.

      **Contract gap closed here**: its accepted-status table covered only the run-creating POST
      and fixed no status for this route. `202` was derived from the two rules that table already
      states — `202` rather than `201` because nothing exists to fetch, and a repeat is not `200`
      — and both now say so for the cancellation route explicitly.

      **Criteria 1, 2, 3, 4 and 7 are deliberately not backed here**: the queue departure, the step
      boundary, the aborted provider call with its tokens, the terminal callback, and the list
      telling canceled from failed belong to checkpoints 5 and 7 and to `#run-list`.

      Green in WSL: 3931 across 113 suites and 454 across 7, `npx eslint .` clean.
      -->
- [x] 4. Stub API  <!-- n/a: no consumer exists for a stub, and the route it would stand in for already answers -->  <!-- agents: 0; wall-time: ~120s -->
      <!--
      **Closed on `#run-list`'s argument rather than by repeating it**, because the facts are
      identical and re-deriving them would spend an agent to reach a conclusion already held with
      evidence.

      The skill's premise is that a stub lets a frontend build against the contract while the
      backend is unwritten. This product declares **no frontend row** — checkpoints 10 through 17
      are not-applicable on every feature here for that reason — and checkpoint 3 built the
      working route, which answers real rows and is asserted over the database.

      The sibling's record carries the full reasoning, including the part that argues against
      building one anyway: a stub left in place would meet checkpoint 6's instruction to "replace
      the literal with real work" and invite an agent to rewrite an implementation that already
      answers correctly.
      -->
- [x] 5. The modules the implementation needs  <!-- skills: the catalog check against @openreachtech/hora-ecosystem; hoc-jest, hor-backend-testing digests -->  <!-- agents: 1; agent-time: ~1305s; wall-time: ~2400s -->
      <!--
      Three modules for checkpoint 7 to import — `AiRunCancellationInspector` (has this run been
      asked to stop), `AiRunCancellationWatcher` (ask again on an interval and raise the work's own
      signal), and a named `AiRunStatusRecorder#saveCanceledAiRunOnce()`. **Two of the four criteria
      the brief listed needed no code, and both were verified rather than assumed.**

      **The finding that mattered is a refusal.** §15's third criterion asked that a provider call
      in flight be aborted. That is not reachable in 1.0.0, for two independent reasons the agent
      established and the main session re-verified: the abort signal **does not reach**
      `sendRequestToAi()` at all — `SendRequestToAiParams` has no field for it — and the only
      driver this version ships is the stub, which by §17's own first criterion **opens no
      connection**. There is no call in flight to abort.

      **It could have aborted the stub, watched a green test, and written "criterion 3 met".**
      Nobody would have caught it. It declined, and said why.

      **The spec was amended rather than the criterion left unmet**, on the user's decision and
      with the exact words read first: the criterion now promises what this version does — the
      tokens a run spent before it stopped are recorded — and the in-flight abort moves to "Out of
      scope for now", unblocked by the first vendor driver. Its seam line is true today rather than
      aspirational: the stop already travels on the work's own abort signal, which every step
      boundary already asks.

      **Criterion 1 was a design decision and it was argued, not assumed.** The worker checks the
      run when it picks the job up; the job is **not** removed from the queue. The evidence is that
      `renchan-job-bullmq` exposes no API to remove one dispatched job, nothing persists a job id,
      a job already picked up could not be removed anyway, and removal would move the terminal
      write and the terminal callback into an HTTP request the contract answers `202` to. What the
      choice costs is stated too: a queued run canceled while no worker runs stays queued until one
      starts — which is a property §11 already has and already accepts.

      **The ordering inside the delivery is the subtle half**: the check sits **after** the claim,
      not before. Checking first would let a run go `queued → canceled` and skip `running`, breaking
      a neighbouring feature's criterion to satisfy one of ours. After the claim, the run still
      makes zero model calls, which is what criterion 1 actually asks.

      **Criterion 3's second half was verified as already true** — model call rows are written
      before the call answers, nothing updates or destroys one, and no transaction wraps the work
      so nothing rolls them back. A call aborted mid-flight is deliberately **not** recorded: its
      token counts arrive with the response, so a row of zeroes would be a fabricated billing line.

      **Criterion 4 needed no code, and the check produced a trap for checkpoint 7**: the terminal
      callback is raised below the terminal branch in `#settleAiRun()`, guarded only on having
      settled. If the pick-up check is written as an early `return` in `#executeJob()`, the run
      settles canceled and **no callback is raised** — "always" fails silently, and no run looks
      different for it.

      **The catalog was searched by describing the processing, and returned no match** — the
      closest, `BaseIntervalJobScheduler`, is a Redis-backed repeatable job with no way to reach
      one delivery's in-memory controller. The rejection is recorded in the watcher's own module
      comment so the next reader does not reopen it.

      **The brief was corrected twice.** `cancelRequestedAt` **is** read in production — by
      checkpoint 3's registrar, scoped to a client, to decide whether to write; the new inspector
      reads it unscoped to decide whether to stop. And `#saveAiRunOnce()` is a transition-agnostic
      wrapper, not a named spelling: `saveCanceledAiRunOnce()` **did not exist**, and a checkpoint-7
      agent following the brief would have hand-rolled a thunk at the call site, which is the one
      thing the named spellings exist to prevent.

      Green in WSL: 3995 across 115 suites and 469 across 7, `npx eslint .` clean.
      -->
- [x] 6. Actual API  <!-- agents: 0; wall-time: ~500s -->
      <!--
      **Satisfied by checkpoint 3, verified here by the criteria map** — which hora assigns to the
      main session rather than to an agent. There is no stub to replace, and the route has answered
      real rows since the schema gate.

      **What this gate owns, and what it does not.** Of §15's eight criteria, three are this
      route's: a terminal run answers its state rather than an error (5), only the creating client
      may cancel (6), and another client's run answers as though it did not exist (8). All three
      carry tests written at checkpoint 3, over the database, with the foreign run and the unknown
      key answering the same `404` with one wording — so a refusal that leaked the run's existence
      would fail.

      **Criterion 7 belongs to `#run-list` and was checked rather than assumed.** "A canceled run is
      distinguishable from a failed run in the list" holds because the row carries `statusName`, and
      `canceled` and `failed` are distinct values of it — both appear as asserted literals in the
      page builder's tests. It needed no work here, which is the answer, but not one worth taking
      on trust from a sibling feature's summary.

      **Criteria 1, 2 and 4 are checkpoint 7's**, and criterion 3 was settled at checkpoint 5 — its
      surviving half verified as already true, its other half moved to the spec's deferred list on
      the user's decision.

      Green at the time of ticking, in WSL, by the repository's own command: 3995 across 115 suites
      and 469 across 7, `npx eslint .` clean.
      -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern, hor-renchan-job-bullmq -->  <!-- agents: 1; agent-time: ~1283s; wall-time: ~2100s -->
      <!--
      **The placement skill ran first and its answer was "no new job".** Honoring a cancellation is
      heavy and belongs to a worker, but it is not a new *unit of work* — it is a change in how an
      existing delivery ends. A `cancel-ai-run` job would have had to reach another process's
      in-memory `AbortController`, which Redis cannot carry. So nothing was added under
      `app/jobs/**`, no manifest, no dispatcher, no scheduler.

      **The trap checkpoint 5 flagged is real, and the agent verified it before designing around
      it.** `#executeJob()`'s `return` on a refused claim sits **above** the `try` that calls
      `#settleAiRun()`, and the terminal callback is raised only inside it. A pick-up check written
      as an early return would have settled the row canceled and raised no callback — criterion 4's
      "always" failing with no run looking different for it. The reading now produces an **outcome**
      rather than a return, so every terminal state passes the single raise point.

      **A hazard neither checkpoint 5 nor the brief named, closed here.** The watch promise is
      created before the race is awaited and lives as long as the work. A rejection inside it — a
      dropped connection on the per-second read — would have been a rejection with no handler
      attached, which under Node's default is **not a failed run but a dead daemon**. Both readings
      log and answer `false`; what a false costs is written in the code.

      **The brief was wrong about the blast radius and the correction is worth keeping.** It said
      `BaseAiRunJobWorker` is inherited by both job families. It is not: `DeliverRunCallbackJobWorker
      extends BaseJobWorker` directly and its own docblock states that as a decision. One subclass,
      half the radius.

      **Checkpoint 5's plan was under-specified in one load-bearing place.** It said the watcher's
      boolean distinguishes a work that stopped because a client asked from one that finished, but
      named no carrier for it. The agent added `isCanceled` to a new `AiRunTerminalOutcome` — and
      the reason it is indispensable was verified in the tree: both boundaries stop **gracefully**
      and answer with what they had, so read from the work alone a canceled run would have been
      recorded **succeeded with a partial result**.

      **One design call made by the agent and endorsed here**: `#recordTerminalAiRunState()` asks
      `isCanceled` ahead of the reason code, so a client that asked is answered `canceled` even when
      the outcome also carries a provider failure or the time limit. The alternative tells a client
      its run broke when what happened is that it got what it asked for.

      **The in-flight abort was not attempted and no test was written that could be mistaken for
      one** — it left §15 by the approved spec edit and sits under "Out of scope for now".

      Green in WSL: 4034 across 115 suites and 481 across 7, `npx eslint .` clean.
      -->
- [x] 8. Security audit  <!-- skills: hor-security-audit (invoked in full) -->  <!-- agents: 1; agent-time: ~907s; verify-time: ~907s; wall-time: ~1800s -->
      <!--
      **0 HIGH, 1 MEDIUM, 1 LOW, 1 INFO — and both criteria this feature turns on were proved on a
      running server rather than read.** The auditor booted the service, signed live requests, and
      restored the development database to its seeded baseline afterwards.

      **§15's sixth and eighth criteria hold, both halves.** The client sits in the `where` of the
      registrar's read rather than in a check after the row returns, and a `null` client renders
      `IS NULL` against a `NOT NULL` column — matching nothing. A foreign run, a foreign queued run
      and an unknown key answer identical status, body and wording, and **both foreign rows read
      back afterwards with `cancelRequestedAt` still null**: left unchanged, not merely refused.
      Timing over 30 interleaved pairs — 7.47 ms against 7.64 ms — carries no signal, and what
      difference there is runs the wrong way for an existence oracle.

      **[[Q143]] is the finding, and it is the third reading of one root cause.** The signed payload
      is `timestamp + "." + rawBody`; this route's body is empty by contract, so the payload names
      nothing about which request it authorizes, and the run key deciding what gets destroyed rides
      in the unsigned path. A captured signature was replayed verbatim against a **different** run
      and a different route. [[Q21]] called the harm a duplicate charge; [[Q142]] called it
      disclosure; **this is the first route where it destroys work.** Accepted here because the
      signing payload belongs to `#run-contract` and the contract — and because [[Q21]]'s own
      proposed payload would close it, so the case is for adopting what is already written.

      **[[Q144]] is recorded rather than fixed, and refusing to half-fix it is the decision.** Two
      routes take a run key from the path with no content check; a NUL byte answers `500` on the
      SQLite dialect and a clean `404` on MariaDB, so it does not ship. A sibling route in this
      same version **does** have the check, added when the same defect was found in a cursor.
      Fixing only this feature's route would leave three routes and two behaviours; the honest fix
      is one inspector both ask, and the other route is `#run-record`'s.

      **The trap checkpoint 7 designed around was verified closed**: the canceled path goes through
      `#recordTerminalAiRunState()` and reaches the single callback raise below the branch.

      **The watch was checked for the things that would make it dangerous** and is none of them: its
      interval is a module constant no caller reaches, it is aborted on every exit including a race
      that threw, an already-aborted signal makes the timer reject immediately so the recursion
      terminates, and the recursion is in tail position — a promise chain of about 300 links, not a
      stack. Both readings catch, log and answer false, so a rejection can never escape a promise
      created before its `await`.

      **The brief's inheritance claim was checked rather than taken**, because the previous agent
      had found one false: one subclass of the shared base, as stated.

      **[[Q142]]'s stated mechanism was corrected here** — a bodyless GET is not signable at all;
      a conformant one declares `content-type` and `content-length: 0`. Its conclusion stands.
      -->
- [x] 9. Verify the use cases again, against the built API  <!-- agents: 0; wall-time: ~600s -->
      <!--
      Walked against a service that runs, with checkpoint 8's live probes as evidence where they
      apply.

      **"Cancels a run whose result stopped being wanted, and nothing is spent on model calls made
      after that point."** Met, in two halves that were built separately. A run canceled before
      pick-up never enters the work at all — the check sits between the claim and the work, so the
      count of model calls is zero and a test asserts `executeAiRunWork` is never called. A run
      canceled mid-flight stops at the next boundary, because the watch raises the signal every
      boundary already asks; the `_orders` case writes the cancellation 100 ms into a stubbed work
      and the run records canceled rather than succeeded-with-a-partial-result.

      **"Cancels a run which has already finished and gets that run's real state back, rather than
      an error it has to handle."** Met, and probed live at checkpoint 8: `202` with the terminal
      `statusName`, for all three terminal states. It needs no special case, which is §15's own
      design sentence working — a settled run is a run there is nothing to create against.

      **"ORT measures how long canceling actually takes."** Met **as data and not as an
      operation**, and that distinction is worth writing down rather than ticking past. Both
      instants are recorded, the first is never overwritten, and the interval between them is the
      measurement. But **neither instant appears in any client-facing type** — checked — and §16's
      operator commands do not name them either. An operator measures this by reading the
      database.

      **That is not a gap in the build**: §15 asks that ORT be able to measure it and names no
      operation for doing so, and the subject is ORT rather than a client. It is recorded here so
      that whoever later wonders why no route exposes it finds the answer rather than assuming
      something was dropped — and so that `#operator-cli`, whose "one run with its steps" command
      is the natural home, can decide deliberately whether to carry them.
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
- [x] 18. Acceptance (E2E and unit both)  <!-- agents: 0; wall-time: ~500s -->
      <!--
      Scoped gate run at `.hora/acceptance/1.0.0/run-cancel.md`. **Partial** for the reason every
      acceptance of this version is: steps 3 and 4 have no equipped delegate.

      Two things this record carries that a passing verdict would otherwise bury: a criterion left
      §15 during the build because it could not be honestly met in this version, and the third and
      most serious reading of an unsigned-payload finding first written down as a duplicate charge.
      -->

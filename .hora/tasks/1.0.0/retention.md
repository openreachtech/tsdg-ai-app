# #retention  Purging content and the trace on two clocks
<!-- spec: retention @ sha256:c7284729023dcaec66e00dad9a6baf8dc053482b35dec78b043139e1c350cf83 -->
<!-- repositories: backend -->

Constraint: content and the decision trace are purged on two separate settings, never one.
            The two exist because privacy wants early deletion and a dispute raised after an
            auction closes wants a long memory

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- agents: 0; wall-time: ~400s -->
      <!--
      Confirmed rather than drafted. §19 carries three use cases, five acceptance criteria, and a
      background-jobs table naming **three** jobs with their queues, their triggers and their
      payloads — which is more than most sections here state, and it decides the shape of
      checkpoints 5 and 7.

      **This feature adds no API operation at all.** That makes checkpoint 4 not-applicable by its
      own stated condition, and reduces checkpoint 3 to the schema half. It is the first feature in
      this version whose whole surface is scheduled work.

      **The sentence that carries a criterion** is §19's own: *"Purging content sets the content
      columns to null and stamps the run as purged, so a run whose content is gone stays
      distinguishable from one that never carried any."* The stamp is what makes criterion 3 a
      property of the schema rather than something a reader has to infer from emptiness.
      -->
- [x] 2. Verify the use cases can be met  <!-- agents: 0; wall-time: ~600s -->
      <!--
      All three are servable, and the gaps between what exists and what is needed were measured
      rather than guessed.

      **What already exists**: `ai_runs.contentPurgedAt` — the stamp §19's own sentence asks for;
      `provider_uploaded_files.expiresAt`, which the third job works from; and the trace itself,
      spread across `ai_run_steps`, `ai_model_calls` and `ai_run_field_outcomes`.

      **Content is in two tables, not one.** `ai_runs.requestBody` and `.resultBody` are the
      obvious pair, and `ai_model_calls.responseBody` is the third — it holds what a provider
      answered, which is content by any reading of §19. A purge that cleared only the run's two
      columns would leave the model's answers sitting in the table, and every criterion would still
      read as met.

      **Three things do not exist yet, and each is a decision rather than a typing exercise:**

      - **No second stamp.** There is a `contentPurgedAt` and nothing for the trace. Criterion 1
        asks for two settings that are *never* one; whether a purged trace is stamped or simply
        gone is checkpoint 3's to settle, and it decides whether criterion 4 — a run past the
        content horizon but inside the trace horizon still answers why — can be told apart from a
        run past both.
      - **No retention setting anywhere.** Neither horizon exists as a constant, a column or an
        environment key. §19 names no figure either, so the numbers will have to be derived the way
        `#run-list`'s page bounds were, and recorded as a question.
      - **No provider delete call.** The third job "calls a provider to delete what was uploaded".
        `ProviderUploadedFile` records what was uploaded and when it expires, but nothing deletes
        it, and the only driver this version ships is the stub — which uploads nothing, so there
        may be nothing to delete. **That is the same shape as `#run-cancel`'s in-flight abort**,
        and it should be judged before code is written for it rather than after.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-sequelize-model, hor-constant-definition, hor-type-interface, hor-sequelize-subquery (read and declined) -->  <!-- agents: 1; agent-time: ~863s; wall-time: ~2400s -->
      <!--
      No API surface: §19 declares three jobs and no route, so the contract had nothing to agree
      with and nothing in it changed. What this gate delivered is two stamps, two settings and
      three indexes.

      **The audit's most valuable finding is an absence, and it was verified independently.** There
      is **no URL column anywhere in the schema** — the only two named URL are the client's own
      callback endpoint and its registered prefix. A media URL, which §7 counts as personal data,
      reaches this service **inside `request_body` and is never copied out of it**, so nulling that
      column removes every copy. The privacy promise holds structurally rather than by anyone
      remembering to keep it.

      **The trace is stamped, not silently deleted, and the argument is the decision.** The trace
      is **rows** — `ai_run_steps`, `ai_model_calls`, `ai_run_field_outcomes` — so purging it
      deletes them and leaves nothing to read. A run whose steps are gone looks exactly like a run
      canceled before it took one. Without `trace_purged_at`, §19's fourth criterion cannot tell a
      run past the content horizon from one past both, because both answer nothing.

      **The two horizons are two files, and that shape came from §7's own words**: "two separate
      settings, never one". There is no module named for retention-in-general, so a worker reaching
      for "the retention setting" finds nothing and must name its clock. A single file with two
      keys would have made combining them the easier way to write a job; two files make it the
      harder one.

      **A third stamp was added that nobody asked for**, with its risk stated: `provider_purged_at`
      on the egress record, because without it the third job re-picks every expired row every day
      forever. The agent named the cost — if checkpoint 5 judges that criterion cannot survive on a
      driver that uploads nothing, the column is dead — and took it over making checkpoint 7 ship a
      schema change or a non-idempotent job.

      **The glossary was wrong and is corrected**: it defined content as three fields where §7
      names four, and the two new stamps had no rows.

      **Two failures on the way, and the second is the one worth keeping.** The purge cases asserted
      on the return of `#update()` — an **instance**, which carries only what it was created with
      plus what the update changed, so a column never given to it is **absent rather than null**.
      The easy fix was to drop `tracePurgedAt` from the expectation; that would have gone green and
      **deleted the very claim the case exists to make** — that a content purge leaves the trace
      stamp standing. The column is now carried at creation, with the reason written beside it.

      **A mistake of the main session's own, recorded because it nearly shipped**: the first fix
      script raised `SystemExit` when its anchor matched once instead of twice, and the message it
      printed was read as a success. One of the two cases went unfixed for a whole run. The guard
      behaved correctly — it refused to edit against a false assumption; the reading of its output
      did not.

      [[Q145]] and [[Q146]] carry what was found and not taken: a promise about `failure_parameters`
      that no code enforces though its twin's does, on a column that outlives the content purge by
      two years; and §19's silence on whether a run record is ever removed, which decides a schema
      rather than a job.

      Green in WSL: 4048 across 117 suites and 485 across 7, `npx eslint .` clean.
      -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation at all -->  <!-- agents: 0; wall-time: ~60s -->
      <!--
      Not applicable by the checkpoint's own stated condition rather than by argument, which is
      what separates it from the two features before it. §19 declares three background jobs and no
      route; there is no operation to stub.
      -->
- [x] 5. The modules the implementation needs  <!-- skills: the catalog check against @openreachtech/hora-ecosystem; hor-constant-definition, hor-renchan-job-bullmq digests -->  <!-- agents: 1; agent-time: ~1568s; wall-time: ~3600s -->
      <!--
      **Two of the three jobs have their modules; the third has none, by judgement rather than
      omission.** [[Q147]] records why it was declined and the spec amended instead.

      **The refusal is this gate's most valuable output, and its reason is not "untestable".** The
      finder half *is* testable — the seeder carries `expires_at` in all three states and
      anticipates this job in its own docblock. What was refused is wiring a finder to a stamper:
      `provider_purged_at` means *the copy at the provider was deleted*, and writing it without
      deleting anything **records a false fact, permanently, about personal data** — worse than an
      unmet criterion, because it makes the criterion read as met.

      **Two horizon classes with no shared base, and that is the decision.** A base parameterised
      by a day count would be exactly the module that answers for retention in general — reachable
      by a caller holding neither figure, and editable in one place so a change reached both
      clocks. Four duplicated lines cost less than that coupling, which is the argument checkpoint
      3 made for the two constants files.

      **The sweep needs no cursor, and that is the design.** The purge's own write is the leading
      column of the condition the next batch selects by, so a purged run leaves the set by being
      purged. Nothing persists between batches, sweeps or nights; a crashed batch rolls back whole
      and is re-selected; a redelivered job re-purges nothing. Idempotent by construction rather
      than by a guard.

      **Each batch selects ids only**, because the two largest content columns are MEDIUMTEXT —
      reading rows whole would pull the very content the job exists to remove across the wire in
      order to decide to remove it. **The stamp is written last inside the transaction**, so no
      ordering leaves a run reading as purged while a provider's answer is still stored.

      **The catalog answered "no match" for retention and for date arithmetic**, and rejected the
      near-miss on its own docs: offset paging that counts the whole set per call is wrong twice
      over for a job that removes rows from the set it is paging.

      **The isolation rule matters more here than in any previous feature.** A purge is bounded by
      a horizon rather than by a caller, so a sweep reaches every row in `ai_runs` — including the
      seven `#run-list` asserts by run key. Every fixture is accepted in 2019 or 2017, against a
      grep showing every other accepted instant in the tree is 2026. A case added with a 2026 date
      would empty the subject label of every seeded run, and the failures would surface in another
      folder entirely.

      **A spec inconsistency of the main session's own making, found here and fixed**: section 10
      was edited to say the subject label is emptied once purged, and section 19 was left saying a
      purge sets the content columns to null. A reader of section 19 alone would have written a
      purge that violates the NOT NULL constraint or skips the column.

      Green in WSL: 4077 across 120 suites and 505 across 8, eslint clean.
      -->
- [x] 6. Actual API  <!-- n/a: this feature adds no API operation at all -->  <!-- agents: 0; wall-time: ~60s -->
      <!--
      Not applicable for the same reason checkpoint 4 was, and by the same route: the checkpoint's
      own stated condition, not an argument about it. §19 declares background jobs and no route, so
      there is no operation to implement here and none was stubbed at 4 for this checkpoint to
      replace.

      **The absence is a property of retention rather than a gap in it.** Both horizons are reached
      by a clock; nothing a caller can send moves a purge forward or holds one back, and there is
      deliberately no endpoint that would let one. What the two purges do surface to a caller is
      what checkpoint 3 built into the read path — §10's `subject_label` emptied once purged, the
      three nulled fields — and that is another feature's operation answering honestly about a run
      this one has swept, not an operation of this feature.
      -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern, hor-renchan-job-bullmq, hor-constant-definition, hor-backend-testing; digests: hora-skills-ort-renchan 0.2.1 -->  <!-- agents: 3; agent-time: ~3690s; verify-time: ~720s; wall-time: ~6600s -->
      <!--
      **Two scheduled workers, on the two queues §19 names, with no request-path surface and no
      producer at all.** `purge-expired-run-content` fires `'0 3 * * *'` and
      `purge-expired-run-traces` fires `'0 4 * * 0'`, each calling checkpoint 5's entry point
      unchanged. The third job stayed unbuilt, per the amendment [[Q147]] records: no finder, no
      queue, and no test that sweeps an empty table and calls the result a provider expiry.

      **The checkpoint was sent back once, and what sent it back is the version's own defect
      family in its sharpest form yet.** `attempts: 3`, a five-minute backoff and
      `removeOnComplete: { count: 90 }` were declared on the dispatcher's queue — the obvious
      place, and the place every job with a caller keeps them. A scheduled job has no caller: its
      schedule is upserted through a second `Queue` that `BaseJobScheduler.createQueue()` builds
      with `{ connection }` alone, so BullMQ read `jobsOpts = {}` and merged it with a template
      option hash that was also `{}`. **Every firing of both purges was a single-attempt job whose
      completed records were kept forever** — so the job written to stop a store growing without
      limit was, as configured, the one thing growing without limit, and the weekly trace sweep had
      no retry budget at exactly the cadence where losing one costs a week.

      Five docblocks and one test comment stated the inheritance as fact. The test that was meant
      to protect it — `expect(Dispatcher.optionHash).toEqual({ … })` — passed throughout, because
      it is true of the getter and false of every job. [[Q151]] records the trap for the next
      scheduled job.

      The options now live on the **schedule template**, which is the one hash
      `upsertJobScheduler` persists, read from `constants/aiRunPurgeJobConstants.cjs` so the two
      readers cannot drift; a test asserts the whole template the framework builds
      (`createRequest()` → `buildJobTemplate()`), reachable without Redis. The last link — Redis
      storing that template and producing each firing from it — is **unverified** and says so.

      **The dispatcher's getter was kept, and the argument is not sentiment.** Deleting it empties
      the class, which this project forbids outright, so the change would cascade into deleting
      the class, its test and both concrete dispatchers' parentage. It was never false about its
      own route either — only about the schedule's. And the day a direct dispatch appears, its
      absence would silently restore exactly the loss the figures exist to prevent.

      **`#sweepExpiredAiRuns()` moved to `_orders`, and the move bought a real test rather than
      compliance.** The defence for keeping it in `__tests__` rested on a premise that does not
      hold — checkpoint 5 already solves fixture isolation by accepting in 2017/2019 — and what
      was genuinely untested anywhere was the composition: a worker built the way the daemon
      builds one, supplying its own default purger, handed a real instant, purging real rows.
      That is what the two new `_orders` files exercise, in windows that close below every date
      the sibling purger files use.

      **Two rules met head-on over one word.** BullMQ's job template carries a `data` key;
      `id-denylist` forbids it bare, `quote-props` forbids it quoted, and the directive comment
      that would excuse either is banned too. The key is now reached through a named constant,
      which satisfies all three and states the thing worth stating — the word is the framework's,
      not ours. Compare `mimeType` in the glossary.

      **The deployment step is now written down outside the source.** `npm run schedulers:start`
      and `schedulers:stop`, plus a note in both READMEs saying this is a step and not a process,
      that PM2 deliberately does not run it, and that a daemon listening on both purge queues is
      not evidence the purge is running. `NODE_ENV` is deliberately not hardcoded: unset, the env
      barrel throws before connecting, which is the right failure for a script that writes to a
      deployment's Redis.

      Green in WSL: 4175 across 133 suites and 511 across 8, eslint clean. One run before this
      died with `ENOMEM` in an untouched suite — 12 CPUs, 11 default jest workers, 7.7 GiB — and
      passed on re-run; recorded here rather than as a finding because no code change was
      involved.
      -->
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

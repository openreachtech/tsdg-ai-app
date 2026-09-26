# #run-delivery  Delivering a result, and reading it back
<!-- spec: run-delivery @ sha256:1cfc5efaeb6179037d17013badcf32a33d8e985150fa8099aad158cf63543851 -->
<!-- repositories: backend -->

Constraint: reading a run back returns the same body the terminal callback carried. Two
            shapes for one answer is what a reconciliation path exists to avoid

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent -->  <!-- wall-time: ~600s -->
      <!--
      Three use cases and **nine** criteria, the most of any feature in milestone 1. Each was
      checked for reach against a product holding `#run-contract`, `#provider-layer`, `#run-record`
      and `#run-execution` and nothing later. **No gap, and no criterion reaches forward.**

      The two that looked like they might, and do not:

      **"a callback URL that does not match the client's registered prefix is not called at all"**
      needs a registered prefix to compare against. `api_clients.callback_url_prefix` exists, built
      by `#run-contract` — verified in the migration rather than assumed.

      **"a canceled run's body reports the model calls and tokens spent up to the stop"** names a
      canceled run, and nothing cancels one until `#run-cancel`, which is ninth. But the criterion is
      about the **shape of the response** for a run in that state, not about the act of cancelling:
      `AiRunStatusRecorder#saveCanceledAiRun()` exists and the development seeders already carry
      canceled runs, so the body is answerable here. The model calls and their token counts are
      `ai_model_calls`, which is `#provider-layer`'s and already built.

      The rest rest on what is already there: `ai_run_steps` for the `?expand=steps` trace,
      `ai_run_failure_reason` codes and their parameters for a failed body, and the signature
      machinery `#run-contract` built for verifying an inbound request — which this feature turns
      around to sign an outbound one.

      **One thing to carry into checkpoint 5 rather than discover there:** the eighth criterion says
      "a callback that fails to deliver is retried, **though a model call in the same run is not**".
      `BaseAiRunJobDispatcher` sets `attempts: 1` for exactly that reason, so the callback's
      dispatcher must **not** inherit that default — it needs its own, and a subclass that quietly
      picks up `attempts: 1` would fail this criterion silently. This is the same trap in reverse as
      the house example's `attempts: 3`.
      -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — the delegate covers the shared UI/UX context, and this product declares no frontend row; digests: none -->  <!-- wall-time: ~500s -->
      <!--
      Three use cases walked end to end on paper. All three complete.

      "the client learns a run has finished without polling" — the terminal transition is the
      trigger, and `#run-execution`'s base worker is the only thing that settles a run, so there is
      exactly one place the callback can be raised from.

      "the client that missed a callback reconciles by reading the run back, and gets the same
      answer" — this is why the feature file's first constraint says two shapes for one answer is
      what a reconciliation path exists to avoid. One body builder, two callers: the callback job and
      the `GET /v1/ai-runs/:runKey` renderer.

      "the client satisfies itself that a callback really came from this service" — the signature,
      plus the run key in a header, which is the third criterion.

      No gap, so nothing was routed to `/hora-spec`.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-database-design, hor-sequelize-migration, hor-sequelize-model, hor-sequelize-seeder, hor-type-interface, hor-constant-definition, hor-restfulapi-architecture, hoc-naming, hoc-jsdoc, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~890s; wall-time: ~1500s -->
      <!--
      Two tables as §12 declares them, plus the type declarations for `GET /v1/ai-runs/:runKey`,
      run in parallel with `#media-fetch`'s checkpoint 3 on one branch. Migration numbers
      (`000025`-`000026`) and the row-id prefix (`105`) were handed down before either started.

      **The schema is where the retry criterion is first made checkable.** The table holds one row
      per *attempt*, with `attempt_index` counting them, so "how many times was this retried" is a
      count of rows with a single answer — and a dispatcher stuck at `attempts: 1` would show up in
      the data as every run carrying exactly one row. A unique index on
      `(ai_run_id, category_id, attempt_index)` was added although §12 asks for none, because a
      duplicate attempt index leaves that count with two answers. §12's own silence on uniqueness is
      recorded in the unit's report rather than treated as a prohibition.

      **No response-body column**, per §12's "a delivery record says whether it arrived, not what
      came back", and the model test compares the *whole* attribute hash — so a body column added
      later fails that test rather than passing quietly.

      **The unit read §12 and the repository over my brief, and was right twice.** I had written
      "every foreign key is a plain BIGINT with an index"; the category key is `INTEGER` and
      unindexed, because §12 declares `int` and because every master FK already in this schema
      (`ai_run_steps.AiRunStepCategoryId`, `ai_run_field_outcomes.AiRunFieldStatusId`) is exactly
      that. Tiny, and worth recording: a brief's general phrasing does not outrank a settled
      pattern.

      **Two shapes had to be chosen because nothing declares them**, both recorded rather than
      settled silently: `engine` ([[Q92]]), which carries two facts held at two different grains,
      and `steps[]` ([[Q93]]), which has no field list in §12, §10 or the contract and whose
      reading deliberately withholds `rejections`.

      **A defect in this unit's own work, caught by its sibling and fixed in the main session.** The
      master seeder was written to `master/` only. `db:seed:master` — the step `db:refresh` runs —
      reads `dev-master/`, so the `terminal` row would never have been inserted locally, and this
      unit's own model test reads that row back by id. The one-line re-export the other nine masters
      carry was added at the gate. It is the exact failure the sibling flagged unprompted, in a file
      it had no reason to look at.

      **`types/restfulapi/aiRunGet.d.ts` sets a precedent**: `types/restfulapi/<renderer>.d.ts` ->
      `namespace restfulapi.<version>`, mirroring `hor-type-interface`'s GraphQL shape. It is this
      repository's first REST type declaration, so `#run-list` and `#run-cancel` will copy it.
      -->
- [x] 4. Stub API  <!-- skills: hor-stub-api (invoked in full — no digest exists, and see [[Q100]]), hor-restfulapi-architecture, hor-type-interface, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~900s; wall-time: ~1500s -->
      <!--
      One renderer for the one operation §12 declares, answering **a canned body per state the
      contract distinguishes** rather than one specimen — queued, running, succeeded, failed and
      canceled, each keyed by a run key that is 64 repetitions of that status's own master-row id.
      The point of the plural is that checkpoint 6 does not meet the other four shapes for the first
      time.

      **The stub is a live route from the next start**, and that was verified in the main session
      rather than taken on report ([[Q101]]). The REST layer has no barrel: the engine deep-loads
      every `BaseRenderer` under `renderers/v1/` and registers it at boot. `passesFilter` defaults to
      `false`, and the routes builder reads that as *run the filter handler* — the naming is inverted,
      so the reading had to be checked — which puts the canned body behind the engine's own
      `401`/`403`.

      **Checkpoint 3's two undeclared shapes were used exactly as left**, neither re-decided:
      `engine` as a nullable pair ([[Q92]]) and `steps[]` as seven fields with `rejections` excluded
      ([[Q93]]). The step test asserts the exact seven-key shape, so a later leak of the internal
      trace fails rather than passes.

      **The equipped stub skill is GraphQL-only** ([[Q100]]) — it has no REST chapter, and the REST
      layer has no stub-versus-actual split to migrate through. Its grand principle carried unchanged;
      its "no conditionals" rule pulled against this checkpoint's "a canned answer per state", and
      that was resolved with hash lookups and no branch anywhere, both reads made total so a key
      reaching `Object.prototype` behaves as an unknown key does.

      **Four spec silences recorded**: a step still running must carry an outcome code and no
      vocabulary names one — a contradiction inside already-accepted schema ([[Q96]]); §20's result
      has a table and no type declaration, so this stub now holds a specimen of a later feature's
      payload ([[Q97]]); a decimal's wire type is decided by the dialect unless someone decides it,
      and the local database is SQLite while live is MariaDB ([[Q98]]); and §20 says a value is
      written in the asset owner's language while the file rule says English ([[Q99]]).

      One lint finding here was a test asserting almost nothing — `expect.any(Object)` over the whole
      result — now asserting the four-field shape §20 declares.
      -->
- [x] 5. The modules the implementation needs  <!-- skills: hor-external-api-client (invoked in full — no digest exists), hor-constant-definition, hor-type-interface, hor-sequelize-model, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~1740s; wall-time: ~2400s -->
      <!--
      Five modules, one shared constant pair, and one development seeder the criteria could not be
      checked without.

      **`AiRunResponseBuilder` is the one body both callers share**, which is §12's own constraint:
      two shapes for one answer is what a reconciliation path exists to avoid. The renderer calls it
      at checkpoint 6 and the callback job calls the same method at checkpoint 7. **The client id is
      part of the `where`**, so another client's run is never loaded at all — which is what makes the
      ninth criterion's refusal indistinguishable from an unknown key rather than a `403` that
      confirms the run exists.

      **The signer computes nothing of its own.** It builds the payload and the digest through the
      same class that verifies an inbound request, so the two sides cannot drift apart. And
      `#buildCallbackHeaderHash()` answers `null` when the secret cannot key an HMAC — an empty
      string *is* a usable key to `node:crypto`, which would produce a callback that looks signed and
      verifies against nothing.

      **The URL check compares normalized `href`s, not raw text.** A callback URL of
      `https://client.example/callbacks/../../elsewhere` normalizes out of the registered prefix and
      is refused; a bare `startsWith` on the text would have matched it and posted a run's whole
      result to an unregistered path.

      **Three open questions were decided here, with the reasoning beside the code.** For [[Q92]]:
      the version every settled field shares, `null` when they disagree — because §20 speaks of one
      version per run, so two is a defect in whatever scored it rather than a state a client should
      reconcile, and `null` is already the value a run that never reached a worker carries, so no
      third shape is added. For [[Q93]]: the seven fields written out **one at a time rather than
      spreading the row**, with a test case handing in a step that *carries* a `rejections` value to
      prove it does not travel. For [[Q98]]: `result` is `ai_runs.result_body` parsed and handed back
      verbatim, so this builder reads no decimal at all — composing it from `ai_run_field_outcomes`
      would bind a shared surface to one service's field list, which is exactly what checkpoint 3
      typed it loosely to prevent. The dialect question lands on §20's worker instead.

      **[[Q103]] is resolved rather than added to.** Two spellings of `MEDIA_LIMIT_EXCEEDED`'s
      parameters existed on this branch. The kept one names *which* limit was exceeded; the other
      could not, while the contract's own row says the code covers a byte cap **or** a count. The
      stub's canned literal was changed to match in the main session rather than left for checkpoint
      6 to remember.

      **The header names now live in one place**, applied in the main session: the inbound context
      declared its own three literals, and two spellings free to drift would let a client be verified
      under one and called back under another.

      **Four spec silences recorded**: §12 #4 and §19 are in tension and nothing says which wins
      ([[Q108]]); a `result_body` that will not parse has no stated answer ([[Q109]]); the seeded
      runs leave three response fields null on every row ([[Q110]]); and the run-key header's
      spelling is a reading the contract does not state ([[Q111]]).

      **The catalogued outbound-client package was declined a second time** ([[Q106]]), and the
      reasoning is now consistent across both of this repository's outbound clients: the terminal
      callback has no external response shape to wrap, because §12 stores the status code and
      explicitly stores no body.
      -->
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

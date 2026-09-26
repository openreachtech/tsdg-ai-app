# #asset-media-extraction  Field suggestions from an asset's photos
<!-- spec: asset-media-extraction @ sha256:256e5268aa05565360d60b8b902bac351d723a59472ed56bec520bcad6c595c6 -->
<!-- repositories: backend -->

Constraint: the AI proposes and never decides (#scope, permanently out). The response
            carries no field by which a record could be approved — the shape is the
            enforcement, not a rule somebody remembers

Constraint: every model output passes a code check before it leaves this service. No
            evidence, no value: a field without a majority stays empty, never guessed and
            never coerced to zero

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent -->  <!-- wall-time: ~900s -->
      <!--
      Four use cases and **seventeen** acceptance criteria, the most of any feature in this version,
      each checked for reach against a product holding all six earlier features. `depends` names
      `run-delivery`, `provider-layer` and `media-fetch`, and all three are built.

      **Everything the criteria name exists except two things, and both were checked rather than
      assumed.** `ai_model_calls.reading_index` is there for "each reading is recorded separately
      with its own reading index" — `#provider-layer` built it. `confidence_method_version` is on
      `ai_run_field_outcomes` for the formula-version criterion. `MEDIA_UNREADABLE`,
      `MEDIA_UNSUPPORTED` and `MEDIA_LIMIT_EXCEEDED` are all in the failure-reason constants, and
      the limit's parameter spelling is settled ([[Q103]]).

      **The first gap is a contradiction with an already-built feature** ([[Q121]]). §20 wants video
      **refused** and audio **ignored** — two different endings. `#media-fetch` built the
      distinction as a boolean `is_active`, false for both, and that was the right shape for what
      §18 asked, whose own wording is "refused by name rather than ignored" — one behaviour for
      both. Three outcomes do not fit in a boolean. This has to be decided before step 2 is written,
      because step 2 is where the difference has to be acted on.

      **The second is a criterion whose subject does not exist** ([[Q122]]). "A client that has
      exceeded its rate limit is refused, and no run is created and no model is called" is the only
      mention of a rate limit in the entire specification, and no limiter is wired anywhere —
      `express-rate-limit` sits in `package.json` with no call site. The criterion is precise about
      the one thing that matters (before a run, before a model call, so it belongs at the request)
      and silent about every figure. And "the client's rate limit" implies a per-client figure that
      `api_clients` has no column for.

      **Two criteria were checked for reach and do not reach forward.** "The service writes nothing
      back to the caller's record" is a property of this response, not of a later feature. And "a
      value without an absolute majority is not returned, and a required field without one is
      reported as missing" needs only what §20's own steps 5 and 6 build.

      **One thing to carry rather than rediscover:** the fourth use case asks that a client build its
      whole screen "before any API key exists, because the stub answers **deterministically from the
      media the request names**". That is a constraint on checkpoint 4's stub — canned, but derived
      from the request rather than fixed — and it is sharper than any stub this version has written
      so far.

      **Two open questions already bear on this feature and are not new here**: [[Q99]], the reason
      strings being written in the asset owner's language while the file rule says English, and
      [[Q113]], whose cancellation channel this feature's `executeAiRunWork()` is the first to be
      obliged to honour.
      -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — the delegate covers the shared UI/UX context, and this product declares no frontend row; digests: none -->  <!-- wall-time: ~700s -->
      <!--
      Four use cases walked on paper against the built product. **Three complete. The fourth
      completes only once [[Q121]] is settled.**

      "the client system asks for field suggestions for one asset from its photos, and gets back a
      value per field with a confidence, a one-line reason and which photos each value came from" —
      completes. The response shape is §20's own result table, `AiRunResponseBuilder` hands
      `result_body` back verbatim ([[Q98]]), and the fixture set now carries a succeeded run whose
      result body is that exact shape, added when [[Q114]] was settled.

      "the client system sends an asset type whose fields cannot be suggested from a photo at all,
      and gets a successful run carrying no suggestions and no model call" — completes, and it is the
      one use case that needs nothing from a provider. Step 1 returns no fields and the run settles
      succeeded with an empty `fields[]`.

      "the client system sends a field the photos cannot show, and gets it reported as missing rather
      than guessed at" — completes. `missingFieldPaths[]` is in the result table, and §20's fifth
      step says outright that a field without a majority is not returned.

      "the client system builds and demonstrates its whole suggestion screen before any API key
      exists, because the stub answers deterministically from the media the request names" —
      **completes for everything except a request naming a video or audio**, which is [[Q121]]: the
      stub cannot demonstrate a refusal and an ignoring it cannot tell apart. Every other part is
      reachable: the POST, the accepted response, the queued status, and a canned result derived
      from the request's own `media[]`.

      **Nothing was routed to `/hora-spec`, and that is a judgement rather than an absence.**
      [[Q121]] is a contradiction between §20 and §18 and does want a spec decision — but §18's
      feature is built and its data model is what would change, so the honest route is a decision
      taken with the data model in hand rather than a specification edit made ahead of it. Recorded
      and carried into checkpoint 3, which is where that column would be added.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-database-design, hor-sequelize-migration, hor-sequelize-model, hor-type-interface, hor-constant-definition, hor-restfulapi-architecture, hoc-naming, hoc-jsdoc, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~900s; wall-time: ~1500s -->
      <!--
      §20 declares **no table of its own** — the field schema, the asset's category and the media
      list all travel with the request — so this checkpoint is the API surface plus the one schema
      change [[Q121]] forced.

      **Q121 settled, and the reasoning is the part worth keeping.** §20 wants video *refused* and
      audio *ignored*; `#media-fetch` had built a boolean. `is_active` is **replaced** by
      `handling_name`, one of three words held as constants — and the endings are a constant
      vocabulary rather than a fourth master table because **a fourth kind is a row (the service
      already knows all three things it might do with one), while a fourth handling is a branch of
      behaviour that does not exist until code implements it.** Seeding one would promise an ending
      nothing could carry out. Kinds stay data; endings stay code; [[Q94]]'s property is intact.

      Replaced rather than kept alongside, because two columns able to disagree — a kind marked
      inactive and handled — cost a reader more than the missing third state did. And this master's
      `is_active` never carried the column's usual meaning anyway: every kind seeded here is one a
      caller may legitimately name, which is the whole reason video and audio have rows.

      **The costs were named rather than discovered later**: this is now the only master without
      `is_active`; a kind can no longer be withdrawn by a flag, and removing the row instead gives a
      caller "unrecognized value" rather than "a kind we know and do not handle"; and the migration's
      `down` restores the column without its per-row values.

      **The inspector kept the property its old tests existed to prove.** The cases that handed in a
      set with video's flag **on** and asserted it was then handled are preserved in spirit — a set
      whose video row says `handle` is still asserted handled — and sharpened: a new describe asserts
      one set answers **three different words** for the three kinds, which a class collapsing refuse
      and ignore again would fail. An unseeded name answers `null`, deliberately not `ignore`.

      **Three API types declared**, following `aiRunGet.d.ts`. `AiRunAcceptedResponse` went in a file
      of its own because `BaseAiRunPostRenderer` builds it and every AI service answers with it —
      the one place the precedent was extended rather than copied, reported as such.

      **The renderer class was deliberately not created**: a class under the scanned folder is a live
      route the moment the engine boots, and the stub is checkpoint 4's.

      **Two silences recorded rather than guessed at**: three shapes the request and result never
      declare ([[Q123]] — and `asset.province` is the one that fails silently), and a contract that
      says a status is always `queued` in one section and "as it now stands" four sections later
      ([[Q124]]), where the type follows the shipped code.

      **[[Q122]] deliberately not built.** Rate limiting is this feature's criterion and its subject
      does not exist; it is checkpoint 6's to wire, and it needs a decision first — a per-client
      limit means a column on a table belonging to an already-accepted feature.
      -->
- [x] 4. Stub API  <!-- skills: hor-stub-api (invoked in full — no digest exists, and see [[Q100]]), hor-restfulapi-architecture, hor-type-interface, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~1610s; wall-time: ~2400s -->
      <!--
      **This stub goes further than any other in this version, and the departure was put to me
      rather than taken quietly.** It does not only accept: it settles the run it accepted, with a
      result body derived from the request.

      **I accepted it, and the reason is that the alternative cannot satisfy a use case the spec
      states and checkpoint 2 verified.** §20's fourth: *"the client system builds and demonstrates
      its whole suggestion screen before any API key exists, because the stub answers
      deterministically from the media the request names."* `AiRunAcceptedResponse` carries four
      fields and **none of them is `fields[]`** — so an accept-only stub hands a client a run key
      that reads back as queued forever and no suggestion screen at all. With the settle, a client
      posts, gets a key, reads it back through the route `#run-delivery` made real, and sees a full
      suggestion body with no Redis, no worker, no provider and no key.

      **`hor-stub-api`'s "hardcoded literals only" is a GraphQL-shaped rule** ([[Q100]] records that
      the skill has no REST chapter at all), and its grand principle — canned, shape-accurate, the
      real class name and the real interface — is kept whole.

      **And the departure is bounded at exactly the skill's real worry**, which is a client coming to
      depend on pseudo-logic that later drifts. Every *identifier* on the surface follows from the
      request — which `path` each field carries, which `mediaKey` it cites, which keys were
      unreadable, the `mediaSignature` echoed — and those are **contract properties**, not behaviour.
      Every *judgement* — the value, the state, the agreement, the confidence — is drawn from a
      SHA-256 digest of the request, which nobody can mistake for a rule they could learn. That split
      is what makes it a stub rather than a shadow implementation.

      **Where the determinism stops is written into the class**, not left to be found: the run never
      passes through `running`, so the waiting state cannot be demonstrated against this route; media
      kind is ignored entirely, so a video is cited like a photo; `maxLength`, `unit` and number
      range are not honoured; the weighting is a demonstration and not the formula, and **no
      `confidenceMethodVersion` is recorded, deliberately**.

      **The abstract dispatcher member was left unanswered rather than filled with a sham.** It names
      the queue this service's runs go to, and there is no queue until checkpoint 7 — so the
      statement stays unmade and its *consumer* is overridden instead, with the removal condition
      written down exactly. The base's commit-time registration is untouched, because the rule it
      encodes holds whether or not there is a queue.

      **[[Q123]]'s province was read as a human-readable name, and the reading was made loud.** It is
      written into each field's `reason` line, so a client sending a code sees `for an asset in 01.`
      sitting in a sentence meant for a person, on its own demo screen, on day one. That is the
      failure mode the question names — a silent mismatch — turned into a visible one.

      **Writing the stub found a real inconsistency, which is what a stub is for** ([[Q127]]): the two
      counts inside `agreement` had four spellings in this repository, and one route would have
      answered both depending on which run was read. Settled in the main session in favour of the
      columns, being what the real renderer will read from.

      **Twelve of the seventeen criteria are not backed here and no test pretends otherwise** — the
      reading count and index, the five dropping rules, majority settling, confidence computed rather
      than read, the formula's version, the unreadable and unsupported reason codes, the photo cap,
      and the rate limit. The unit says so itself, including that its "no suggestible field" case is
      its own derivation and not the criterion, whose "no model call" half is vacuous in a class that
      never calls one.
      -->
- [x] 5. The modules the implementation needs  <!-- skills: hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-constant-definition, hor-type-interface, hor-sequelize-model, hor-external-api-client, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1 (cut off); wall-time: ~5400s -->
      <!--
      **The agent was killed mid-work by a session rate limit and its report was lost**, so the
      decisions below were read out of the code rather than taken on its word, and the main session
      finished the checkpoint.

      Nine classes, one per step §20 names plus three that orchestrate what `#media-fetch` built:
      `SuggestibleFieldSelector`, `AiRunMediaCollector` / `AiRunMediaProviderUploader` /
      `AiRunMediaRecorder`, `AssetMediaReadingFetcher`, `AssetFieldReadingInspector`,
      `FieldConsensusResolver`, `AssetFieldConfidenceScorer`, `AssetMediaExtractionResultBuilder`.
      **The three orchestration classes sit under `app/aiRunMedia/` rather than under this feature's
      folder**, which is right: step 2 arranges pieces that belong to the media concept, not to the
      service that uses them.

      **[[Q125]] is answered, and the answer is one of the three the question laid out.** The
      collector carries a `mediaBudgetMilliseconds` and spends it down one medium at a time — and **a
      medium it never reached is still named**, because a caller that cannot tell an unreadable file
      from one nobody got to has been told nothing.

      **[[Q113]] is honoured, and the ordering is the part that matters.** The signal is asked
      **before** each reading rather than after: a run whose time limit has already won is a run whose
      row is settled, so a provider call made then is billed against nobody waiting for it.

      **Three things the repository's own rules caught, which the lost report would have called
      style.** The model's answers were named for the word §20 uses — `readingItem` — and `item` is a
      forbidden suffix; the right name was already in that sentence, since each is a reading **of one
      field**, and `reading` was taken 94 times over. 148 identifiers renamed to `fieldReading`. Two
      reduce callbacks carried their guards inside the callback where a conditional may not go —
      including the signal check itself — and each guard is now a method whose early returns say only
      which readings and which media add nothing. And a clock reached as `dateClient` is now
      `DateCtor`, the way every other constructor seam here is named.

      **Three `_orders` test files existed and none of them ran.** The barrels that define this
      folder's order had not been told about them, which is exactly the trap the testing convention
      warns about and the reason it asks for that import to be written by hand. Wiring them took
      `_orders` from 375 tests to 400 — twenty-five tests that had been written and never executed.

      **One thing the interruption left undone**: `AiRunMediaProviderUploader` has no test at all, in
      either tree. Carried into checkpoint 6 rather than left to be noticed.

      **A trap in my own verification, worth recording.** Running `./test.sh --seeded tests/_orders/`
      does **not** tear down and migrate — it seeds onto whatever is already there. Two such runs in
      a row produced five then eight failures on unique-id violations, which read as a real defect
      and were an artifact of the invocation. The full `./test.sh` rebuilds, and it was green on two
      consecutive runs.

      Final state at `52ebf86`: `npx eslint .` clean, 3268 across 90 suites and 400 across 6.
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

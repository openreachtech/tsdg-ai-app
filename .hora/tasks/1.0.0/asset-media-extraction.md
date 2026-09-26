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

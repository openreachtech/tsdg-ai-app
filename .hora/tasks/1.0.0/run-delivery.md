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

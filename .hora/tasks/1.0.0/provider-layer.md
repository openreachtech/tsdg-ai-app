# #provider-layer  The provider layer, stub by default
<!-- spec: provider-layer @ sha256:83f672508e611f9ab742084aa142ed546ad1bcf6de5f5a245387bb4bef95e5b0 -->
<!-- repositories: backend -->

Constraint: the stub is what a default installation runs, in every environment — not a
            test double. The whole path is exercised on a machine with no key

Constraint: the calibration target is out of scope for now (#scope). The seam promised for
            it is that the confidence formula carries a version and every run records which
            version scored it

Constraint: only the client modules open an outbound connection

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent, and the main session read the skill in full --> <!-- wall-time: ~1800s -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — this checkpoint's delegate covers the shared UI/UX project context, a frontend surface this feature has none of; digests: none --> <!-- wall-time: ~900s -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-database-design, hor-sequelize-migration, hor-sequelize-model, hor-type-interface, hor-constant-definition, hor-sequelize-seeder, hor-ai-prompt-document-store, hor-multi-llm-provider, hoc-naming, hoc-jsdoc, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-accessors; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 --> <!-- agents: 7; agent-time: ~1010s; verify-time: 0s; wall-time: ~4200s -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation at all. §17 states it outright — there is no operation for editing a prompt this version, and a change is a direct database write by an operator on the machine. Note the word means two different things here: this checkpoint's stub is a fake API for a frontend to build against, while this feature's stub is a real provider driver that a default installation runs. The second is built at checkpoint 5, not here. -->
- [x] 5. The modules the implementation needs  <!-- skills: hor-multi-llm-provider, hor-ai-prompt-document-store, hor-sequelize-model, hor-sequelize-seeder, hor-backend-testing, hoc-jest, hoc-errors, hoc-classes-principles, hoc-classes-prohibits, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-naming, hoc-jsdoc, hoc-accessors; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 --> <!-- agents: 8; agent-time: ~2500s; verify-time: 0s; wall-time: ~7200s -->
- [x] 6. Actual API  <!-- n/a: this feature adds no API operation at all. §17 says so outright — there is no operation for editing a prompt this version, and a change is a direct database write by an operator. This differs from #run-contract, where the same clause did NOT make 6 n/a: that feature delivered the request path itself — the engine, the per-request context and the base renderer — while declaring no route. This one delivers no request-path code at all. Its drivers are a library the worker calls, and the worker is #run-execution. See Q12. -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern; digests: hora-skills-ort-renchan 0.2.1 --> <!-- n/a: the placement skill was run over this feature's processing rather than judged by eye, and the answer is that there is no placement left to make here. Composing a prompt and resolving a driver are reads. Recording a call is one insert — light, no external I/O. The one genuinely heavy piece is the model call itself, which the skill puts on the Worker side by its own rule of thumb (external I/O, an AI call) — but this feature builds the *driver*, not the thing that invokes it. §11 gives the worker process, its queue connection and the dispatch rule to #run-execution, so the placement of the heavy work is that feature's and the trigger does not exist yet. Nothing this feature owns sits in a request path, because it has none. --> <!-- agents: 0; agent-time: 0s; verify-time: 0s; wall-time: ~600s -->
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

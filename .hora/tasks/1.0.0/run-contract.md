# #run-contract  The shared entry every AI service is reached through
<!-- spec: run-contract @ sha256:0b1771ee17532844be32d367942ae90f3f4cd0fad64794fa43bc22dbb47e125d -->
<!-- repositories: backend -->

Constraint: every later service's POST extends what this builds, so the base renderer and
            the context are the seam. A concrete route belongs to the service that answers it

Conflict: declares `ai_runs` and its columns. Four later features write those columns and
          none of them adds one. A feature that needs a new column says so rather than
          adding it here quietly

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent, and the main session read the skill in full --> <!-- wall-time: ~900s -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — this checkpoint's delegate covers the shared UI/UX project context, a frontend surface this feature has none of; digests: none --> <!-- wall-time: ~1100s -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-database-design, hor-sequelize-migration, hor-sequelize-model, hor-type-interface, hor-constant-definition; digests: hora-skills-ort-renchan 0.2.1 --> <!-- agents: 5; agent-time: ~900s; verify-time: ~560s; wall-time: ~2400s -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation at all — it declares no route, and a concrete route belongs to the service that answers it -->
- [x] 5. The modules the implementation needs  <!-- skills: hor-sequelize-seeder, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-naming, hoc-jsdoc, hoc-accessors; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 --> <!-- agents: 8; agent-time: ~2600s; verify-time: ~640s; wall-time: ~5400s -->
- [x] 6. Actual API  <!-- skills: hor-restfulapi-architecture, hor-resolver-validator, hor-resolver-share, hor-backend-testing, hoc-jest, hoc-errors, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-naming, hoc-jsdoc, hoc-accessors; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 --> <!-- cleared: 1; reopened-by: 18; agents: 11; agent-time: ~2950s; verify-time: ~345s; wall-time: ~6300s -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern; digests: hora-skills-ort-renchan 0.2.1 --> <!-- n/a: the placement skill was run over every piece of this feature's processing, not judged by eye. Four of the five are reads or pure computation, which its step 1 returns through the API; the one write is a single-row insert with no external I/O, no model call, no file generation and no large record count, so its step 2 keeps it in the request path too. Step 3 is never reached, so step 4 — what triggers a worker — has nothing to answer. The heavy work this service does belongs to #run-execution, which the spec gives the worker process and the queue, and to the services that call models. --> <!-- agents: 1; agent-time: ~132s; verify-time: 0s; wall-time: ~600s -->
- [x] 8. Security audit  <!-- skills: hor-security-audit; digests: none — an audit skill is invoked in full --> <!-- agents: 4; agent-time: ~2730s; verify-time: ~1055s; wall-time: ~5400s -->
- [x] 9. Verify the use cases again, against the built API  <!-- skills: none matched — this checkpoint delegates to nothing and is walked in conversation; digests: none --> <!-- agents: 0; agent-time: 0s; verify-time: 0s; wall-time: ~2400s -->

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
- [x] 18. Acceptance (E2E and unit both)  <!-- skills: hor-backend-testing, hoc-jest, hoc-test-execution; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 --> <!-- cleared: 1; reopened-by: 18; agents: 1; agent-time: ~940s; verify-time: 0s; wall-time: ~5400s -->

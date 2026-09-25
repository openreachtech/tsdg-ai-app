# #run-record  The run record and its decision trace
<!-- spec: run-record @ sha256:2b2e3f30dfee08896044a00f7761d362e67eca380740c3d7a128a592580c58b5 -->
<!-- repositories: backend -->

Constraint: progress events are out of scope for now (#scope). The seam promised for them
            is that every step boundary is already recorded here, so emitting from those
            boundaries later changes no step and no run

Constraint: the decision trace carries no value read out of a medium. It outlives the
            content by two years, and a value kept in it would survive the purge meant to
            remove it (#retention)

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent, and the main session read the skill in full -->  <!-- wall-time: ~1500s -->
      <!--
      Read closely enough to build from, and one finding came out of it.

      Both use cases open with `an operator ... reads it back`, and at this feature's gate
      there is nothing to read with: the API read-back is #run-delivery (6th) and the command
      `one run with its steps in order` is #operator-cli (10th). §10 declares no
      `### RESTful API` section at all, and reordering is impossible — #operator-cli depends
      on a chain that runs through this feature.

      Settled as a clarification rather than a forward reference, by the owner, and §10 now
      carries the sentence: an operator reads these rows directly on the machine, exactly as a
      prompt is edited in #provider-layer. So checkpoint 9 will verify what the record holds,
      not that an operator can run something — which the added paragraph says outright, so a
      later reader cannot take that gate for evidence of a tool.

      The six acceptance criteria were each checked for reach. `ai_runs` already carries
      `cancel_requested_at` AND `canceled_at` as separate columns, `failure_reason_code` and
      `content_purged_at` — all built by #run-contract — so criteria 1, 4 and 5 are checkable
      here against the record rather than against a cancel flow that does not exist yet.
      Criterion 6's second clause (`none of it is removed by the content purge`) is checkable
      only as a schema property at this gate: that no column of `ai_run_field_outcomes` holds
      a value read out of a medium. The purge itself is #retention, 11th.
      -->
- [x] 2. Verify the use cases can be met  <!-- skills: hora-spec-backend (stage 4 re-entry), hor-database-design; digests: none — an interactive checkpoint starts no agent -->  <!-- wall-time: ~1800s -->
      <!--
      Use case 1 walked without a gap: `ai_run_steps` holds `step_index` (unique with
      `AiRunId`), `step_name`, `AiRunStepCategoryId` and both timestamps, so the order, what
      each step was and how long it took are all readable.

      **Use case 2 could not be walked, and the data model was changed.** It reads the
      agreement counts and the reason code `recorded against the step that settled it` — but
      the counts sit on `ai_run_field_outcomes` and `reason_code` sits on `ai_run_steps`, with
      no key joining a field to its step. Routed to /hora-spec stage 4 by the rule that owns
      it (`a use case the data model cannot represent`), and stage 4 was re-entered on this one
      table, reading the rest as context.

      `ai_run_field_outcomes` gains `AiRunStepId`, **NOT NULL**. The owner first approved it as
      NULL; the walk then showed NULL reopens the hole in exactly the rows the use case is
      about — a field that came out `missing` is the one whose reason code has to be
      reachable — so NOT NULL was proposed instead and approved. It is a claim, not only a
      tightening: no field outcome may exist outside a step, and a later summarizing pass that
      wanted one would need a migration.

      Caught at zero cost: the migration for this table is checkpoint 3's and had not been
      written. This is the second instance of the same missing-join shape — Q57 recorded it
      for `ai_model_calls` -> `ai_run_steps`, where it is still open.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-database-design, hor-sequelize-migration, hor-sequelize-model, hor-sequelize-seeder, hor-type-interface, hor-constant-definition, hoc-naming, hoc-jsdoc, hoc-classes-principles, hoc-classes-notations, hoc-methods, hoc-accessors; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 3 units + 1 verifier; wall-time: ~2700s -->
      <!--
      Five tables: three masters (`ai_run_step_categories`, `ai_run_field_statuses`,
      `ai_run_evidence_categories`), and the two transactional ones (`ai_run_steps`,
      `ai_run_field_outcomes`). Migrations 000017-000021, master seeders 000007-000009.

      **The API half is not applicable, and the verifier confirmed it three separate ways**
      rather than taking §10's silence for it: §10 carries no `### RESTful API` while §12, §13,
      §15 and §20 each do; §10 says outright that a run is read back from the database this
      version; and all four routes the contract declares trace to other sections. It also
      checked the other direction — that no contract shape needs a column this feature owed and
      did not build.

      **The gate failed once.** `types/models/AiRunFieldOutcome.d.ts` declared
      `suggestionConfidence: string | null`, which is true of MariaDB and false of the SQLite
      every Jest run uses — established by writing a row and reading it back, not by reading
      the source. Corrected to `string | number | null`. This is the repo's first DECIMAL
      column, so it sets the precedent; Q67 holds the open half, whether to normalize instead
      once a consumer exists.

      **Two spec edits came out of the build, both approved before they were written.**
      `rejected_items` became `rejections`, because `item` is on the eslint `id-denylist` and is
      forbidden as a suffix — verified in the package itself, and the glossary had already
      recorded the same call once for `fieldItem`. The three evidence keys follow §6's
      terminology table rather than §10's looser sentence; Q66 records what that forecloses.

      Checked and found correct, by execution: every model matches its migration attribute for
      attribute, both composite uniques actually raise, `AiRunStepId` NOT NULL actually refuses
      a null, no DB-level FK constraint exists on any of the five, and use case 2 walks for real
      -- a field outcome reaches its step's reason code. Q65 and Q68 hold what was deferred.
      -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation at all. §10 carries no `### RESTful API` section, where §12, §13, §15 and §20 each do, and a paragraph added at its spec gate says a run is read back directly from the database this version. Checkpoint 3's verifier confirmed it from the other direction as well: all four routes `.hora/contracts/1.0.0/client-api.md` declares trace to other sections, and no contract shape needs a column this feature owed and did not build. There is nothing for a stub to stand in for, and nothing for a frontend to build against — this product declares no frontend row at all. -->
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

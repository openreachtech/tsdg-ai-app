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
- [x] 5. The modules the implementation needs  <!-- skills: hor-backend-testing, hoc-jest, hoc-errors, hor-sequelize-model, hor-sequelize-seeder, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-naming, hoc-jsdoc, hoc-accessors, hoc-scope; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1 catalog search + 4 units + 1 fix + 1 verifier + 1 fix; wall-time: ~5400s -->
      <!--
      Built: AiRunStepRecorder, AiRunFieldOutcomeRecorder, AiRunTerminalStatusInspector +
      AiRunStatusRecorder, three ESM constant bridges (closing Q65), and development seeders
      for both new tables (closing half of Q68). The consumer that will import them is
      #run-execution; checkpoint 6 is n/a, so this is where the six acceptance criteria of
      section 10 are tested or nowhere.

      **The catalog search ran once, first, as the rule requires**, and its most useful answer
      was where it found nothing: a grep for state machine over all 33 catalogued packages
      returned zero files. It checked and rejected two near-misses with quotes from their own
      docs -- LatestStatusMixinModel is a history-table shape with no guard and no write path,
      and mentsu-path-group-schema states it holds no database schema and never reads storage.
      Only TimestampSeedsSupplier and ModelAttributeFactory were reused, both already in use.

      **The checkpoint failed once, on the orchestrator's own briefs -- Q69.** Three units were
      told different things about where their rows come from, and three of them wrote to a
      table unique on (AiRunId, step_index). Each unit reported its allocation disjoint and
      each was right about its own file; the first run of the folder together was the gather
      step, and it failed on the spot. Fixed by the rule one unit had reached unprompted: an
      order test creates the rows it stands on, in its own id block, and borrows none.
      Order-independence was then demonstrated with a throwaway reversed barrel, not argued.

      **The verifier wrote 14 mutations of its own and killed all 14**, each by exactly the
      tests that should have caught it. It settled the question worth asking about criterion 4
      -- whether a succeeded run records none is asserted or merely never exercised -- by
      mutating a succeeded run to write a reason code, which turned 3 tests red. It also caught
      its own error: a first round showing every test failing came from snapshotting the
      database after an _orders run, not from the repository.

      Two findings closed after it: a failed run could be recorded with no reason code and
      nothing refused it -- the column is nullable, so unlike the step recorder there was no
      NOT NULL to lean on and the guard had to live in the class; and the tree's only beforeAll
      fixture hoist, against rules/testing.md and against its own two siblings from the same
      pass. The new guard treats a whitespace-only reason code as absent, on the ground that
      section 6 makes a reason code a lookup key rather than prose -- a key of blanks resolves
      to no wording while reading as filled in.

      1271 + 98 tests green, lint clean. Q69-Q75 record what this checkpoint turned up, of
      which Q75 is the one that reaches past this feature.
      -->
- [x] 6. Actual API  <!-- n/a: this feature adds no API operation at all -- the same fact that made checkpoint 4 n/a, confirmed there three ways rather than inferred from silence. The exit condition's second half, that the unit tests covering this feature's acceptance criteria pass, is not waived by that: all six were written and run at checkpoint 5, which is where the modules they exercise live. This differs from #run-contract, where the same clause did NOT make 6 n/a, because that feature delivered the request path itself. -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern; digests: hora-skills-ort-renchan 0.2.1 -->  <!-- n/a: decided with the placement skill rather than by eye, as the checkpoint requires. Its decision flow opens with Is it a write? -- and these modules are writes. But they sit in no request path, because this feature has none, and the thing that will call them is the worker #run-execution declares in section 11. This feature builds the recorders, not the thing that invokes them -- the same shape as #provider-layer's checkpoint 7, which built the driver and not its caller. The skill's own rule of thumb points the same way: it puts external I/O, AI calls, large record counts and file generation on the heavy side, and all three recorders are single-row inserts against the local database. Nothing this feature owns belongs outside a request path it does not have. -->
- [x] 8. Security audit  <!-- skills: hor-security-audit; digests: hora-skills-ort-core 0.4.0 -->  <!-- agents: 7 verifier rounds; wall-time: ~5400s -->
      <!--
      Seven rounds. The first three found real defects of substance; the last four found no HIGH
      and no MEDIUM, and every finding of every round is closed.

      **What the substantive rounds found.** A rejection carrying a name, an address and a medical
      status verbatim into a column kept 730 days while the content it describes is purged at 30.
      A prototype-borne `callbackUrl` reaching the column through the public method, because the
      allow-list was read with `Object.keys` while Sequelize's setter walks the chain. A field
      state normalized for the decision and written raw, so `'01'` coerced to 1 and a row said a
      field came out `extracted` on no evidence. Counts taking free text. Two master ids checked by
      nothing, on a table that declares no database foreign key by the rule that integrity is
      application code.

      **Then one family, for four rounds: a refusal, a docblock or a test title stating something
      the code does not do.** Every round closed its instances and the next found the same shape
      one door narrower - which is the entry worth reading later, because the pattern is not that
      the guards were wrong. They held. What kept being wrong was what the code said about itself.

      Three times a rule this feature states in prose turned out to be enforced in some of the
      places it applies and not others, and all three ended the same way - the rule given one place
      to live and injected through the seam this feature already uses: `AiRunInstantInspector` for
      an instant (three recorders declared `Date` and none asked), `AiRunKeyInspector` for a key
      (one recorder held both of its keys to a shape while the recorder beside it wrote eight
      messages out of a key nothing had checked).

      **The section 10 reading was attacked hardest and stood.** Both `AiRunEvidenceCategoryId` and
      `suggestion_confidence` are declared NULL *when nothing was settled*, so on a settled field a
      null is the marker for the opposite state; writing it made a dropped score indistinguishable
      from a field nothing scored, on the one row the second use case reads. Round five verified
      against the spec's own text (`:427`, `:827`, `:829`) that no legitimate settled state is made
      unrecordable by refusing it - the three dropped-field paths all land on `missing`, which
      reaches none of the guards.

      **Two residuals are written into the code rather than claimed closed:** a sentence joined by
      the characters the three rejection patterns allow passes all three, and a run of nineteen
      digits or fewer is a key whatever else it may also be. Both say where the guarantee actually
      rests - on the callers that build those texts - because a reader who took the pattern for the
      whole truth would not look there.

      Q81-Q84 recorded: the `input` versus `params` divergence between this repo and the testing
      rule; a declared `Date` and a declared `BIGINT` checked at each writer rather than at the base
      model; and `instanceof Date` refusing an instant that crossed a job queue as JSON, which is
      `#run-execution`'s to answer.

      **Round eight's fixes rest on mutation testing, not on an eighth audit.** Seven rounds closed
      every finding and the seventh said it had nothing left in scope once its two were closed; the
      last commit was verified by six mutants, all killed, and by both suites and lint. Recorded
      here rather than passed over in silence.
      -->
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

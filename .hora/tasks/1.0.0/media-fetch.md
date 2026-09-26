# #media-fetch  Fetching media, and recording what left
<!-- spec: media-fetch @ sha256:78fe51b533df604f126b2b2f31209b594f4055461ca530962855b0af8337954c -->
<!-- repositories: backend -->

Constraint: video is out of scope for now (#scope). The seam promised for it is that a
            medium's kind is a value the request already carries, so a kind this version
            does not handle is refused by name rather than ignored, and adding one later is
            a row

Constraint: no fetched file is kept in long-term storage. The temporary copy lives on the
            worker's disk for the length of the run

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- skills: hoc-requirement-definition; digests: none taken — an interactive checkpoint starts no agent -->  <!-- wall-time: ~600s -->
      <!--
      Three use cases and six criteria, each checked for reach against a product holding
      `#run-contract`, `#provider-layer`, `#run-record` and `#run-execution` and nothing later.

      **Everything the criteria name is already declared except one thing.** The caps are in the
      non-functional section — "10 MB per photo, and at most 12 photos in one request — matching
      the client's own upload limit, so nothing is refused twice for different reasons". Both reason
      codes the fourth criterion distinguishes are in `constants/aiRunFailureReasonConstants.cjs`:
      `MEDIA_FETCH_FAILED` for a file that could not be fetched at all, `MEDIA_UNREADABLE` for one
      fetched but unreadable. The fifth criterion's "when the run ends" hook is the base worker
      `#run-execution` built.

      **The gap: nothing says where the media allow-list lives** ([[Q91]]). The first criterion
      turns on it — "a file URL whose host is not on the allow-list is refused, and nothing is
      fetched" — and the term is defined in §5's glossary as "the set of hosts this service may
      fetch a file from". But §23's key file map is an empty table, no section names a config file
      or an environment key for it, and **§18 declares its three tables exhaustively and none of
      them is an allow-list**.

      That omission-from-the-data-model is itself the strongest evidence available, and it is what
      the reading rests on: an environment key, read through the globals barrel like every other
      deployment fact this service holds. Development and live must point at different storage, so
      the value cannot be a constant; adding a host is then a deployment change rather than a
      migration. Recorded as a question rather than settled silently, because it is a durable design
      fact the spec does not state.

      **Criterion 3 was checked for reach and does not reach forward.** "Every file handed to a
      provider is recorded" reads as a property of the recording, not a claim that anything hands
      one over at this gate — the step that does is `#asset-media-extraction`'s second. The egress
      record is written by whatever does the handing, and this feature builds the table and the
      writer.
      -->
- [x] 2. Verify the use cases can be met  <!-- skills: none matched — the delegate covers the shared UI/UX context, and this product declares no frontend row; digests: none -->  <!-- wall-time: ~500s -->
      <!--
      Three use cases walked on paper. All three complete under the spec as written, once the
      allow-list has a home ([[Q91]]).

      "ORT fetches the files a run needs and refuses a URL that points anywhere else" — the refusal
      is the allow-list check; the fetch is an outbound HTTP read of a URL the request carries.

      "ORT answers, months later, exactly which file was handed to which provider and when" —
      `provider_uploaded_files` holds `AiRunMediaId`, `AiProviderId`, `provider_file_name`,
      `uploaded_at` and `expires_at`, and §18 states it is kept independently of whether the run's
      content still exists. `ai_providers` is `#provider-layer`'s and already seeded, so the join
      resolves today.

      "a run given a file too large fails with a reason the caller can act on, before anything has
      been sent" — `byte_size` is checked against the cap before any upload, and
      `MEDIA_LIMIT_EXCEEDED` is the one reason code of the seven that carries parameters, which is
      what lets the limit be named rather than described. That was confirmed against
      `.hora/contracts/1.0.0/client-api.md` rather than assumed.

      No gap, so nothing was routed to `/hora-spec`.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-database-design, hor-sequelize-migration, hor-sequelize-model, hor-sequelize-seeder, hor-type-interface, hor-constant-definition, hoc-naming, hoc-jsdoc, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~910s; wall-time: ~1500s -->
      <!--
      Three tables exactly as §18 declares them, run in parallel with `#run-delivery`'s own
      checkpoint 3 on one branch, with the migration numbers (`000022`-`000024`) and the row-id
      prefix (`104`) handed down before either started so the two could not collide. They did not.

      **The unit found a defect the default wiring would have carried.**
      `inflection.singularize('AiRunMedia')` is **`AiRunMedium`**, and Sequelize builds both the
      foreign key and the loaded property name from that singular — so left to inference,
      `ProviderUploadedFile.belongsTo(AiRunMedia)` would resolve to `AiRunMediumId`, a column no
      table has. Both the key and the alias are now stated, verified against `sequelize@6` in an
      isolated probe rather than assumed. **Consequence for checkpoints 5-7, written into a comment
      and pinned by a test: an include must read `include: [{ model: AiRunMedia, as: 'AiRunMedia' }]`,
      never `include: [AiRunMedia]`.** `tableName` infers correctly and is pinned too, because a
      silent resolution to `ai_run_medias` would break every read.

      **One reading taken where §18 is silent** ([[Q94]]): `is_active` on the category master carries
      which kinds this version handles. It makes "refused by name rather than ignored" a data fact
      rather than a list in code, and it obliges checkpoint 5 to read the flag.

      **Two criteria have no test here and that is correct** — the temporary copy's deletion and
      "no fetched file in long-term storage" are worker behaviour. The schema's contribution is that
      no column anywhere holds file bytes, which is prose in the migration and not something a test
      can assert.

      **The allow-list and the caps were left alone, deliberately** ([[Q91]]): no table, no
      environment key, no cap enforcement. `byte_size` stores what the caller declared. The seeder
      does carry an over-cap row (`10410010`, 20 MB) so checkpoint 5 has a fixture.

      Indexes follow the repository's settled pattern over the letter of §18, which marks two keys
      "indexed" and says nothing about the other three: master-category `INTEGER` keys get none,
      `AiProviderId` gets a plain index because the egress record is read from the provider's side
      too. Every index name fits inside the 64-character limit, so no `SHORT_COLUMN_NAME` was needed.
      -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation, which is the checkpoint's own not-applicable clause. Confirmed mechanically rather than by eye, the same three ways checkpoint 3 of `#run-execution` used: §18 carries `### Data model`, `### Use cases` and `### Acceptance criteria` and **no `### RESTful API`**, where §12 and §20 each carry one; it adds no operation to `.hora/contracts/1.0.0/client-api.md`; and the `media[]` array its work reads belongs to the POST body of `#run-contract`, already built and already stubbed there. There is no operation for a stub to shadow. -->
- [x] 5. The modules the implementation needs  <!-- skills: hor-external-api-client (invoked in full — no digest exists), hor-constant-definition, hor-type-interface, hor-sequelize-model, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~1700s; wall-time: ~2400s -->
      <!--
      Eight modules under a new `app/aiRunMedia/` concept folder, each backing a named criterion.

      **The allow-list folded into `MediaFetchClient` rather than becoming a class of its own**,
      because the glossary already maps "media allow-list" to that name and a second class would have
      been a second name for one concept. The host check runs **before** the request is built, so a
      refused host opens no connection — asserted with a spy that must not have been called, which is
      the difference between "refused" and "fetched and then discarded".

      **The failure direction is closed rather than open.** An undeclared `MEDIA_FETCH_ALLOWED_HOSTS`
      builds an empty allow-list, which refuses every URL. That is why not applying the environment
      edits broke nothing, and why `.env.live` declares the key **empty**: a deployment states the
      client's storage hosts, and until it does nothing is fetched.

      **Two small decisions that are security decisions.** The file on disk is named by the
      `ai_run_media` row id and never by `media_key` — a key of `../../etc/passwd` is legal under the
      contract — and both ids pass `AiRunKeyInspector` before becoming a path segment. And the kind
      check reads `is_active` rather than the word `image`, with two test cases handing in a set where
      video's flag is **on** and asserting it is then handled: that is what proves the flag is read
      and not the name ([[Q94]]).

      **The file system is not mocked in the workspace tests**, because the deletion is the subject.
      The only mock in the whole set is the network, reached through a static getter, and what stands
      in for a response is a real `Response` rather than a hand-written double.

      **Five spec silences found and recorded rather than settled**: which megabyte "10 MB" means
      ([[Q102]]); that the limit reason's parameters have no field names and **two spellings now
      exist on this branch** ([[Q103]]); that the kind refusal is required by the constraint block and
      the contract and by **no acceptance criterion**, so nothing at this gate would catch its
      removal ([[Q104]]); that use case 2 has no operation to call and checkpoint 9 will find that
      ([[Q105]]); and two catalogued packages read and declined with reasons ([[Q106]]).

      **Four lint findings in this work were worth more than silence**, and two of them were tests
      asserting almost nothing: a rejection asserted only to have happened now names the missing
      file, and a spy asserted only to have been called now names the URL it was called with.

      **What this checkpoint could not keep**: the fifth criterion is half-kept. `removeWorkspace()`
      deletes, and nothing calls it — that is checkpoint 7's, and the only thing that knows a run has
      ended is the base worker.
      -->
- [x] 6. Actual API  <!-- n/a: this feature adds no API operation, the same not-applicable clause checkpoint 4 established and by the same three mechanical checks: §18 carries `### Data model`, `### Use cases` and `### Acceptance criteria` and no `### RESTful API`; it adds no operation to the client contract; and the `media[]` array its work reads belongs to a POST `#run-contract` already built. Worth naming what this leaves uncovered rather than letting the n/a imply nothing was lost: §18's second use case — "ORT answers, months later, exactly which file was handed to which provider and when" — is answered by `provider_uploaded_files` and its join and by no operation at all, which is recorded as [[Q105]] for checkpoint 9 to meet honestly rather than to fail against. -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern, hor-renchan-job-bullmq, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1; agent-time: ~800s; wall-time: ~1400s -->
      <!--
      **The placement walk ran first and decided that no placement is added.** The removal is not a
      new piece of processing looking for a home — it is part of the run's own lifecycle, on the
      worker's own disk, in the process already running the run. No job, no queue, no scheduler,
      consistent with §18 declaring no `### Background jobs` section. Nothing was built for
      `MediaFetchClient` and no caller was invented for it: the run that fetches is
      `#asset-media-extraction`'s second step, and that feature is not built.

      What this checkpoint owns is the **fifth criterion**, which checkpoint 5 could only half-keep:
      `removeWorkspace()` deleted and nothing called it. The call now sits in a `finally` around the
      settling rather than after the terminal write, because "when the run ends" is not "when the run
      succeeded".

      **`return await` inside that `try` is the load-bearing line**, and it was verified in the main
      session rather than taken on the comment's word: a bare `return promise` completes the
      try-statement before the promise settles, so the `finally` would delete the files while the
      work was still reading them. Both call sites use `return await`.

      **A removal that fails changes nothing about how the run ended** — it logs and swallows.
      `#executeJob()` is the boundary the framework calls and where the terminal state is written, so
      the repository's boundary rule applies; and a throw from a `finally` would *replace* both the
      result and any exception already on its way out, which is worse than merely wrong.

      **Five ways of ending pass through the hook**, each with its own test: the work finished, the
      work threw, the run went past the 300-second limit, the terminal write itself threw, and
      anything else thrown out of the settling.

      **Three ways do not, and each is written into the class rather than left to be rediscovered.**
      A delivery whose process is killed between the fetch and the removal runs no `finally`, and
      nothing in this service sweeps what it left ([[Q107]] — §19's three purge jobs are all database
      sweeps). On the time-limit path the work is still running when the removal happens, so a copy
      written afterwards outlives the run, and there is no signal that stops it. And *canceled* does
      not reach a worker at all today, because `#run-cancel` is not built — worth reading at that
      feature's own checkpoint 7.

      **The file system is not mocked in any test whose subject is the deletion.** Each writes real
      bytes into the directory the worker itself would build, under the machine's temporary
      directory with no root injected, then asserts reading it back rejects with `ENOENT` — the
      shape checkpoint 5 set. The workspace is stubbed in exactly two places, both where a directory
      that refuses to be removed cannot be arranged on every platform the suite runs on.

      **[[Q89]] still holds and was read before anything relied on it**: `app/jobs/` holds no job, so
      the daemon binds no queue and the base worker has never executed through one. Every test here
      reaches the worker directly. That does not weaken the fifth criterion — the criterion is about
      a file being deleted when a run ends, and every ending is driven — but "a real job, through
      Redis, deleted its real files" is not established and is not claimed.
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

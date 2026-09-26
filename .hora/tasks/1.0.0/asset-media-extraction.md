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
- [x] 5. The modules the implementation needs  <!-- skills: hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hoc-accessors, hor-constant-definition, hor-type-interface, hor-sequelize-model, hor-external-api-client, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- cleared: 2; reopened-by: 9, 8; agents: 3; agent-time: ~14400s; wall-time: ~16800s -->
      <!--
      **Second pass, after checkpoint 9 sent the run back for the module that was missing.**

      `StubAssetFieldReadingSupplier` is the service-owned fixture the stub driver's own docblock
      said this service owed. It draws deterministic readings from a digest of the media signature,
      the photographs actually read, the field path and its kind — through the existing
      `StubAnswerDigester`, not a second one.

      **The seam sits inside `AssetMediaReadingFetcher`, between the model call and the recording
      of it**, for three reasons worth keeping: the record then holds the findings the run went on
      to settle rather than disagreeing with them; the draw happens once per run rather than once
      per reading, so the three readings agree and step 5 can settle anything at all; and the
      driver is recognised by `aiModelProcessor.aiModel`, the key the catalog itself resolves by,
      never by class — so nothing outside a test imports the stub driver.

      **Nothing is bypassed.** The fixture answers a tool call in a vendor's shape, and steps 4, 5
      and 6 run over it for real: values outside the schema are still dropped, consensus is still
      counted, and confidence is still scored from observed agreement. It is recognisable as a
      fixture from the client's side — every reason begins `[stub] ` and text values read
      `stub-value-<n>` — because a number field's value is a number and a select's is the caller's
      own option, so neither can carry a mark.

      **The agent corrected the main session's evidence, and the correction matters more than the
      defect.** The exhibit cited for "the driver settles nothing" was a run that stands in the
      fetcher deliberately, for a question about audio, and says so in its own comment. The
      diagnosis held — `StubAiModelProcessor#buildFunctionCall()` answers `arguments: {}` — but the
      proof did not. Recorded in [[Q129]] as the third instance of this version's dominant family:
      **no test in the repository exercised step 3 on that driver at all**, because every case
      reaching the reading step stood the reading step in. That is why checkpoint 5 passed over it
      the first time, and why run 10630106 — a whole run on the keyless driver with only the
      network and the workspace stood in — now exists.

      **[[Q133]] was answered one way by the fixture and left open for a person**: the reason reads
      marked English, on the ground that §20's two statements conflict only for a fixture, and "no
      display wording of its own" is the safer half.

      **[[Q134]]**: the first full run after this work died of `Jest worker ran out of memory` at
      jest's default 11 workers against 4.3 GB free — eleven suites reported failed, only one test
      actually failing, most in files nothing had touched. Settled by measurement rather than by
      retrying: the same tree passes twice at `--maxWorkers=4 --workerIdleMemoryLimit=512MB`.

      Verified green on two consecutive full runs: `npx eslint .` clean, 3497 across 102 suites and
      422 across 7.

      **Third pass, sent back by checkpoint 8 rather than by 9.** The fixture above opened a
      reproduced availability defect: the whole media signature and the read photographs were
      digested **once per field**, so one accepted request could hold this service's own queue for
      tens of minutes of synchronous CPU — which the 300-second run limit cannot interrupt, a
      deadline being unable to stop synchronous work and a blocked event loop being unable to fire
      the timer carrying it. The run-invariant part is now digested once per run; measured on the
      real class, 1000 fields against a 100 KB signature fell from 159 ms to 8 ms, and the cost no
      longer depends on the signature at all.

      Three linear scans over caller-sized collections became keyed lookups, **one of them found by
      the implementer rather than named in the brief** — `FieldConsensusResolver#buildRejection()`,
      the largest of the three when nothing settles. Behaviour was held by a 4,000-case randomised
      differential against the pre-change semantics, including the rule that a duplicated path
      keeps its first entry, which a `Map` preserves only when built to.

      A non-string media signature is now refused at the supplier boundary rather than overflowing
      the shared digester's recursion — the narrower fix, since every other caller depends on that
      recursion as it is.
      -->
      <!--
      **First pass**, whose run record is folded into the line above.

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
- [x] 6. Actual API  <!-- skills: hoc-classes-principles, hoc-classes-constructor, hoc-naming, hoc-jsdoc, hoc-methods, hor-constant-definition, hor-restfulapi-renderer, hor-backend-testing, hoc-jest, hoc-test-execution; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- cleared: 1; reopened-by: 8; agents: 2; agent-time: ~3400s; wall-time: ~4000s -->
      <!--
      The stub's body and every `*Stub*` member are gone, and the route now accepts and leaves the
      run `queued`. Nothing executes it until checkpoint 7 wires the job — intended, written down,
      and a real state of the product between these two commits rather than a regression.

      **The agent corrected the assignment on two points, and both corrections held on inspection.**

      **[[Q122]]'s premise was wrong, and the error was mine.** §7's non-functional table has
      carried a `Rate limiting` row all along (line 227) naming the scope and the reason. The grep
      behind "that line and nothing else" was case-sensitive against a heading that reads `Rate
      limiting`. That row is what decided the design: what is counted is **runs accepted**, not
      requests received, because what the limit defends is three model readings per run.

      **Four criteria this brief assigned here are not request-side, and were not duplicated.**
      §20's unreadable / video-refused / audio-ignored / photo-cap criteria are run failures
      carrying a reason code and parameters, already built and tested in checkpoint 5's
      `AiRunMediaCollector`; `MEDIA_LIMIT_EXCEEDED`'s parameters cannot travel in an HTTP refusal
      envelope at all. They become *reachable* at checkpoint 7. The agent declined on the grounds
      that a second implementation gives one rule two answers, and said it disagreed with the gate
      rather than with the criteria — which is the right shape for that disagreement.

      **What this checkpoint's own criterion cost.** `AiRunRateLimitInspector` counts `ai_runs`
      rows accepted for the client with the window bounded at both ends, 60 per 60 seconds, as
      constants rather than environment values. There is no `express-rate-limit` call site, and its
      absence is deliberate: that middleware counts requests in process memory before the client
      has been resolved, which is neither the subject nor the unit §7 names.

      **Both checkable halves of the criterion are asserted.** The refusal returns `429`, and a
      separate describe renders and then asks `AiRunAcceptor#findAiRun()` for the run, proving none
      was created. The third half — "no model is called" — is not assertable here, because no model
      is called on this path at this checkpoint under any input.

      **The ordering it chose is recorded as [[Q128]], not fixed here.** The check runs before the
      idempotency lookup, so a repeat of a stored key is refused while the window is full. §20's
      criterion is met either way; §7's sentence argues the other way; and moving it means a hook on
      `BaseAiRunPostRenderer`, which three features' routes sit on.

      **The contract drifted and was corrected here**: `.hora/contracts/1.0.0/client-api.md`'s
      refusal table stopped at `422` and now carries `429`, stating the ordering that ships rather
      than the one [[Q128]] prefers.

      **Checkpoint 5's one gap was closed on the way**: `AiRunMediaProviderUploader` had no test in
      either tree, and now has both, with the `_orders` barrel line written by hand.

      **`__tests__` fell from 3268 to 3259 while gaining three suites**, which is the stub's 24
      test blocks leaving and 27 real ones arriving. Checked rather than assumed, because a count
      that drops is the one a report is most tempted to round past.

      Verified at two consecutive full runs: `npx eslint .` clean, 3259 across 93 suites and 412
      across 6.
      -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern, hor-renchan-job-bullmq, hoc-classes-principles, hoc-classes-constructor, hoc-classes-notations, hoc-naming, hoc-jsdoc, hoc-methods, hor-constant-definition, hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 1 (resumed once); agent-time: ~3002s; wall-time: ~4900s -->
      <!--
      The placement skill ran first, as this checkpoint's own rule requires, and found work: a run
      writes six tables, fetches up to twelve files from somebody else's storage, uploads them and
      reads them three times through a model inside a 300-second limit. Request-based trigger, one
      queue, one job directory. `hor-post-worker` was excluded on two grounds rather than one — its
      story is told for GraphQL and this entry point is REST, but it would be the wrong placement
      on a GraphQL surface too, because the run **is** what the caller asked for rather than a side
      effect beside it.

      **The renderer's removal condition was met exactly as it was written** at checkpoint 6:
      `UNBUILT_QUEUE_JOB_DISPATCHER`, its getter and the `#ensureJobDispatcher()` override are gone
      and `get:JobDispatcherCtor` names the real dispatcher.

      **The queue was not the only thing missing, and that is this checkpoint's largest finding.**
      Two master tables the run's own code reads had never been seeded by any feature — the row
      binding the agent to a model, and the agent's reading tool. Confirmed against the committed
      tree before the fix. `#provider-layer` passed all eighteen gates holding code that could not
      execute; recorded as [[Q129]], with the seeders added here.

      **Two tests had written that gap down as the design**, which is what made it survive. A
      describe named `'should be empty'` and a `toolSchemas: []` each carried a comment saying the
      service agent has no tool bound to it this version — while `AssetMediaReadingFetcher` refuses
      outright a run whose agent offers no reading tool. Both corrected. A test that canonises a
      gap does not merely miss it; it defends it against the next reader.

      **The base hook the agent reported rather than took, taken here.** `BaseAiRunJobWorker`
      hardcoded `failureParameters: null`, so §20's photo-cap criterion was met as far as the
      reason code and not as far as "with the limit named in the reason's parameters". The other
      two hardcoded sites were checked first and are correct — one is the success path, and
      `TIME_LIMIT_EXCEEDED` names no parameters in the contract — so exactly one changed, not
      three. The new `#extractAiRunFailureParameters()` answers null by default, so every existing
      subclass gets what it got before.

      **Three stale sentences fell out of that change and were swept for rather than fixed one by
      one**: a comment in the worker's test, a longer one in the worker's source still describing
      the behaviour as unreachable, and two comments disagreeing on how many of the seven codes
      carry parameters — four against six. The contract settles it at six, so "four" was wrong.

      **The class the user split.** `AssetMediaExtractionRunner` carried twelve injected
      collaborators, complexity 14 against a maximum of 12. No complexity exception exists anywhere
      in this repository and the next largest factory is 8, so the rule was reporting a design
      signal rather than a tight threshold. The media phase moved to `AiRunMediaPreparer` under
      `app/aiRunMedia/`. The boundary landed one method off where the main session measured it, with
      a reason: `#buildParsedRequestBody()` parses the whole request rather than its media, so it
      stayed on the runner and the extractor became a class seam instead of a held collaborator —
      nine defaults, complexity 11, rather than ten and exactly at the limit.

      **A method-level verification flaw, found here and worth keeping.** Runs were being reported
      with `bash ./test.sh > log 2>&1; echo "EXIT: $?"`, whose exit status is the `echo`'s and is
      therefore always 0. The real status went to a file nobody read. Earlier green claims stand,
      but on the evidence that both summary pairs printed with zero failures — `test.sh` runs under
      `set -e`, so a failing group stops the run and the second pair never appears. That, not the
      exit code, is the check.

      Verified green on three consecutive full runs, the last on the exact tree committed:
      `npx eslint .` clean, 3394 across 100 suites and 419 across 7.
      -->
- [x] 8. Security audit  <!-- skills: hor-security-audit (invoked in full, not through a digest) -->  <!-- cleared: 1; reopened-by: 9; agents: 3; agent-time: ~2656s; verify-time: ~2656s; wall-time: ~3200s -->
      <!--
      **Three runs over this gate, and the middle one is why the record is worth reading.**

      Run 1 (before checkpoint 9 sent the feature back): 0 HIGH, 1 MEDIUM, 1 LOW, both accepted and
      recorded as [[Q130]] and [[Q131]].

      Run 2, repeated **whole** because checkpoint 9 had changed 3-7 underneath it: **it failed.**
      The fixture built to satisfy §20's fourth use case had opened a reproduced availability
      defect — the whole media signature and the read photographs were digested **once per field**,
      against a `fieldSchema` and a `mediaSignature` that nothing bounded at accept time. One
      authenticated request could hold this service's own queue for tens of minutes of synchronous
      CPU, which the 300-second run limit cannot interrupt. Measured by two parties independently
      before the fix and by the main session after it: 1000 fields against a 100 KB signature fell
      from 159 ms to 8 ms, and the cost stopped depending on the signature at all.

      Run 3, **scoped to the fix** as the rule requires of a re-run that follows one rather than a
      reopening: both findings resolved and reproduced as resolved, 0 HIGH / 0 MEDIUM / 0 LOW.

      **What run 3 checked rather than accepted, at the main session's request.** That no
      caller-controlled input still multiplies against another — verified one axis at a time, with
      the body limit capping their sum. That the bounds cannot be stepped around — a 200,000-deep
      array, a `String` object, a `{toString}` object, a number, `false` and `0` are each refused in
      under 0.08 ms, before any row, transaction or queue connection. That the digest has no
      reachable collision — every non-string collapses onto the "absent" digest, but every one of
      them is refused at the door, leaving only `null` and `undefined`, which are the same request.
      And that the `Map`/`Set` rewrites preserved `.find`'s duplicate-first-wins: its own 4,000-case
      differential, probed at `__proto__`, `constructor`, `toString` and `''`, found 0 mismatches.

      **Three INFO observations, and one of them was mine.** `AssetMediaExtractionPostRenderer`'s
      docblock still said the `422` and `429` lines were absent from the contract and "reported as
      drift" — untrue, because this session had written all three into it. Corrected, and swept for
      siblings. [[Q136]] records that a field path over 191 characters is accepted, runs, and is then
      silently dropped by two recorders. [[Q137]] records that every declared medium is written before
      the count limit is asked, with the reason it is recorded rather than fixed.

      **A correction worth keeping for whoever touches step 2.** The scan at
      `AssetFieldReadingInspector:700` is bounded **because step 2 throws `MEDIA_LIMIT_EXCEEDED` and
      ends the run**, not because the door bounds the declared media list — it does not.
      `sentMediaKeys` is what the request declared, so a photograph sent but unreadable still counts
      as sent. Relaxing that throw would remove the only thing holding that line.

      **A deployment note, not a defect**: the bounds live at the door and the worker re-reads the
      stored body without re-checking, so any run queued before this change still executes
      unbounded. Retry amplification is not a concern — the dispatcher sets `attempts: 1`.
      -->
      <!--
      **Run 1's own record**, kept as written.

      Read-only audit over this feature's own 64-file change set, not the repository — the
      repo-wide pass is the version sweep's. **0 HIGH, 1 MEDIUM, 1 LOW**, both accepted and
      recorded rather than fixed, which is the second clause of this checkpoint's exit condition.

      **The SSRF family this release twice produced is not reopened**, and the check was specific
      rather than reassuring: `redirect: 'manual'` still stands, the allow-list is still re-asked
      every hop, the https-to-http downgrade is still refused per hop, and there is **no second
      fetch path anywhere in the change set** — nothing routes around that client.

      **[[Q130]] (MEDIUM)** — fetched media is trusted to be whatever its `content-type` header
      claims; no byte is ever read to check. Accepted because it is not exploitable in 1.0.0, for a
      reason that was verified rather than assumed: the only driver is the stub and
      `BaseAiModelProcessor#prepareAttachedFiles()` returns the list unchanged, so nothing leaves
      the machine and nothing parses a byte. The fix is a spec decision — which formats this
      service accepts — before it is an implementation, and `hasLeftTheMachine()` is the named seam
      where the guard goes when the first real driver lands.

      **[[Q131]] (LOW)** — the rate limit counts then acts, so one burst per window passes. Accepted:
      authenticated-only, self-correcting within the window, and §20's criterion is true of the
      state it names. Recorded beside [[Q128]] deliberately, because both concern the same few lines
      and a reservation built while the ordering is undecided would be built twice.

      **The one thing that would have made it HIGH was checked and is false.** `context.now` is the
      server's clock — `AppRestfulApiContext` defaults `requestedAt = new Date()` — and the client's
      timestamp header reaches only the freshness and signature checks, never the count.

      **[[Q132]]** is out of this feature's scope and recorded for the sweep: two `.env` variants are
      tracked in a public repository against a bare `.env` ignore line. Their values are
      self-documented development fixtures, and the decision worth making is about the pattern.

      **The audit corrected the brief on the point that set F-1's severity.** The brief said media
      "is uploaded to a model provider"; in 1.0.0 no media leaves the machine at all. That is the
      difference between a latent hole and a live one, and it was verified independently before the
      finding was accepted.

      Clean on every other check the skill runs, including the six this feature specifically
      created: workspace path construction and its guaranteed cleanup, what reaches the provider
      and whether a caller can steer it, logging (no URL, file name or body fragment reaches an
      operator log), the new master seeders' privileges, job-body mass assignment, and whether the
      new failure parameters can carry anything internal out to a client.
      -->
- [x] 9. Verify the use cases again, against the built API  <!-- cleared: 1; reopened-by: 9; agents: 0; wall-time: ~2400s -->
      <!--
      **Second attempt. Met.** The first is recorded below and is why checkpoint 5 was reopened.

      Walked operation by operation against real shapes, not against intent: `POST
      /v1/asset-media-extractions` answers `202` with a run key, the job executes the run, and the
      settled body reaches the client two ways — `GET /v1/ai-runs/:runKey` and the terminal
      callback both build it with `AiRunResponseBuilder`, so there is one shape and two deliveries
      rather than two shapes that must be kept agreeing.

      **Use case 1 — a value per field, with a confidence, a one-line reason and the photographs it
      came from.** Structurally met: every settled field carries `value`, `suggestionConfidence`,
      `reason` and `sourceMediaKeys`. The "in Vietnamese" clause is **not** met by anything built,
      and that is [[Q133]] rather than a failure here: `reason` is passed through verbatim from the
      model, and the prompt the service composes says "the language the asset owner reads", which
      is §20's own other sentence.

      **Use case 2 — an asset type with no suggestible field.** Met, and asserted exactly: run
      10630105 answers `{"fields":[],"missingFieldPaths":[],"unreadableMediaKeys":[],"mediaSignature":"…"}`
      with the "no model call" half proved by a spy rather than described.

      **Use case 3 — a field the photographs cannot show.** Met: `missingFieldPaths` carries
      `attributes.frontDirection`, a select the request bounded to no options, and it carries no
      value at all. The `date` field beside it is correctly **not** missing, because step 1 never
      offered it — the distinction the criterion exists to make.

      **Use case 4 — the whole screen before any API key exists.** Met, and this is what the first
      attempt failed on. Run 10630106 settles three fields on the keyless driver with three
      distinct field states, three distinct confidences and a missing field beside them,
      deterministically: same request answers the same way, different photographs and a different
      signature each answer differently.

      **One honest limit on how much that demonstrates**: in this case all three fields cite the
      same photograph. Nothing requires them to differ — `sourceMediaKeys` being a subset of what
      was sent is the criterion, and it holds — but a screen whose every field points at one photo
      shows less than a real one will. It is a property of this case's draw, not of the design.
      -->
      <!--
      **First attempt, not met** — kept as written, because it is why checkpoint 5 was reopened.

      **Not met on the first attempt, and it sent the run back into checkpoint 5.**

      Three of §20's four use cases hold against the built API. The fourth does not: *"the client
      system builds and demonstrates its whole suggestion screen before any API key exists, because
      the stub answers deterministically from the media the request names."*

      **On the only driver that exists, every run settles with no fields at all.** Confirmed rather
      than reasoned: `_orders` run 10630104 carries readable photographs, settles successfully, and
      produces `{"fields":[],"missingFieldPaths":[],"unreadableMediaKeys":[],"mediaSignature":"..."}`.
      `StubAiModelProcessor`'s own docblock says why and says whose job the remedy is — it fills in
      no findings because it opened nothing, and *"a service that wants demonstrable answers without
      a key supplies them as a fixture of its own"*. This service had supplied none.

      **Two further spec statements land on the same gap**, which is what makes it more than a
      missing convenience: the glossary defines `media signature` as the value *"which makes the
      stub's answer deterministic for the same input"* — nothing consumed it that way — and the
      version's own acceptance criterion requires the pass to be **demonstrable** with no API key,
      which an empty screen is not. That criterion is judged by the sweep, so this would have failed
      there too, after the merge.

      **The user chose to build the fixture rather than amend the spec**, both being open (the
      version is unreleased). Checkpoint 5 is reopened for it, and checkpoint 8 with it, because
      3-7 changing underneath an audit is a re-run rather than a scoped re-check.

      **[[Q133]] came out of the same read** and is not what sent the run back: §20 states the
      reason's language twice and differently.
      -->

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

# #operator-cli  The read-only operator command
<!-- spec: operator-cli @ sha256:79a1b72b484ac3e7e3f68befb3a96fa26eb465e294dbdaabfb87c9652e7e4b36 -->
<!-- repositories: backend -->

Constraint: no command changes any run's state, and none prints a request or result body.
            It is stricter than any API caller

Constraint: it opens the database directly, so it answers while the API is not serving.
            That is the whole reason it exists before a console does

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- agents: 0; wall-time: ~900s -->
      <!--
      **§16 contradicted itself about the one field that is personal data, and the contradiction
      was load-bearing rather than cosmetic.** Its third criterion said the CLI prints "ids,
      states, timings, counts and reason codes **only**" — a closed whitelist. Its fifth said a CLI
      row carries "the same facts a list row carries: **subject**, kind, status, elapsed time,
      token spend". A list row does carry `subjectLabel` (verified in
      `AiRunPageResponseBuilder#buildAiRunRowResponse()`), and §7 counts that column as content,
      which is why the retention purge empties it. So one criterion required printing it and the
      other forbade it, and the whitelist also excluded `kind`, which the fifth required too.

      **Settled by the author: the CLI does not print the subject.** The deciding fact is that the
      database gives that column a thirty-day clock and a terminal scrollback, a runbook's output
      and a scheduled task's log have no clock at all — so the looser reading would have moved
      personal data from a store that forgets into stores that do not. It also makes the section's
      own claim true: "stricter than any API caller" only means something if the command omits
      something the API returns. No use case is lost, because finding a run is by threshold, by
      time or by correlation id, never by subject.

      **Three approved edits, each read in full before it was written.** The commands paragraph now
      names the subject among what is never printed and gives the clock as the reason; the third
      criterion anchors to §7's own list instead of carrying a competing whitelist; and the fifth
      enumerates what a row does carry.

      **A fourth edit corrected the third.** The first wording of the fifth criterion kept the same
      trap it had just removed — a colon followed by a partial list — and it silently dropped
      `lastCompletedStep`, which is exactly what an operator wants from the stalled-runs command.
      It now enumerates every field a list row carries, minus the subject. Caught before any code
      rested on it.

      **The provenance line still names the pre-amendment text.** That matches every other feature
      in this version whose spec was amended during its build — #retention's was amended four times
      and its hash was never refreshed either. Recorded here rather than left for a later
      reconciliation to read as unexplained drift.
      -->
- [x] 2. Verify the use cases can be met  <!-- agents: 0; wall-time: ~1200s -->
      <!--
      **All three can be met, and the check turned up two things that decide checkpoint 5's
      shape.** None of this was taken from a digest; each claim below is a reading of the code.

      **"Finds the run without a run key in hand" — met, but NOT by reusing the list query.**
      `AiRunPageResponseBuilder` builds its `where` with `ApiClientId: apiClientId` hard-wired, and
      §16's second criterion is that the CLI reads **across** clients. It also carries no
      since-a-given-time filter: its four are `statusName`, `runCategoryName`, `correlationId` and
      `stalledForSeconds`, and one of the four commands is "failed runs since a given time". So the
      page query cannot serve the CLI as it stands.

      **The seam §16's fifth criterion actually points at is the row shaper, not the query.**
      "Carries every fact a list row carries" is `buildAiRunRowResponse()`, which takes a run, its
      steps, its model calls and an instant, and is free of both the client scoping and the
      filters. The CLI owns its own finder and reuses that. Checkpoint 5 should take it that way
      round, and must not widen the page query — an API caller reading across clients would be a
      far worse defect than any convenience it bought.

      **"Still reads when the service will not boot" — met.** Both builders import only from
      `app/` and `sequelize/models/`; neither reaches `server/`. A command therefore activates
      Sequelize and queries, exactly as the job daemon does, with nothing of the HTTP layer loaded.
      The use case survives the very failure it names.

      **"One run with its steps" — met, but not by `AiRunResponseBuilder` wholesale.** That class
      does find the steps, through `AiRunStepRecorder#findAiRunSteps()` — but it also builds the
      parsed result body, which is precisely what §16's third criterion forbids the CLI from
      printing. Reusing it whole would hand the command the one thing it must never emit. The step
      finder is the piece to reuse.

      **"Pastes into a runbook step or a scheduled task" — met, and the output route was proved
      rather than assumed.** A command whose entire product is what it prints meets the same wall
      the scheduler scripts met: `no-console` forbids the call and `eslint-comments/no-use`
      forbids the exemption ([[Q150]]). `process.stdout.write` passes lint — verified by writing a
      probe file, linting it and deleting it, rather than by reading the rule. It is also the
      better choice on its own merits: it names the stream it writes to, which a command's output
      contract should.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- n/a: this feature adds no table and no operation -->  <!-- agents: 0; wall-time: ~90s -->
      <!--
      Not applicable by the checkpoint's own stated condition. §16 opens with "No table and no
      route", and the rest of the section keeps that promise: four commands, every one read-only,
      all of them reading tables that #run-record and #run-execution already built.

      **It is the "rare" case the condition names — a feature that only composes existing ones —
      and that is the whole design.** The CLI exists so an operator can reach what is already
      stored when the service will not answer; a table of its own would be state the thing it
      exists to observe does not have, and an endpoint of its own would be the service it is meant
      to work without.
      -->
- [x] 4. Stub API  <!-- n/a: this feature adds no API operation at all -->  <!-- agents: 0; wall-time: ~30s -->
      <!--
      Not applicable for the same reason checkpoint 3 was, and by the same route: the condition the
      checkpoint states, not an argument about it. There is no operation to stub, and the gate a
      stub exists to unblock — a frontend building against it — is marked not-applicable for this
      feature too, because the target names no frontend row.
      -->
- [x] 5. The modules the implementation needs  <!-- skills: the catalog check against @openreachtech/hora-ecosystem 0.1.0; hoc-jest, hor-backend-testing, hor-constant-definition digests. hor-strategy-pattern matched but had no digest and was not handed over — see below -->  <!-- agents: 4; agent-time: ~5600s; wall-time: ~7200s -->
      <!--
      **Twelve classes under `app/operatorCommand/`, in three units with the seam fixed by the
      main session so they could not drift apart.** The finder reads, the reporter prints, the
      command layer dispatches and returns an exit code. Suite grew from 135/4252 to **145/4728**;
      `_orders` unchanged at 8/511, correctly — nothing here writes.

      **The catalog was checked once, for the whole checkpoint, before anything was written.**
      Thirty-three tracked packages; nothing supplies argv parsing, a column formatter, a duration
      formatter or a cross-client finder. Two near-misses were rejected with reasons rather than
      by taste: `mentsu-search-condition` sounds like the finder and its own README says it
      generates no query, and `mentsu-value-inspector`/`value-normalizer` would have placed a
      second, weaker rule beside rules this repository already owns.

      **One catalog recommendation was overruled here.** `mentsu-process-clerk` offers exit-code
      helpers, and `JobDispatcherProvider` already declares this repository's own exit constants
      and *returns* the code rather than exiting inside itself. Installing a package whose own API
      doc places those helpers outside its public surface, to replace two constants written in the
      house style, is the worse trade. The catalog's warning was kept: 0/1/2, not a new invention.

      **The reporter makes the subject label structurally unprintable.** Two explicit lists name
      the eleven printed fields and each is read off the row **by name** — nothing spreads the row,
      nothing walks its keys — so a field added later prints nothing until someone adds it to both.
      A dedicated test gives every row a subject reading
      `SUBJECT-LABEL-MUST-NEVER-REACH-A-TERMINAL` and asserts it appears nowhere, and every other
      row fixture in the file carries one too, so each character-exact comparison is a further
      assertion that it did not escape.

      **The finder declined to reuse `AiRunStepRecorder#findAiRunSteps()`, and the reason is the
      right one.** That method names no `attributes`, so it selects every column including
      `rejections` — the decision trace, kept 730 days against content's 30, and the recorder's own
      docblock admits its shape checks cannot tell a person's address from a field path. Reusing it
      and asking the reporter not to print the column is exactly the arrangement that docblock
      calls worthless. So the column is never selected. **Where reuse was right it was taken**:
      the stall threshold is read through `AiRunPageResponseBuilder#buildStalledCondition()` as an
      injected collaborator, with a spy asserting the delegation — one definition of stalled in the
      repository, enforced rather than promised.

      **"Failed since" resolves to `finished_at` bounded to the failed status.** There is no
      `failed_at` column, and `AiRunStatusRecorder` refuses the transition to failed without
      `finishedAt`, so it is the failure instant rather than a stand-in for it. `accepted_at` would
      have hidden the run accepted last month and failed a minute ago — the one the command is
      opened for.

      **Dispatch is a registry, not a branch**: each suite owns its own word, a `.find()` matches
      it, and `null` is the unknown-word case. A fifth command is a file plus a name; nothing
      working is edited.

      **Two corrections the main session had to make after the units landed.** `expect.anything()`
      is banned outright and the finder used it six times — in its three most important tests, the
      ones proving no content column is selected — so it was replaced with the real seeded ids read
      out of the database and `expect.any(<Model>)` for the associations. And
      `value === undefined` was rewritten as `typeof value === 'undefined'`, which four places in
      `app/` already use; the unit reported finding no precedent.

      **A defect in my own brief, caught by the unit rather than by me.** I named
      `app/aiRun/AiRunKeyInspector.js` as the run-key rule. It inspects a **`BIGINT` row id** —
      digits only, nineteen characters — while a run key is `STRING(64)` and every seeded one reads
      `run-key-10700001`. Followed as written, `run <run-key>` would have exited 2 for every real
      run key, seeded or minted. The unit refused it and applied the rule this repository had
      already settled for the same question in `AiRunPageCursor`: printable text within the width
      of the column that stores it. Recorded in the glossary so the name cannot mislead again.

      **A process miss of mine, reported by two of the three units.** Checkpoint 5's skill match
      was made late and the names never reached the agents; they worked from the always-on rules,
      the digests already on disk and the real tree. `hor-strategy-pattern` is the one that would
      have mattered, for the command dispatch — and the registry the unit built is what that
      pattern prescribes, so nothing appears to have been lost. Recorded rather than quietly
      fixed, because "nothing was lost" is a judgement made after the fact.

      **A seeder comment corrected.** The `ai_runs` note claimed its correlation chain showed three
      shapes of "the last step finished". `ai_run_steps` seeds no row against any of those four
      runs, so all four report none. The comment now says what the fixture holds, and why adding
      the steps is not free: #run-list's accepted tests assert those rows with the last step
      absent.

      Green in WSL: 4728 across 145 suites and 511 across 8, eslint clean. Two runs before this
      died with `ENOMEM` on untouched suites — 12 CPUs, 11 default jest workers, 7.7 GiB — and the
      suite passed whole at `--maxWorkers=4`. A run configuration, not a code change; `tests/empty/`
      holds no test in this repository, so nothing is hidden behind that mode's silence.
      -->
- [x] 6. Actual API  <!-- n/a: this feature adds no API operation at all -->  <!-- agents: 0; wall-time: ~30s -->
      <!--
      Not applicable for the reason checkpoints 3 and 4 were. §16 opens with "No table and no
      route", and a command that exists in order to answer while the API is not serving would be
      undone by having one.
      -->
- [x] 7. Worker  <!-- skills: hor-execution-placement-pattern (run first, as the checkpoint requires), hor-backend-testing, hoc-jest; digests: hora-skills-ort-renchan 0.2.1 -->  <!-- agents: 1; agent-time: ~924s; wall-time: ~2400s -->
      <!--
      **The placement skill was run first, as this checkpoint's delegate order requires, and it
      ruled nothing out — because its subject is writes and this feature has none.** Its decision
      flow opens "Is it a write? If read-only, return it via an API query / GET and you're done",
      so a read-only command exits at step one and never reaches the API-or-worker question at
      all. **The step-one exit does not fit either**, and that is the part worth naming: "return it
      via a GET" presumes an HTTP caller, and §16's second use case is the exact negation — a read
      that must answer *while the service will not boot* cannot be served by the service. The
      skill has no branch for a read whose caller is a person at a terminal, and its "third place"
      warning is about scattering retry and monitoring for **writes**, which a read has none of.

      So the checkpoint kept all of its work: an entry point, the close discipline, the exit code,
      the invocation and its documentation.

      **`node scripts/readAiRuns.js`, not `npm run`, and the exit codes decide it.** Here `1` and
      `2` are ordinary outcomes rather than faults, and npm prints its own error block on any
      non-zero exit — so every refused argument would come back wrapped in `npm ERR!` lines,
      breaking both the guarantee that the reporter owns every character leaving the process and a
      scheduled task's ability to read the code cleanly. `package.json` was left alone.

      **The database is closed on every path, and the route was verified rather than assumed.**
      `SequelizeActivator` has no close method of any name — only getters — so the close belongs to
      the client it exposes: `activator.sequelize.close()`, in a `finally`. Answered, refused and
      could-not-answer are all returns and leave through it; a throw does too. The executor is
      injected as a **class** and built after activation, so the ordering no caller can get wrong
      is the only ordering there is.

      **The script itself is two statements, and the reason is worth keeping:** a script is the one
      thing in this repository no test can call, because importing it runs it and running it exits
      the runner. So everything a decision rests on sits in a class that is testable, and the file
      holds only what cannot be.

      **`ProcessClerk` is used, and no package was installed.** Checkpoint 5 declined to install
      `mentsu-process-clerk` on the catalog's recommendation; what neither the catalog check nor I
      noticed is that `@openreachtech/renchan-job-bullmq` — already a dependency — re-exports the
      same class, and `JobDispatcherProvider` already consumes it through exactly the
      `createProcessClerk()` / `ProcessClerkCtor` seam this launcher uses. The decision not to
      install stands; the reasoning behind it was working from an incomplete picture.

      **I ran the command for real, against the seeded database, because nobody had.** All four
      answer: `stalled 300` prints an aligned table, `run run-key-10010004` prints the run and its
      seven steps in order, `correlation correlation-id-10700000` prints the four-run chain
      earliest-first with all four statuses, `failed-since` prints failed runs. Three refusals —
      a malformed parameter, an unknown word, no arguments at all — each exit `2`. No subject label
      appears anywhere in any of it.

      That run also made a fixture defect visible rather than inferred: every row of the
      correlation chain shows `-` for the last completed step, which is the seeder comment
      corrected at checkpoint 5.

      **And it found what reading could not.** A refusal prints nothing at all — not on stdout, not
      on stderr — so a person who mistypes one of four rarely-used words learns nothing. No
      criterion is violated and the exit code is right, so the scope was not widened on my own
      judgement; it is [[Q153]], with the shape a fix would take and the argument against it.

      Green in WSL at `--maxWorkers=4`: 4765 across 146 suites and 511 across 8, eslint clean.
      -->
- [x] 8. Security audit  <!-- skills: hor-security-audit (invoked in full) -->  <!-- agents: 1; agent-time: ~576s; verify-time: ~576s; wall-time: ~2700s -->
      <!--
      **0 HIGH, 1 MEDIUM, 2 LOW, 2 INFO — and all three actionable findings were fixed rather than
      accepted.** Eleven of the skill's checks are genuinely not applicable: this feature opens no
      socket, declares no port and exposes no endpoint, so the questions about authorization, CORS,
      rate limiting and introspection have nothing to read. What it has instead is a command that
      opens a deployment's database and prints to a terminal, and that is where the audit was
      pointed.

      **The MEDIUM is the finding of this version I would least have found by reading.** A
      correlation id and an external ref are a caller's own text, and the rule that admits them
      (`isFilledText` + `isStorableText`) bounds their **length and nothing else** — so an escape
      sequence is storable. The reporter applied no escaping, so `ESC [ 2 K` and `ESC [ 1 A`
      reached the terminal, which acts on them: a value stored months ago could erase the line the
      operator is reading and put the next one over the top of it. **The report this command exists
      to produce could be edited by the data it reports** — and it is read precisely when the
      service will not answer and there is no second place to look.

      I proved it before fixing it: a probe handing the reporter a row with
      `corr\u001b[2K\u001b[1Aerased` showed the bytes arriving at the sink raw. The guard sits in
      `generateTextCell()`, the one method every text cell passes through, and replaces C0 and DEL
      with a **visible** `?` rather than stripping them — a silently shortened cell reads as
      ordinary text, and an operator should be able to see that somebody stored something strange.
      Written as two code-point bounds, because a regular expression carrying a control character
      is itself refused by lint and the comment that would excuse it is refused too. Four cases
      pin it, and the probe re-run confirms the bytes are gone.

      **The first LOW was a docblock asserting a control that did not hold** — the version's own
      defect family, caught by a separate reader. `reportFailure()`'s note said it logs "no
      parameter the operator typed", and its body interpolated `error.message`: a Sequelize error
      is built from its driver's message, and the driver appends the failing SQL with the `where`
      value escaped inline. So the run key the operator typed would have gone into a file with no
      retention clock, under a comment saying it did not. Now it logs `error.name`, following the
      precedent `BaseAiRunPurgeJobWorker` set for the same reason — and a third test case gives an
      error exactly that shape, so the parameter appearing anywhere in the line fails the
      comparison. The two existing cases both used a bare `Error`, so both asserted the same name
      and neither could have caught a method that logged a constant; they now carry different ones.

      **The second LOW is [[Q154]], and it narrowed a claim rather than changing shared config.**
      Outside development Sequelize echoes every query to standard output, so "the reporter owns
      every character that leaves this process" — stated in three docblocks — is false there. I
      measured what those lines carry rather than assuming: an `INSERT` logs a **bound parameter**,
      so written content never reaches the log, while a `SELECT` inlines its filter value, which
      for this service is ids, and §7 permits ids in logs. **Not a content leak.** The three
      docblocks now say "every character this command itself writes" and name the exception; the
      config change belongs to whoever owns the service's operational logging.

      **The two INFO items are pre-existing and already recorded** — hard-coded credentials in the
      `live` and `staging` config blocks, and a `.gitignore` rule that would not catch a future
      `.env.production`. Neither is in this feature's change set.

      **What the audit confirmed rather than found**, each verified against source: no operator
      value reaches an identifier position in any query, so the deliberately permissive run-key
      rule cannot become an injection; the finder never selects a content column and the reporter
      never reads the subject label, two independent locks; the five model calls in the whole layer
      are `findAll`/`findOne` and nothing opens a transaction; and the whole `env` object handed to
      the logger is never serialized.

      Green in WSL at `--maxWorkers=4`: 4770 across 146 suites and 511 across 8, eslint clean.
      -->
- [x] 9. Verify the use cases again, against the built API  <!-- agents: 0; wall-time: ~900s -->
      <!--
      **All three hold, and each was checked by running or measuring something rather than by
      reading the code that claims it.** There is no API to verify against — this feature builds
      none — so the gate is the command itself.

      **"An operator finds the run they need without a run key in hand."** All four commands were
      run against the seeded database at checkpoint 7. `stalled 300` answers an aligned table of
      runs across several clients; `failed-since` answers failed runs; `correlation
      correlation-id-10700000` answers the four-run chain earliest-first with all four statuses;
      `run run-key-10010004` answers that run and its seven steps in order. Three of the four
      questions take no run key, which is the use case exactly.

      **"An operator still reads what the runs are doing when the service will not boot."** This is
      the use case that distinguishes the feature, so a one-level grep was not enough. I walked the
      import graph from `scripts/readAiRuns.js` transitively: **34 files reachable, none under
      `server/`**, and the only top-level areas touched are `app/`, `scripts/` and `sequelize/`.
      The command cannot be broken by whatever stops the transport layer from booting, because it
      never loads it.

      **"An operator pastes a run check into a runbook step or a scheduled task."** It is a command
      and not a screen, and it ends under a code a task can branch on without reading the output:
      `0` observed on all four answers, `2` observed on a malformed parameter, an unknown word and
      no arguments at all. `1` is the read-failed path, covered by test rather than by a forced
      outage.

      **The five acceptance criteria.** Answers without a run key — yes, three of four commands.
      Reads across clients — the finder carries no `ApiClientId` in any condition and does not even
      select the column, with a test per list method asserting runs of different clients come back
      together, so a client filter added later goes red. Never prints content — the finder selects
      no content column and the reporter reads the subject label off nothing; both locks verified
      at checkpoint 8, and a probe confirms the label is absent from real output. No command
      changes state — the whole layer's five model calls are `findAll`/`findOne`, with no
      transaction anywhere. A row carries every fact a list row carries but the subject — all
      eleven columns present in the output I ran.

      **One limit worth stating rather than leaving implied.** The `1` exit code and the
      database-would-not-open path have never been exercised against a real failure, only against
      a stubbed one. Forcing it means taking the database away mid-run, which this environment
      shares with the suite. Named here so acceptance does not assume it was seen.
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
- [x] 18. Acceptance (E2E and unit both)  <!-- agents: 0; wall-time: ~600s -->
      <!--
      Scoped gate run at `.hora/acceptance/1.0.0/operator-cli.md`. **Partial** for the reason every
      acceptance of this version is: steps 3 and 4 have no equipped delegate, and here both
      candidates are frontend-shaped against a feature with neither a screen nor an API.

      Six things the record carries that a passing verdict would bury: the MEDIUM fixed inside the
      gate, where stored data could edit the report it appeared in; two notes that asserted
      controls they did not have; a refusal that prints nothing to a person; a failure path never
      seen against a real failure; and a defect in my own brief that an implementer caught.
      -->

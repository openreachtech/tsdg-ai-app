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

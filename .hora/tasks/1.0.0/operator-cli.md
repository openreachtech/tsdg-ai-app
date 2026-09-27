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

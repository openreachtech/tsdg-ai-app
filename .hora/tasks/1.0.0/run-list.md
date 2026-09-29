# #run-list  Listing runs
<!-- spec: run-list @ sha256:a37f42d99767fe83b572c64798b589e5c9013c5ed48221177712047d11b9f9b3 -->
<!-- repositories: backend -->

Constraint: the admin console is out of scope for now (#scope). The seam promised for it
            is that the list is narrowed to the calling client inside the query rather than
            in any interface, so an unscoped operator read is a second query and not a
            rewrite

Constraint: system-level monitoring is out of scope for now (#scope), unblocked by the
            service's SLA. Leave the stalled-run filter usable from a scheduled check

Constraint: this service never writes into the client's database and holds no
            credential of theirs beyond a read-only one for fetching files (#scope,
            permanently out). Build no bypass layer

Constraint: a model call is never retried automatically (#scope, permanently out). A
            provider failure is reported and the caller resubmits under a new
            idempotency key

## Spec gate
- [x] 1. Draft or confirm the specification  <!-- agents: 0; wall-time: ~600s -->
      <!--
      Confirmed rather than drafted: §13 carries three use cases, eight acceptance criteria, an
      operation whose kind and renderer are named, and a caller stated as "the client system, its
      own runs only. The scope is bound from the signature; no request parameter widens it".

      **Three things checked rather than assumed.** The contract already describes
      `GET /v1/ai-runs` with the same query string and response name, so this feature begins with
      no drift to answer. "Stalled" is defined — runs running longer than a given number of
      seconds. And what looked like a contradiction is not: the operator command's table says
      stalled runs are read "across every client", which is that feature's scope, while §13's
      eighth criterion binds this one to the caller's signature. An operator sees everything; a
      client sees its own.

      **One fact carried forward from a later feature, because it changes this one's shape.**
      `#operator-cli` requires that "a row the CLI prints carries the same facts a list row
      carries: subject, kind, status, elapsed time, token spend". So the row is not this route's
      private business — whatever builds it here is what that feature reuses, and it belongs in a
      class rather than inside a renderer.
      -->
- [x] 2. Verify the use cases can be met  <!-- agents: 0; wall-time: ~600s -->
      <!--
      All three are servable from what already exists, checked against the columns rather than
      against the design's intent.

      **"How far along the AI work is for one business object"** — `ai_runs.correlationId` is
      already stored and already written by every run-creating route.

      **"Runs that have stalled past a threshold"** — `startedAt` plus the run's status is the
      whole of what the definition needs; nothing new has to be recorded for it.

      **"One row that says what a run was about, what state it is in, how long it has taken and
      what it has spent, without joining anything of its own"** — `subjectLabel`, the category, the
      status and the four instants are all on `ai_runs`; the token spend is the sum of
      `ai_model_calls.inputTokenCount` and `outputTokenCount` for the run; the decomposed running
      state is the last completed row in `ai_run_steps`.

      **The one risk worth naming before a line is written**, because it is the shape that decays
      quietly: the token spend and the last step are both per-run facts read for a page of runs. A
      naive implementation issues one query per row and a list of fifty becomes a hundred and one
      queries. Checkpoint 3 owns the choice.

      **Correcting this note's own first draft, which named the wrong tool.** It pointed at the
      subquery convention, and that convention is explicit in the other direction: *"A subquery is
      for filtering, not eager-loading"* — if the requirement is to load B together with A for
      output, it is an `include` association. Carrying each run's token sums and last completed
      step into its row is the eager-loading side of that line. A subquery would only enter if a
      **filter** needed a condition on a related table, and `stalledForSeconds` does not: it reads
      `startedAt` and the status, both columns of `ai_runs` itself.

      **Also worth knowing before checkpoint 3 starts**: this repository has no `addSubquery` or
      `.subquery(` call site anywhere, so there is no in-tree example of either pattern to imitate.
      -->

## Backend gate
- [x] 3. DB and API schemas  <!-- skills: hor-restfulapi-architecture, hor-type-interface, hor-constant-definition, hor-sequelize-subquery, hor-sequelize-model; digests: hora-skills-ort-renchan 0.2.1, hora-skills-ort-core 0.4.0 -->  <!-- agents: 2; agent-time: ~2620s; wall-time: ~4200s -->
      <!--
      No migration and no model: §13 says "No table of its own", and every association the read
      needs was already declared. What this gate owed was the declaration, the constants and the
      API surface — and one decision each about paging and about loading.

      **The cursor is this repository's first**, so what it chose becomes the convention. It
      encodes the last row's **run key**, base64url, ordered by `ai_runs.id` descending. Two
      reasons worth keeping: a run key is already the client's, where handing over the internal
      auto-increment would let a client read from the gap between two of its own runs how many
      runs everyone else created in between; and ordering by an id that never changes is what
      satisfies §13's stated reason for rejecting offsets — a run that matches the filter
      throughout the walk is returned exactly once, whatever its status does meanwhile.

      **The obvious loading strategy was rejected on evidence, not taste.** A `SUM ... GROUP BY`
      is the fewest rows, and **MariaDB answers `SUM()` over an integer column as a `DECIMAL`,
      which the driver hands back as a string**, while the SQLite the local suite runs on answers a
      number. `inputTokenCount` would have been a number in every test and a string on the wire.
      This project has already met that dialect trap once, recorded as [[Q98]]. Three bounded reads
      per page and the arithmetic in the application have one answer everywhere.

      **An amplifier the brief did not name, closed anyway**: `request_body` and `result_body` are
      `MEDIUMTEXT`, so a page read without a named `attributes` list would pull hundreds of
      megabytes of stored bodies to answer how far some work has got.

      **The brief was wrong about `stalledForSeconds` and the correction changes behaviour.** It
      said the filter reads `startedAt` and the status. A run stuck in `queued` **has no
      `startedAt`** — the column is nullable — so that reading would have made a dead queue
      invisible in the list built to find one. Two named branches now: `queued` measured from
      `acceptedAt`, `running` from `startedAt`. Recorded as [[Q138]], because it is a decision the
      spec never made.

      **The contract was narrower than the section it implements, and was widened rather than
      noted.** It named `inputTokenCount` alone while §13's third criterion asks a row to carry
      "the token spend". That is a criterion half-met, not a preference, so both counts now travel
      — separately, because every provider prices them differently and a caller adding them should
      be one who chose to.

      **What that widening broke did not show up as a failure.** Three cases hand the builder
      hand-made model calls carrying one column; the new sum would have answered `NaN` on them —
      a number nobody wrote, passing or failing by accident. Found by re-reading, not by running.
      The figures for all thirty rows were derived from the seeders and cross-checked against a
      test written by another agent before this feature, which already asserted two of them; the
      main session derived them a third time. Three independent sources, none of them a failure
      message.

      [[Q139]] records that §13's sixth criterion carries a clause — "whichever service produced
      it" — that nothing in this version can check, because one category row exists.

      Verified green on two consecutive full runs: `npx eslint .` clean, 3877 across 111 suites
      and 427 across 7.
      -->
- [x] 4. Stub API  <!-- skills: hor-stub-api (invoked in full by the agent's own judgement; the assignment named none) -->  <!-- agents: 1; agent-time: ~616s; wall-time: ~1500s -->
      <!--
      **No stub was built, deliberately, and the argument is the checkpoint's output.**

      The skill states its own premise in its first paragraph: a stub exists "so the frontend can
      build against the API contract while the real backend logic is still unwritten". **Both
      halves are false here.** This product declares no frontend row — checkpoints 10 through 17
      are all not-applicable for that reason — and the real logic is not unwritten: checkpoint 3
      wrote the renderer, the page builder, the cursor, the adapter and the validator, answering
      real seeded rows.

      **What a stub earned elsewhere in this version was earned here by something stronger.** On
      `#run-delivery` the stub's value was not that anything called it — nothing did — it was that
      rendering a shape early surfaced [[Q96]]–[[Q101]] and [[Q103]]. That slot is filled on this
      feature: checkpoint 3 rejected a `SUM ... GROUP BY` on measured dialect evidence, corrected
      `stalledForSeconds` for queued runs ([[Q138]]), widened the contract for the second token
      count, and raised [[Q139]]. A canned literal cannot discover that MariaDB returns a string.

      **And a stub here would be worse than idle.** Checkpoint 6 arrives with "Actual API" and a
      migration instruction that says to replace the literal with real work — handing its agent a
      stub sitting on top of a finished implementation invites it to rewrite what already works.
      The sibling feature's checkpoint 6 record shows that shape: *"The stub's body and every
      `*Stub*` member are gone."*

      **The agent corrected the brief's own argument for building one.** It said this project had
      "lost a capability by deleting a stub without noticing anything depended on it". It was
      noticed — by checkpoint 9, which failed and reopened checkpoint 5. The cost was two reopened
      gates, not a shipped regression, so the episode argues for **trusting checkpoint 9**, which
      is unticked in this feature's own list.

      **What stands in its place** is one describe pinning that this renderer's file lies under the
      path the engine mounts from — a guard against a file move, honest about being no more than
      that.

      **The checkpoint also produced a finding that was wrong, and correcting it is the more useful
      record.** Probing "callable from outside" literally, the agent found the server would not
      boot here and wrote it up as an upstream defect. It is not: the loader hands `import()` an
      absolute path, which is a URL on POSIX and not on Windows, and this project is worked in WSL.
      Verified after moving there — `npm test` green at 3878 across 111 suites with jest's default
      worker count, and `node server/index.js` reporting all three listeners. Recorded in [[Q140]],
      with [[Q53]] and [[Q134]] closed beside it for the same reason, and a rule now forbidding the
      Windows shell.
      -->
- [x] 5. The modules the implementation needs  <!-- skills: the catalog check, run against @openreachtech/hora-ecosystem (33 catalogued packages) -->  <!-- agents: 0; wall-time: ~1200s -->
      <!--
      **Every module checkpoint 6 imports already existed**, because checkpoint 3 wrote them. The
      list was resolved rather than assumed — each of the six loaded under node in WSL and answered
      its own class name: the renderer, the page response builder, the cursor, the query adapter,
      the query validator and the page constants.

      **So what this gate actually owed was the catalog check**, and it returned a real answer.

      **`renchan-sequelize` ships pagination, and it is the wrong shape.** `PaginationMixinModel`,
      `RequestPagination`, `ResponsePagination` and `findAllWithPagination` are all there — and
      `RequestPagination.create({ limit, offset })` with `#createFindOptions()` returning
      `{ limit, offset, order }` is **offset paging**, which §13 rejects by name and with a reason:
      a list filtered by status is read while runs change status, and an offset page skips or
      repeats rows as they move. `findAllWithPagination` also runs a `count()` per page, which
      cursor paging exists to avoid. The checkpoint's own rule settles it — *"The spec overrides
      this"* — so checkpoint 3's fresh cursor stands, and now stands with the near-match named
      rather than unexamined.

      **`mentsu-search-condition` looked closer than it is.** It parses a recursive tree of logical
      and field nodes — an advanced filter language. This route takes four flat named parameters.
      Importing a tree parser to read four scalars is not reuse.

      **Nothing else matched.** The catalog was searched for the encoding the cursor does and for
      query-string reading; the only hits were a frontend package and an API client, neither
      serving this surface. The validator extends the project's own `BaseInputValidator` and reads
      the project's own constants, which is the reuse that was available.

      **Recorded because a "no match" is worth as much as a match here**: the reinvention this
      gate exists to catch is the one nobody looked for, and the pagination package is exactly the
      sort that would have been found later, in review, with the work already done.
      -->
- [x] 6. Actual API  <!-- agents: 0; wall-time: ~900s -->
      <!--
      **Satisfied in substance by checkpoint 3, and verified rather than assumed.** There is no
      stub to replace — checkpoint 4 argued its way out of building one — and the route has been
      answering real rows since the schema gate. What this gate owed was the criteria map, which
      hora assigns to the main session and not to an agent.

      **All eight of §13's criteria carry a test, and they were read one at a time**, not counted:
      the caller's own runs only; the last completed step on a run in progress; a row carrying
      subject, kind, status, elapsed time and both token counts; runs stalled past a threshold;
      the subject label verbatim; every run under one correlation id; the page and its next
      cursor; and the scope bound from the signature.

      **Criterion 5 was the one worth checking rather than ticking.** "Returned exactly as the
      caller supplied it, never reinterpreted" is trivially satisfiable by a test whose label is
      `Subject label of run 10700001` — a value no trim, escape or normalisation would change, so
      the assertion would pass against an implementation that reinterpreted freely. The case that
      backs it uses `'  Plot 12/B — "the corner one"  '`: leading and trailing spaces, a slash, an
      em dash and embedded double quotes. Any of those being touched is visible.

      **The failure mode this gate was warned about did not happen.** Checkpoint 4's agent flagged
      it in writing: an agent handed "Actual API" and a migration instruction saying to replace the
      literal with real work would find a finished implementation and could decide the route needs
      rebuilding. No agent was given that instruction here.

      Green at the time of ticking, in WSL, by the repository's own command: `npm test` reporting
      3878 across 111 suites and 427 across 7, `npx eslint .` clean.
      -->
- [x] 7. Worker  <!-- n/a: nothing of this feature's processing belongs outside the request path -->  <!-- skills: hor-execution-placement-pattern -->  <!-- agents: 0; wall-time: ~300s -->
      <!--
      **Decided with the placement skill, which this checkpoint requires rather than permits.**

      Its grand principle is about **writes**: "processing that changes state only ever happens in
      one of two places". `#run-list` changes no state — it is a read — so the binary the skill
      exists to resolve never engages.

      Its decision flow puts "light, short-lived, needs a synchronous response" in the API as a
      REST renderer, which is where this already is. Its four markers for the heavy side were
      checked one at a time rather than dismissed together: **external I/O** — none; **AI calls** —
      none; **large record counts** — bounded at 100 runs by `MAXIMUM_RUN_COUNT`, refused at the
      door rather than trusted; **file generation** — none.

      The read is three bounded queries per page: at most 100 runs, 600 steps and 300 model calls,
      and the bound is enforced when the request is accepted, so the figure is a ceiling rather
      than an expectation.

      **The skill's own tie-breaker was considered and does not apply.** "When the boundary is
      unclear, lean toward Worker" guards against work that is fast on today's data and slow on
      production's. Here the ceiling is a constant a client cannot raise, so the read cannot grow
      with the table — which is the property that makes the boundary clear rather than merely
      convenient.
      -->
- [x] 8. Security audit  <!-- skills: hor-security-audit (invoked in full) -->  <!-- agents: 1; agent-time: ~1110s; verify-time: ~1110s; wall-time: ~2400s -->
      <!--
      **The first audit in this version to prove anything over HTTP.** The server boots in WSL, so
      the auditor signed requests as two different clients and probed the live route instead of
      reading the code and reasoning about it — which is what every earlier gate had to do.

      **§13's eighth criterion — the one the whole feature turns on — passed by experiment.** Under
      one shared correlation id, the signing client got its three runs and the rotating client got
      its own one. `?ApiClientId=`, `?apiClientId=` and `?__proto__[ApiClientId]=` were each
      ignored, the answer identical to the unfiltered baseline. The scope comes from the verified
      signature and no parameter reaches it. An unauthenticated request answers `401`, and that
      guard was **watched firing** rather than inferred.

      **One finding, fixed here.** `?cursor=AAAA` — four characters — answered `500` with the
      driver's own error instead of the `422` the contract declares. `'A'` is zero in base64, so
      `AAAA` decodes to three NUL bytes and **re-encodes to itself**, which is all the round trip
      ever checked. The class's own docblock claimed that round trip "makes the judgment total";
      it judged the encoding and never the content, and a string of NULs reached a `where`.

      **The audit's recommended fix would have broken every paging test, and that was caught before
      applying it.** It proposed matching `RunKeyGenerator`'s mint — 64 hexadecimal characters —
      which is right about production and wrong about this repository: every seeded run key reads
      `run-key-10700001`. The guard asserts the smallest true property instead: printable text
      within the column's width. It refuses the NUL bytes without claiming to know how a key is
      minted, which the seeders and the generator disagree about.

      **Not an injection and not a scope bypass**, and the auditor established both rather than
      assuming: a cursor decoding to `x' OR 1=1 --` is escaped and answers `422`, and the client
      condition held under every probe. A foreign cursor and a fabricated one answer byte-identical
      responses, timed at 11.5 ms against 11.7 ms over twenty samples each — so neither confirms
      another client's run exists.

      **Two findings recorded rather than fixed, both outside this feature.** [[Q141]]: the framework
      returns the driver's raw message on any environment not literally named `production`, and this
      repository defines a `live` one — which of the two ships needs a person. [[Q142]]: the query
      string is unsigned, and [[Q21]]'s judgement that the harm is "a duplicate charge rather than
      any disclosure" stops being true at a route whose whole meaning is its query string.

      Green after the fix, in WSL, by the repository's own command: 3881 across 111 suites and 427
      across 7, `npx eslint .` clean.
      -->
- [x] 9. Verify the use cases again, against the built API  <!-- agents: 0; wall-time: ~600s -->
      <!--
      **The first use-case gate in this version that could be walked against a running service.**
      Checkpoint 8's auditor signed requests as two clients and probed the live route; what follows
      leans on those probes where it says so, and on the code where it does not.

      **"How far along the AI work is for one business object — every run under that correlation id
      in one answer."** Met, and demonstrated: under the shared `correlation-id-10700000`, the
      signing client received its three runs and the rotating client its own one. The grouping is
      the filter, and the scoping is the signature.

      **One honest limit on "in one answer".** The route pages at 20 by default and 100 at most, so
      a business object with more than a hundred runs is answered across two. Nothing in §13 bounds
      how many runs one correlation id may gather, and the page ceiling is a decision this feature
      made ([[Q138]]). It is not a defect — the cursor states how to ask for the rest — but the use
      case's phrase is true of every realistic object rather than of every possible one, and that is
      worth writing down where somebody would otherwise read a guarantee.

      **"Runs stalled past a threshold, in one request, instead of reading back every run key it
      happens to hold."** Met, and the part that makes it true is the part the brief got wrong:
      a run stuck in `queued` carries no `startedAt`, so the two `Op.or` branches measure `queued`
      from `acceptedAt` and `running` from `startedAt`. Probed live — the caller's own runs and
      another client's answered disjoint sets, so the filter narrows within the scope rather than
      escaping it.

      **"One row that says what a run was about, what state it is in, how long it has taken and what
      it has spent, without joining anything of its own."** Met. The keys observed on the wire are
      exactly the contract's: `runKey`, `runCategoryName`, `subjectLabel`, `correlationId`,
      `externalRef`, `statusName`, `lastCompletedStep`, `elapsedSeconds`, `modelCallCount`,
      `inputTokenCount`, `outputTokenCount`, `acceptedAt`. No row id, no `callbackUrl`, and neither
      stored body — `findAiRuns` names its columns.

      **"What it has spent" is met because the contract was widened at checkpoint 3**, not because
      it already said so: it named `inputTokenCount` alone, and a spend figure counting only what
      was sent is not one.
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
      Scoped gate run, recorded at `.hora/acceptance/1.0.0/run-list.md`. **Partial** for the reason
      every acceptance of this version is: steps 3 and 4 have no equipped delegate here.

      Two things distinguish it from the four accepted before. The suite ran by **the repository's
      own `npm test`**, which had been unusable until the work moved to WSL. And the feature was
      audited **against a running service** rather than by reading, which is what found the cursor
      defect this gate would otherwise have passed over.
      -->

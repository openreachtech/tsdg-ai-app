# Acceptance — 1.0.0 — #run-record

## Run 1
<!-- reach: scoped -->
<!-- scope: run-record -->
<!-- live: no (skipped at the gate) -->
<!-- reuse: none -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up — a gate run skips the live review, so the stack is neither required nor started -->

### Verdict

passed over 1 of 11 features; 0 not accepted

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | — | not required at a gate |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **1754 passed, 0 failed** across 4 groups |
| scenarios | **none equipped** | not run — see finding 1 |
| review | **none equipped** | not run — see finding 1 |
| version criteria | — | not in scope (gate) |
| UX | — | not in scope (gate), and this product declares no frontend row at all |
| security | — | not in scope (gate); checkpoint 8 audited this feature's change set over seven rounds |

The four groups the repository's own `test.sh` defines, driven in its order: `tests/empty/__tests__`
(no tests), `tests/empty/_orders` (no tests), `tests/__tests__` (1552 passed, 45 suites),
`tests/_orders` (202 passed, 4 suites). `npx eslint .` clean.

**Executed rather than reused.** No `.hora-cache.json` exists in this repository, so `hoc-test-cache`
had nothing to configure and every group ran for real. The repository's own `npm test` was **not**
the command used: it and `npm run db:refresh` are written for a POSIX shell and npm runs them through
`cmd.exe` on this machine ([[Q53]]). The database was rebuilt from empty and seeded with master only
for the first two groups, then re-seeded with the development seeders for the last two, exactly as
`test.sh` does.

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run — the same gap runs 1 of
   #run-contract and #provider-layer recorded.** `hof-acceptance-review` asks whether every operation
   the backend exposes is reachable from the UI and requires a working local E2E environment;
   `hof-e2e-test-specification` derives its scenarios from the API surface. **This feature has
   neither, and says so in the spec rather than by omission.** §10 declares no `### RESTful API`
   section where §12, §13, §15 and §20 each do, and states outright that an operator reads these rows
   directly on the machine — which is why checkpoints 4, 6, 10 through 17 are recorded `n/a`. The
   product declares no frontend row. The three recorders are imported by nothing outside
   `app/aiRun/`, confirmed by `git grep` in the seventh audit round.

   So the two steps are not merely unequipped here; there is no surface for them to read. That is
   still a gap and not a pass: **a run with a step missing is a partial run, not a pass with a
   footnote**, which is why the verdict takes the counted form.

2. **What judged this feature's behavior is checkpoints 8 and 9, and both are named here so this
   verdict is not read as resting on the suites alone.**

   Checkpoint 9 walked both use cases against the built record — not against the two runs that
   succeeded, but across all five statuses: a running run whose third step reads `in-progress` with
   no duration, a failed run whose step carries `media-unreadable` beside the run's own
   `MEDIA_UNREADABLE`, two canceled runs whose request-to-effect gaps measure as 400 ms and 2700 ms,
   and a queued run with no steps. Use case 2's three `missing` fields each reach their settling step
   through `AiRunStepId`, and the counts on the field row agree with the counts the step repeats in
   `rejections`.

   **Then the condition both use cases exist for: the content purge was simulated exactly as
   `#retention` will run it, and both use cases answered identically** — seven steps with their
   durations, three fields with their counts, reason codes and formula versions, nine confidences
   still standing.

   Checkpoint 8 ran seven audit rounds. The first three found defects of substance — a rejection
   carrying a name and a medical status verbatim into a 730-day column, a prototype-borne
   `callbackUrl` reaching the column through the public method, a field state normalized for the
   decision and written raw. The last four found no HIGH and no MEDIUM, and every finding of every
   round is closed.

   **That evidence applies to the code this gate is judging, exactly.** Checkpoint 9 walked at
   `15b4a10`, which is `tsdg-ai-backend`'s HEAD at this run; every commit since has been in the hora
   repository. Nothing was rebuilt between the two.

3. **All six of §10's acceptance criteria are judged at this gate, and two are judged against the
   record rather than against the flow that will produce it.** Criterion 5 — the two cancellation
   instants recorded separately so the gap is measurable — is satisfied by the columns and the
   seeded rows, but no cancellation actually happens until `#run-cancel` (9th). Criterion 6's second
   clause — none of it removed by the content purge — was verified by simulating the purge, because
   `#retention` is 11th. Neither is a defect here, and neither is a full judgement of the criterion:
   both become judgeable for real at the whole-version sweep, once the features that act exist.

4. **This gate cannot say that an operator can read a run back, and §10 says so itself.** The command
   that makes it ergonomic is `#operator-cli` (10th) and the API read-back is `#run-delivery` (6th).
   What this feature ships is the record those two will read. Recorded so that nobody later takes
   this pass for evidence of a tool — the same reason checkpoint 1 settled it in the spec rather than
   leaving it to be discovered here.

### Always checked, whatever the delegates found

- **Every feature in the version, not only this run's scope.** 1.0.0 carries 11 features. This run
  drove **1** (#run-record), by the unit suites and the static checks, with the live review skipped.
  The other 10 were not driven. **For each of them the last version in which it was driven live is
  `never`** — no acceptance record in `.hora/acceptance/` carries `live: yes`, in this version or any
  other, so no feature of this product has yet been driven end to end. The whole-version sweep is the
  run that will change that.
- **A step skipped for a missing delegate:** yes, steps 3 and 4 — finding 1.
- **`version-criteria`:** `not in scope (gate)`. The denominator was checked anyway: §22 declares 6
  criteria and `_plan.md`'s `## Acceptance` entry reads 6, so the two derivations agree.
- **`not-accepted`:** `none`, copied from `_plan.md`'s `## Not accepted`, which reads "None." —
  `Existing assets` declares no baseline permission, so no feature of this version is listed rather
  than specified. The two agree.

# Acceptance - 1.0.0 - #retention

## Run 1
<!-- reach: scoped -->
<!-- scope: retention -->
<!-- live: no (not requested, and there is nothing to drive: this feature declares no route, no resolver, no renderer and no screen. Its two jobs are started by a clock) -->
<!-- reuse: none. Executed at tree 780390e, in WSL, by the repository's own `npm test` -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up; this feature exposes nothing a browser or a client could reach -->

### Verdict

passed over 1 of 11 features, partial: steps 3 and 4 had no equipped delegate

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | - | not required at a gate, and nothing here could be driven |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **4252 passed across 135 suites**, and **511 across 8**, 0 failed. `npx eslint .` clean |
| scenarios | **none equipped** | not run - see finding 1 |
| review | **none equipped** | not run - see finding 1 |
| version criteria | - | not in scope (gate) |
| UX | - | not in scope (gate); this product declares no frontend row |
| security | - | not in scope (gate); checkpoint 8 audited this feature's change set |

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run** - the gap every acceptance
   of this version has recorded. Both equipped candidates are frontend-shaped: the acceptance
   review asks whether each backend operation is reachable from the UI and requires a live E2E
   environment, and the scenario specification derives its list from the API surface. This feature
   has neither a UI nor an API, so neither would have had anything to read. The product declares
   no frontend row, in the spec rather than by omission.

2. **A medium security finding was found and fixed inside this gate, and a passing verdict would
   otherwise bury it.** Nothing verified that the two purge schedules exist. A schedule lives in
   Redis and is written by a command somebody runs by hand at deployment; unrun, run against a
   different store, or orphaned by a renamed scheduler id, **no purge ever fires and personal data
   is kept indefinitely** - while the daemon reports itself listening on both purge queues, the
   queues sit green and empty, and the purge log stays silent, which outside production is also
   what a working sweep looks like. The absence of the control and its healthy operation were
   indistinguishable. The daemon now reads back what Redis holds and names any declared schedule
   that is missing.

3. **The fourth acceptance criterion is established by derivation, not by one end-to-end pass.**
   "A run past the content horizon but inside the trace horizon still answers why a value was or
   was not produced" rests on two separately verified facts: the content purge writes only to
   `ai_runs` and `ai_model_calls`, leaving the step and field-outcome rows that carry *why*
   untouched; and `AiRunResponseBuilder#buildResult()` guards on the column's type, naming a
   purged run as one of the three cases that answer null. Each half is tested. **No test purges a
   run and then reads it back through the response builder**, so the join between them is reasoned
   rather than run. Named here rather than left implied; the whole-version sweep is where it
   should be closed.

4. **Two upstream defects are load-bearing for this feature and remain open.** The structured
   logger writes nothing outside production, so every log-based signal this feature emits is
   invisible in staging ([[Q149]]); and the job framework's cron schedule accepts any string as a
   valid expression, so nothing in the chain checks the two expressions that are this feature's
   entire configuration ([[Q151]] records the related option trap, [[Q148]] the validation stub).
   Both expressions were measured by hand and are correct. A measurement taken once is not a guard.

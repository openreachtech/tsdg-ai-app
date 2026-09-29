# Acceptance - 1.0.0 - #run-list

## Run 1
<!-- reach: scoped -->
<!-- scope: run-list -->
<!-- live: no (not requested). Unlike every earlier gate of this version, the stack was available: the server boots in WSL and checkpoint 8 drove the route over HTTP with signed requests. The live review was still not run, because a gate run widens only when a person asks -->
<!-- reuse: none. Executed at tree 44319d0, in WSL, by the repository's own `npm test` -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up for the review; the application was booted separately during checkpoint 8 -->

### Verdict

passed over 1 of 11 features, partial: steps 3 and 4 had no equipped delegate

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | - | not required at a gate |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **3881 passed across 111 suites**, and **427 across 7**, 0 failed. `npx eslint .` clean |
| scenarios | **none equipped** | not run - see finding 1 |
| review | **none equipped** | not run - see finding 1 |
| version criteria | - | not in scope (gate) |
| UX | - | not in scope (gate); this product declares no frontend row |
| security | - | not in scope (gate); checkpoint 8 audited this feature's change set over HTTP |

**The command was the repository's own, which is new.** Every earlier acceptance of this version
reconstructed the suite by hand, because npm ran the scripts through `cmd.exe` on a Windows shell
and the POSIX syntax broke ([[Q53]]). Run in WSL, `npm test` works as written, and [[Q53]] is closed
against this run.

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run** - the same gap every
   acceptance of this version has recorded. `hof-acceptance-review` asks whether every operation is
   reachable from the UI and needs a working local E2E environment; `hof-e2e-test-specification`
   derives scenarios from the API surface. **This product declares no frontend row**, and says so
   in the spec rather than by omission.

2. **This feature was audited against a running service, which none of the earlier four were.**
   Checkpoint 8 signed requests as two clients and probed the live route: the scope criterion held
   by experiment, the unauthenticated guard was watched answering `401`, and a four-character
   cursor was found answering `500` instead of `422` and fixed. Recorded here because the four
   features accepted before this one were verified by reading, and their records say so.

3. **Three questions are open against this feature and none blocks it**: [[Q138]] (§13 fixes neither
   the page bounds nor what "stalled" means; both were chosen here), [[Q139]] (a criterion clause
   nothing in this version can check, because one run category exists), and [[Q142]] (the query
   string is unsigned, which at this route costs disclosure rather than the duplicate charge
   [[Q21]] judged it to cost).

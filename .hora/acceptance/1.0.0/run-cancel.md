# Acceptance - 1.0.0 - #run-cancel

## Run 1
<!-- reach: scoped -->
<!-- scope: run-cancel -->
<!-- live: no (not requested). The stack was available and was used: checkpoint 8 booted the service, signed requests as a seeded client, probed the route and restored the database afterwards. The review's own live sweep still did not run, because a gate run widens only when a person asks -->
<!-- reuse: none. Executed at tree 62aa0fb, in WSL, by the repository's own `npm test` -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up for the review; the application was booted separately during checkpoint 8 -->

### Verdict

passed over 1 of 11 features, partial: steps 3 and 4 had no equipped delegate

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | - | not required at a gate |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **4034 passed across 115 suites**, and **481 across 7**, 0 failed. `npx eslint .` clean |
| scenarios | **none equipped** | not run - see finding 1 |
| review | **none equipped** | not run - see finding 1 |
| version criteria | - | not in scope (gate) |
| UX | - | not in scope (gate); this product declares no frontend row |
| security | - | not in scope (gate); checkpoint 8 audited this feature's change set against a running server |

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run** - the gap every acceptance
   of this version has recorded. This product declares no frontend row, and says so in the spec
   rather than by omission.

2. **One acceptance criterion left §15 during this feature's build, by an approved spec edit.**
   "A provider call in flight is aborted" is not reachable in 1.0.0: the abort signal does not
   reach `sendRequestToAi()` — its parameter type has no field for it — and the only driver this
   version ships is the stub, which by §17's own first criterion opens no connection. There was no
   call in flight to abort and no test of it could have been honest. The criterion now reads "the
   tokens a run spent before it stopped are recorded", which is built and tested, and the in-flight
   abort sits under "Out of scope for now" unblocked by the first vendor driver. **The agent that
   found this could have aborted the stub, watched a green test and reported the criterion met.**

3. **Two questions are open against this feature and neither blocks.** [[Q143]]: a captured
   signature cancels any run the client owns, because the run key rides in an unsigned path — the
   third reading of [[Q21]]'s root cause and the first where it destroys work rather than
   duplicating or reading it. Accepted because the signing payload belongs to `#run-contract`, and
   because [[Q21]]'s own proposal would close it. [[Q144]]: two routes take a run key from the path
   with no content check; recorded rather than half-fixed, because fixing one of the two would
   leave three routes and two behaviours.

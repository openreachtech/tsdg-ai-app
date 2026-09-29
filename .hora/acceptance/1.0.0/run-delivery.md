# Acceptance - 1.0.0 - #run-delivery

## Run 1
<!-- reach: scoped -->
<!-- scope: run-delivery -->
<!-- live: no (skipped at the gate; this product declares no frontend row, so there is no screen to drive) -->
<!-- reuse: none. One execution at tree c76e8e5, 2026-09-27T00:00Z, backs this gate and the three sibling gates taken in the same batch: all four features sit on one branch at one tree state, so a second execution would report the same numbers against the same bytes. Stated rather than repeated -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up - a gate run skips the live review, so the stack is neither required nor started -->

### Verdict

passed over 1 of 11 features, partial: steps 3 and 4 had no equipped delegate

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | - | not required at a gate |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **3573 passed across 105 suites**, and **427 across 7**, 0 failed. `npx eslint .` clean |
| scenarios | **none equipped** | not run - see finding 1 |
| review | **none equipped** | not run - see finding 1 |
| version criteria | - | not in scope (gate) |
| UX | - | not in scope (gate), and this product declares no frontend row |
| security | - | not in scope (gate); checkpoint 8 audited this feature's change set |

**Executed rather than reused.** No `.hora-cache.json` exists in this repository, so nothing was
cached. The repository's own `npm test` was not the command used: it is written for a POSIX shell
and npm runs it through `cmd.exe` on this machine ([[Q53]]). The invocation was
`./test.sh --seeded --maxWorkers=4 --workerIdleMemoryLimit=512MB`, bounded because jest's default
worker count exhausts this machine's free memory ([[Q134]]); `--seeded` with no target still tears
down, migrates, seeds master and development, and runs both groups. The groups it skips,
`tests/empty/**`, hold no tests.

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run** - the same gap runs 1 of
   `#run-contract`, `#provider-layer` and `#run-record` recorded. `hof-acceptance-review` asks
   whether every operation the backend exposes is reachable from the UI and needs a working local
   E2E environment; `hof-e2e-test-specification` derives its scenarios from the API surface. **This
   product has neither**, and says so in the spec rather than by omission: it declares no frontend
   row at all.

2. **This feature's callback sender was re-read during `#asset-media-extraction`'s audits** and its
   SSRF fix holds: every hop is re-POSTed with body and signature only after the client's own
   registered prefix is re-asked, and the response body is disposed of in a `finally`.
3. **[[Q126]] is decided and recorded** - the redirect walk here and the one in `MediaFetchClient`
   stay duplicated for 1.0.0, for the reason given in that entry.
4. **What this feature delivers now carries more than it did at its own gates.** A failed run's
   `failureParameters` reach the callback body, because `#asset-media-extraction` added the base
   hook that fills them; before, the field was always `null`. The shape is unchanged and the suites
   above cover it.

# Acceptance - 1.0.0 - #media-fetch

## Run 1
<!-- reach: scoped -->
<!-- scope: media-fetch -->
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

2. **This feature's redirect handling was re-audited twice more after its own gates closed**, by
   `#asset-media-extraction`'s checkpoint 8 runs, because that feature's path reaches
   `MediaFetchClient`. Both times the SSRF fix held: `redirect: 'manual'` stands, the allow-list is
   re-asked at every hop, the https-to-http downgrade is refused per hop, and **no second fetch path
   exists anywhere in that feature's change set**.
3. **[[Q126]] is decided and recorded**: the redirect walk this feature holds is duplicated in
   `AiRunCallbackSender`, and both copies stay for 1.0.0. Both of this version's HIGH findings lived
   in exactly these two classes; merging them at the last gate would reopen six and three audit
   rounds in the one place a mistake is an exposure rather than a defect. The trigger for writing
   the shared tool is named there rather than left to a date.

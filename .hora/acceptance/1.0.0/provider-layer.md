# Acceptance — 1.0.0 — #provider-layer

## Run 1
<!-- reach: scoped -->
<!-- scope: provider-layer -->
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
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **1225 passed, 0 failed** across 4 groups |
| scenarios | **none equipped** | not run — see finding 1 |
| review | **none equipped** | not run — see finding 1 |
| version criteria | — | not in scope (gate) |
| UX | — | not in scope (gate), and this product declares no frontend row at all |
| security | — | not in scope (gate); checkpoint 8 audited this feature's change set over four rounds |

The four groups the repository's own `test.sh` defines: `tests/empty/__tests__` (no tests),
`tests/empty/_orders` (no tests), `tests/__tests__` (1175 passed), `tests/_orders` (50 passed).
`npx eslint .` clean.

**Executed rather than reused.** No `.hora-cache.json` exists in this repository, so
`hoc-test-cache` had nothing to configure and every group ran for real. The repository's own
`npm test` was **not** the command used: it and `npm run db:refresh` are written for a POSIX
shell and npm runs them through `cmd.exe` on this machine, so `export` is not a command and
`sequelize-cli db:migrate;` arrives with its semicolon attached ([[Q53]]). The four groups were
driven in `test.sh`'s own order, with the database rebuilt from empty and re-seeded between the
master-only groups and the seeded ones, exactly as that script does.

### Findings

1. **Steps 3 and 4 had no equipped delegate, so this is a partial run — the same gap run 1 of
   #run-contract recorded, and wider here.** `hof-acceptance-review` asks whether every operation
   the backend exposes is reachable from the UI and requires a working local E2E environment;
   `hof-e2e-test-specification` derives its scenarios from the API surface. **This feature has
   neither.** It declares no API operation at all — §17 states that a prompt change is a direct
   database write by an operator, which is why checkpoints 4 and 6 are recorded `n/a` — and the
   product declares no frontend row.

   So the two steps are not merely unequipped here; there is no surface for them to read. That is
   still a gap and not a pass: **a run with a step missing is a partial run, not a pass with a
   footnote.**

2. **What did judge this feature's behavior was checkpoint 9, and it is worth naming here so this
   verdict is not read as resting on the suites alone.** That walk executed all five use cases and
   eight acceptance criteria against the built modules — including, for the strongest claim in the
   section, a master-seeders-only database with `process.env` behind a recording Proxy and
   `net.Socket#connect`, `http`, `https`, `tls`, `dns.lookup` and `fetch` wrapped before the first
   import: zero environment reads attributable to this feature, zero outbound connections.

   **That evidence applies to the code this gate is judging, exactly.** Checkpoint 9 ran at
   `4c9c0fe`, which is `tsdg-ai-backend`'s HEAD at this run; every commit since has been in the
   hora repository. Nothing was rebuilt between the two.

3. **Two of the eight criteria are not fully judgeable at this gate, and neither is a defect
   here.** Criterion 3's "one deliberate setting" has no reader in the repository — nothing reads
   `ai_models.is_default`, `is_active` or `ai_agent_default_models` — because honoring it belongs
   to #run-execution. §17 now names `is_default` as the authority ([[Q58]]), so the later feature
   inherits a decision rather than a fork. Criterion 8's "no code outside the client modules opens
   an outbound connection" is satisfied for this change set — no HTTP client and no vendor SDK is
   in `package.json` at all — but cannot be settled for the version until #media-fetch and the
   callback sender exist.

4. **A default installation binds no tools** ([[Q60]]). `master` seeds no `ai_tools` and no
   `ai_agent_available_ai_tools`, so the stub answers with zero function calls. Criterion 1's
   "answers every service on the stub" therefore holds in the weak sense today: the whole path
   completes on a machine with no key, and decides nothing. The tool set belongs to
   #asset-media-extraction (§20), so this is a handover, recorded so nobody later reads this pass
   as evidence that a default install does useful work.

### The four checks this run owes regardless of its delegates

- **Features exercised.** The version carries 11. This run drove **1**, scoped to the gate. For
  the other 10, the last version in which each was driven is: #run-contract, 1.0.0 (its own gate,
  runs 2 and 3); every other feature, **never** — they are not built.
- **Steps skipped for a missing delegate.** Two: the scenario list and the acceptance review.
  Named in finding 1.
- **`version-criteria:`** reads `not in scope (gate)`, which is the complete answer for a gate
  run. The version's own six criteria are the sweep's.
- **`not-accepted:`** reads `none`, which is what `_plan.md`'s `## Not accepted` says for this
  version: `Existing assets` declares no baseline permission, so no feature is listed rather than
  specified.

### What this verdict does not say

It does not say the local end-to-end stack works — a gate run neither requires nor starts it, and
it still cannot come up on this machine ([[Q26]]). It does not say the product is reachable by a
caller: this feature builds a library the worker calls, and the worker is #run-execution. And it
does not say the suites prove the feature — checkpoint 8 spent four rounds on code that was green
throughout, twice while the implementation was actively wrong.

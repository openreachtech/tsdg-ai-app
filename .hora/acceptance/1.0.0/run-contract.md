# Acceptance — 1.0.0 — #run-contract

## Run 1
<!-- reach: scoped -->
<!-- scope: run-contract -->
<!-- live: no (skipped at the gate) -->
<!-- reuse: none -->
<!-- not-accepted: none -->
<!-- version-criteria: not in scope (gate) -->
<!-- environment: not brought up — a gate run skips the live review, so the stack is neither required nor started -->

### Verdict

failed

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | — | not required at a gate; see finding 3 |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **524 run: 517 passed, 7 failed** across 4 groups |
| scenarios | **none equipped** | not run — see finding 2 |
| review | **none equipped** | not run — see finding 2 |
| version criteria | — | not in scope (gate) |
| UX | — | not in scope (gate) |
| security | — | not in scope (gate); checkpoint 8 audited this feature's change set |

The four groups the repository's own `test.sh` defines: `tests/empty/__tests__` (no tests),
`tests/empty/_orders` (no tests), `tests/__tests__` (504: 497 passed, 7 failed),
`tests/_orders` (20 passed).

### Findings

1. **7 tests fail in 3 suites, none of them this feature's.** `BaseAppGraphqlServerEngine`,
   `CustomerGraphqlServerEngine` and `AdminGraphqlServerEngine` assert the boilerplate's own
   default environment values — `lifetimeDays: 14`, `secure: true` — while `/hora-setup` filled
   in this project's values, `AUTH_REFRESH_TOKEN_TTL_DAYS=30` and `AUTH_COOKIE_SECURE=false`.
   The boilerplate ships tests that hard-code its defaults, so **any project that fills those
   values in turns them red**, and they were red before this feature wrote a line — the baseline
   taken at checkpoint 6 recorded the identical 3 suites and 7 tests.

   No feature's checkpoint owns them: they are boilerplate tests over shared configuration.
   **Sends back to: an `update/` branch, not a checkpoint.** See [[Q13]], which also records the
   larger question underneath — `server/index.js` still starts two GraphQL servers the spec's
   §2.1 does not declare, and these are their tests.

2. **Steps 3 and 4 had no equipped delegate, so this is a partial run.** `hof-acceptance-review`
   asks whether every operation the backend exposes is reachable from the UI, and requires a
   working local E2E environment; this product has **no UI and no frontend row at all**.
   `hof-e2e-test-specification` is the nearest match for the scenario list and carries the
   frontend prefix, while this repository is a backend one.

   So what a gate run normally judges beyond the unit suites was not judged here, by anything.
   Recorded as a gap rather than passed over: **a run with a step missing is a partial run, not
   a pass with a footnote.**

3. **The local end-to-end stack cannot come up on this machine** — see [[Q26]]. A gate run
   neither requires nor starts it, so this did not block the run; it will block checkpoint 17
   and every sweep. Recorded here so the verdict is not later read as evidence the stack works.

### The four checks this run owes regardless of its delegates

- **Features exercised.** The version carries 11 features. This run drove **1**, scoped to the
  gate. For the other 10, the last version in which each was driven is **never** —
  `.hora/acceptance/` held no record at all before this file.
- **Steps skipped for a missing delegate.** Two: the scenario list and the acceptance review.
  Named in finding 2.
- **`version-criteria:`** reads `not in scope (gate)`, which is the complete answer for a gate
  run.
- **`not-accepted:`** reads `none`, which is what `_plan.md`'s `## Not accepted` says for this
  version. No disagreement.

## Run 2
<!-- reach: scoped -->
<!-- scope: run-contract -->
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
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **524 passed, 0 failed** across 4 groups |
| scenarios | **none equipped** | not run — the gap of run 1, finding 2, still stands |
| review | **none equipped** | not run — same gap |
| version criteria | — | not in scope (gate) |
| UX | — | not in scope (gate) |
| security | — | not in scope (gate); checkpoint 8 audited this feature's change set |

`tests/empty/__tests__` and `tests/empty/_orders` hold no tests; `tests/__tests__` 504 passed;
`tests/_orders` 20 passed.

### What changed since run 1

Run 1's finding 1 is closed, on `update/graphql-engine-env-tests`, merged `--no-ff` into
`release/1.0.0`. **It was not closed by rewriting the assertions**, which would have made the
suite green and left three tests whose titles describe a precondition they never establish.

The root cause was a missing seam: `BaseAppGraphqlServerEngine` read the environment facade
inline in both cookie getters, and `renchan-env` refuses every write to that facade by design.
So the fallback each getter declares could not be reached from a test at all, and the tests
covering those branches passed only on a machine whose `.env` happened to leave both values
empty — which is why filling in this project's values turned them red.

A `static get env ()` now stands between the getters and the facade. The tests hand the engine
an environment of their own through it, so they assert the fallback they say they assert, on any
machine and under any project configuration.

**Run 1's findings 2 and 3 are not closed and are not this run's to close** — no equipped
delegate covers the scenario list or the acceptance review on a backend-only product ([[Q13]] is
where the surface question underneath finding 1 still sits), and the local end-to-end stack
still cannot come up on this machine ([[Q26]]).

## Run 3
<!-- reach: scoped -->
<!-- scope: run-contract -->
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
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **759 passed, 0 failed** across 4 groups |
| scenarios | **none equipped** | not run — the gap of run 1, finding 2, still stands |
| review | **none equipped** | not run — same gap |
| version criteria | — | not in scope (gate) |
| UX | — | not in scope (gate) |
| security | — | not in scope (gate); checkpoint 8 audited this feature's change set |

`tests/__tests__` 739 passed; `tests/_orders` 20 passed; the two `tests/empty/` groups hold no
tests.

### Why run 2's pass was withdrawn

**Run 2 recorded a pass that a green suite did not entitle it to.** [[Q11]] — the regression
guard owed for the signature-splitting vulnerability closed at checkpoint 5 — was still open,
and was checked rather than assumed. Four classes built at checkpoint 5 had **no test file at
all**, and deleting the digits-only line from `ApiClientSignatureVerifier#hasSignatureMaterial()`
left every one of run 2's 504 tests passing.

So the fix for a live vulnerability was guarded by nothing, and nothing in the suite said so.

**Checkpoint 6 was cleared and re-earned** through `retake/run-contract-module-tests`, merged
`--no-ff` into `release/1.0.0`. The four classes now have test files covering every member, and
the re-split case is written from the attack rather than from the fix: the same signature
literal is presented once honestly and once with the boundary between timestamp and body moved,
so the case can fail for that and nothing else. Deleting the line again turns it red by name.

**No production code changed.** This retake added tests only.

Run 1's findings 2 and 3 remain open and are not this run's to close — no equipped delegate
covers the scenario list or the acceptance review on a backend-only product, and the local
end-to-end stack still cannot come up on this machine ([[Q26]]).


# Acceptance - 1.0.0 - #asset-media-extraction

## Run 1
<!-- reach: scoped -->
<!-- scope: asset-media-extraction -->
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

2. **This feature reopened three of its own gates and one of them twice**, which its feature file
   records in full. The short version, because a passing acceptance is exactly where this gets lost:
   the use-case gate failed on a screen that could not be demonstrated without an API key; the
   module gate was reopened to build the fixture for it; the security audit then failed on a defect
   that **fixture had introduced** - one authenticated request able to hold this service's queue for
   tens of minutes; and the module and actual-API gates were reopened again to fix it.
3. **Six findings are recorded rather than fixed**, each with its reason: [[Q130]] (fetched media is
   trusted to be what its `content-type` claims - latent, because nothing parses or forwards the
   bytes while the only driver is the keyless one), [[Q131]] and [[Q128]] (the rate limit counts then
   acts, and sits ahead of the idempotency lookup), [[Q133]] (§20 states the reason's language twice
   and differently), [[Q135]] (a default installation serves the fixture's values, two of three kinds
   unmarkable), [[Q136]] (a field path over 191 characters is accepted, runs, and is silently
   dropped), [[Q137]] (every declared medium is written before the count limit is asked).
4. **[[Q129]] is this version's finding, not this feature's**, and it was found here: an accepted
   feature had shipped code that could not run, because nothing had seeded two master tables it
   reads - and two tests had written that gap down as the design. It is the third instance of one
   shape in this version: something exists, nothing runs it, and every signal says green.

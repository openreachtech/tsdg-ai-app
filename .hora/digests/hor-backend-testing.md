# hor-backend-testing
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-backend-testing/ -->

**Read the source above whenever this leaves a question open.**

Scope: test **organization and discipline** — where a file goes, run order, how to run, purity. The *writing style* of an individual test (describe/test structure, case data, naming) follows the project's own Jest conventions and is **out of scope here**. Manual E2E verification is out of scope. Directory names (`tests/__tests__`, `tests/_orders`, `tests/mocks`, `tests/tools`) are the **recommended layout** — map them onto your project.

## Core principle

A test must fail **only** because the code it exercises is wrong — not because another test ran first, and not because the test itself contains untested logic.

1. **Isolate database state.** A test that **writes to the DB** mutates shared seed data that other tests read, so it is placed **apart** from tests that don't, and **ordered** among its peers.
2. **Keep tests pure.** A test may only exercise code that is **itself already tested** — no logic is invented inside a test, and every mock/tool it leans on has its own test cases.

## 1. Placement — `__tests__` vs `_orders`

Split every test file by one question: **does it write to the database?**

| Location | Put here | Ordering |
| --- | --- | --- |
| `tests/__tests__/` | tests that **do not** write to the DB — pure units, read-only queries, formatters, validators | none needed; run in any order |
| `tests/_orders/<Category>/` | tests that **do** write to the DB — anything that inserts/updates/deletes rows | guaranteed **within a category** by a `_.test.js` barrel |

- Mirror the source tree inside `tests/__tests__/` so a unit's test sits at the matching path.
- Under `tests/_orders/`, group by a **category** (a cohesive area of write behavior); each category is its own folder.
- **Classify by what the method _does_, not by whether the test mocks the write away.** A method that writes to the DB directly or transitively (calls `create` / `update` / `destroy` / `beginTransaction`, or orchestrates sub-methods that do) belongs in `_orders` **even if the test stubs the persist call** — mocking the write does not move it to `__tests__`.
- **Placement is per-method, so one class usually splits across both trees.** A DB-writing class keeps its writing methods in `_orders` and its non-writing methods (`find~`, getters, builders, validators, `format~`) in the sibling `__tests__` file. Do not dump a read-only method into `_orders` just to keep it beside the class's other tests — keeping tests together is not a reason to place it there.

**Why the split.** A DB-writing test mutates the **shared seed fixtures** (`development` / `dev-master`) the running database was seeded with; because the database is shared across a run, a test running **after** a mutation observes the changed state. Read-only tests can't change what others see, so they never need ordering; DB-writing tests can, so their run order must be **deterministic**, not left to file-discovery order.

## 2. Run order — the `_.test.js` barrel

Each `_orders` category folder contains a `_.test.js` that **imports the category's test files in the exact order they must run**. Jest discovers `_.test.js`, and its import order becomes the execution order.

```js
// tests/_orders/<Category>/_.test.js
// Imports define the run order for this category; add each new test in its correct position.
import './CreateRecord.js'
import './UpdateRecord.js'
import './DeleteRecord.js'
```

- The individual test files in the folder are **imported by the barrel**, not discovered independently — name them so they are not matched as standalone tests by the runner, and let `_.test.js` be the single entry point for the category.
- **When you add a DB-writing test, add one `import` line to the category's barrel at the position where it must run** (e.g. after the test that creates the row it depends on). Without that line the file does not run at all.

**Cross-category order is NOT guaranteed.** `_orders` fixes order *within* a category only. When two categories can interfere, run them in **separate CI jobs** so each starts from its own fresh database: add or update a **per-category** workflow under `.github/workflows/test-<category>.yml` running only that category's path (`npm run test -- --seeded tests/_orders/<Category>/`). The default catch-all workflow runs the rest of `tests/_orders/`; peel a category out only when it demonstrably interferes.

Verification against real middleware (real broker, search cluster, CDC pipeline) belongs in **neither** location — it is done by hand, outside `tests/` entirely, and `npm run test` stays runnable with nothing but Node installed.

*full text (workflow YAML in full): `.claude/skills/hor-backend-testing/references/placement-and-ordering.md#cross-category-isolation-via-ci`*

## 3. Running tests

| Goal | Command |
| --- | --- |
| Whole suite (authoritative, slowest) | `npm run test` |
| One path through the suite runner, development fixtures applied | `./test.sh --seeded tests/_orders/<Category>/SomeCreator.js` |
| One path through the suite runner, master seeds only | `./test.sh --empty tests/__tests__/<path>/SomeUnit.js` |
| One file, fastest (no rebuild) | `NODE_OPTIONS="--experimental-vm-modules" NODE_ENV=development npx jest <path-of-test-file>` |
| One file, DB-writing / order-sensitive | same, plus `--runInBand` |
| Live (real-dialect) run | `NODE_ENV=live` — **requires a MariaDB running locally**; standing it up is not part of this convention |

- `npm run test` runs on **SQLite** (the local default) under `NODE_ENV=development` and **rebuilds the database first**: 1. teardown (drop the local DB) → 2. migrate → 3. seed (master, then development / dev-master fixtures) → 4. run `tests/__tests__/` (read-only) and `tests/_orders/` (DB-writing, in category order). A green full run proves the tests pass from a clean database in the committed order.
- Pass a category's `_.test.js` to `./test.sh` to run the whole category in order, or a single file.
- Fast `npx jest` loop — **prerequisite: the database must already be prepared** (migrated + seeded once). It skips migrations and seeders and runs against the database **exactly as it currently is**. `--experimental-vm-modules` is required for the ES-module test loader; `NODE_ENV=development` selects the SQLite config.
- **`_orders` caveat**: a DB-writing test mutates shared state, so after a fast run the database no longer matches its seeded baseline and a later fast run can produce a **different result**. Restore the database before trusting subsequent runs.

### Resetting the database piecemeal

```bash
npm run db:teardown                     # drop the local DB
NODE_ENV=development npm run db:setup   # re-apply migrations (schema only, no data)
```

| Seeder set (dir) | Undo | (Re)apply |
| --- | --- | --- |
| dev-master (`sequelize/seeders/dev-master/`) | `sequelize-cli db:seed:undo:all --seeders-path sequelize/seeders/dev-master/` | `npm run db:seed:master` |
| development (`sequelize/seeders/development/`) | `sequelize-cli db:seed:undo:all --seeders-path sequelize/seeders/development/` | `npm run db:seed:dev` |
| production master (`sequelize/seeders/master/`) | `sequelize-cli db:seed:undo:all --seeders-path sequelize/seeders/master/` | `sequelize-cli db:seed:all --seeders-path sequelize/seeders/master --debug` |

- Prefix each `sequelize-cli` / `npm run` command with `NODE_ENV=development` (SQLite).
- After running `_orders` tests, re-applying the mutated seeder set (undo → apply) is usually enough to get back to a known baseline without a full teardown/migrate.
- Rebuild-everything shortcut: `npm run db:refresh` (alias `npm run r`) — teardown → migrate → seed dev-master → seed dev.

### Parallelism × per-worker heap

Jest runs one worker per core by default, each its own Node process with its own heap. `--max-old-space-size` is **a ceiling, not a reservation** — it is how far GC may be deferred, so a value the machine cannot give never engages and the OS kills the worker (one worker alone can take the machine down). The invariant: `workers × (heap cap + per-process overhead) ≤ memory actually free` (free *after* everything else resident — a local database, an E2E stack's daemons). Derive the cap from a **measured peak** (`--logHeapUsage`), re-measure as the project grows, and lower `--maxWorkers` first under pressure (`4` → `2` → `1`, or `--runInBand`). A worker stopped by the cap throws `JavaScript heap out of memory` with a stack trace; one stopped by the machine is killed silently.

```bash
NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=1536" npx jest --maxWorkers=4
```

*full text (measurement procedure, `free -h` / `nproc`, E2E-stack accounting): `.claude/skills/hor-backend-testing/references/running-tests.md#parallelism-and-memory-the-worker-budget`*

## 4. Test purity & test doubles

- **No new logic in a test.** Never define a function or class inside a test to compute an expected value or reproduce production behavior — logic written in a test is **untested logic**, and the test lies instead of catching the bug. Assert against **literals** (or values a tested fixture already provides), never against something the test recomputes. If the expectation is tedious to write out, build a **tested** fixture/factory — do not inline a calculation.
- **Everything a test uses must already be tested.** Every function, class, mock and tool a test leans on has its **own** test cases. Exercising production code A that internally calls B is fine — B has its own tests. What is banned is **new** code that exists only to serve the test and has no tests of its own.
- **Mock only when necessary — default to real.** A method that **can** run for real must not be mocked. Only two cases: **external systems** (third-party APIs that must never be hit, in success *and* failure tests) and **steering an otherwise-unreachable branch** (e.g. forcing a not-found guard seeded data cannot naturally trigger).
- **Never mock a database row — add a seeder instead.** Extend the seed fixtures rather than stubbing a row; stubbing a call that could have run for real is over-mocking and defeats the test.
- **Don't hand-query the DB inside a test to check a result.** Assert only the return value of the method under test; never call `Model.findOne` / `findAll` / `update` directly in the test body. Re-reading the row yourself tests the ORM, not the code under test.
- A double that is *only ever* borrowed as a stub must still be exercised **for real** in its own test.

| Directory | Holds |
| --- | --- |
| `tests/mocks/` | mock/stub classes standing in for a collaborator (a fake model, a fake client, a fake tokenizer) |
| `tests/tools/` | shared test tools — factories, builders, fixtures used across many tests |

- **Each mock class has its own test file.** An untested mock can drift from the real collaborator's contract and silently invalidate every test that uses it.
- **Prefer explicit fakes** — obviously-fake class and data names (e.g. `Alpha` / `Beta` sample models, clearly-fake tokens).
- A double or tool used by exactly one test can sit beside it; the moment a second test needs it, move it to `tests/mocks/` or `tests/tools/` (with its own test) rather than copy it.

## Finishing checklist

- [ ] The test is in `tests/__tests__/` if it does no DB write, or `tests/_orders/<Category>/` if it does.
- [ ] A DB-writing test is imported (in the right position) by its category's `_.test.js` barrel.
- [ ] If the new test's category can interfere with another, a per-category CI workflow isolates them.
- [ ] The test defines **no** new logic; every function/class/mock it uses is already tested.
- [ ] Any new mock/tool lives under `tests/mocks/` or `tests/tools/` and has its **own** test file.
- [ ] Verified with a single-test run.

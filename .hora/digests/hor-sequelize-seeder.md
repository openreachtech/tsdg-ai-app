# hor-sequelize-seeder
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-sequelize-seeder/ -->

**Read the source above whenever this leaves a question open.**

A seeder fills the tables the migration built, via `bulkInsert`. A seed row is a plain object keyed
by the **physical (snake_case) column names** — the migration's `field:` names, **not** the model's
camelCase — so a seeder is coupled to the migration, not the model.

**Core principle: a seeder is a filled-in template.** Every seeder has the same skeleton, so review
attention goes to the **data**, not the plumbing. Every row carries an explicit `id` (never
auto-increment), so `down` deletes exactly what `up` inserted and other seeds' FKs can point at a
known id.

## 1. Directory split — environment × kind of data

| Directory | Script (`--seeders-path`) | Environment | Kind of data |
| --- | --- | --- | --- |
| `master-000001/`, `master-000002/`, … | `db:seed:prod` | production | Canonical **master** (reference / config) data, split **one directory per release** (6-digit sequence), applied in ascending release order. |
| `dev-master/` | `db:seed:dev-master` | dev / CI (local + CI tests) | The **master** data for dev / CI. Mostly **re-exports** the production master files, plus a few dev-only master samples for data production creates via admin CRUD. |
| `development/` | `db:seed:dev` | dev / CI (local + CI tests) | **Operational fixtures** for unit tests — rows production creates at runtime, organized as `*-suite` bundles. |

- **Deciding where a seeder goes**: is it canonical data the running product depends on (providers,
  models, tools, agents, JSON schemas, wizard templates, day-rates, packages)? → master. Is it data
  a user / operator would create at runtime (customers, admins, payments, orders)? → `development`,
  and only to give tests something to read.
- `dev-master` and `development` both run **only in dev / CI**, never in production.
- **Current state as the skill states it**: "the repo still has a single, pre-split
  `sequelize/seeders/master/`, and `db:seed:prod` targets it directly. The release split is the
  **convention from here on**."
- **`.directorykeeper.cjs`** — a noop seeder (`up`/`down` do nothing) that keeps an otherwise-empty
  directory tracked and loadable. Do not delete it.
- **`db:refresh` (alias `npm run r`)** — `NODE_ENV=development` → teardown → migrate →
  **seed:dev-master** → **seed:dev**. It deliberately does **not** run `seed:prod`.

### Re-export for DRY (dev-master ← master)

A `dev-master/` file that must be identical to a production master file is **not** copy-pasted — it
re-exports, and **keeps the identical filename**:

```js
// dev-master/20260717135803-000001-ai_models.cjs
'use strict'

/*
 * dev-master duplicate: apply the same AI config as the production master in dev / CI (db:refresh).
 * The real data/logic lives in the production master release dir (DRY).
 */
module.exports = require('../master-000001/20260717135803-000001-ai_models.cjs')
```

A `dev-master/` file that is **not** in production master (a dev-only sample) is a normal seeder,
not a re-export.

## 2. File skeleton

`'use strict'` → `require` `TimestampSeedsSupplier` (+ any domain constants) → intent comment →
`TABLE_NAME` → one or more `seeds` arrays → `module.exports = { up, down }`.

```js
'use strict'

const TimestampSeedsSupplier = require('@openreachtech/renchan-sequelize/lib/tools/TimestampSeedsSupplier.cjs')

const {
  AI_PROVIDER,
} = require('../../../app/constants/aiModel.cjs')

/*
 * Development sample: content plan rates (dev-master).
 * In production these are created via the admin CRUD. 3 plans × 3 tiers (JPY, per month).
 */

const TABLE_NAME = 'ai_providers'

const seeds = [
  { id: AI_PROVIDER.DEFAULT.ID, name: AI_PROVIDER.DEFAULT.NAME },
]

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert(TABLE_NAME, TimestampSeedsSupplier.supplyAll(seeds), {})
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete(TABLE_NAME, { id: seeds.map(it => it.id) })
  },
}
```

- Seeders are `.cjs` (CommonJS) — sequelize-cli loads them that way.
- **`require` domain constants** from `app/constants/*.cjs` for ids / names so the seed and the app
  share one source of truth instead of hard-coding the value twice.
- **Intent comment** (`/* ... */`) near the top: what the seed is, and its design-doc / plan
  reference. Structural comments in English; domain prose is Japanese in this repo — match the
  surrounding files.
- **`TABLE_NAME`** is a **string** for a single table, or an **object**
  (`{ CUSTOMERS: 'customers', CUSTOMER_BASICS: 'customer_basics' }`) for a multi-table "suite".
- **`up`** = `bulkInsert(TABLE_NAME, TimestampSeedsSupplier.supplyAll(seeds), {})` (third `{}` is
  `bulkInsert`'s options). **`down`** = `bulkDelete(TABLE_NAME, { id: seeds.map(it => it.id) })`.
- **Suites insert parent → child in `up` and delete child → parent in `down`** (reverse order).
- **Async fulfillment** (computed values, e.g. a password hash): build the fulfilled array with
  `await Promise.all(seeds.map(it => fulfillX(it)))` inside `up` before `bulkInsert`; keep the plain
  `seeds` array for `down`'s id list.
  full text: `references/notation.md#async-fulfillment-computed-values-such-as-password-hashes`

## 3. Filename

```
{timestamp}-{6-digit-seq}-{table_name}.cjs
```

| part | rule |
| --- | --- |
| `{timestamp}` | creation time `YYYYMMDDHHmmss`, 14 digits (`date +%Y%m%d%H%M%S`); files run in **ascending timestamp = creation order** |
| `{6-digit-seq}` | zero-padded running number (`000001`, `000002`, …) |
| `{table_name}` | the physical table name in snake_case — same as `TABLE_NAME`; a suite uses `<domain>_suite` |

Examples: `20260717135803-000001-customers.cjs`, `20260717141020-000002-customers_suite.cjs`,
`20260717142230-000003-ai_model_tool_assignments.cjs`.

- **Order parents before children**: across files, create the parent's seeder first so its timestamp
  is earlier and it runs first.
- **Older seeders** use the previous `<8-digit-seq>-<kebab-entity>.cjs` form (`00050002-ai-models.cjs`).
  Leave them; write new files in the timestamp form.
- The release number lives on the **directory** (`master-<6-digit>/`); the file inside uses the
  standard filename. A `dev-master/` re-export keeps the identical filename as its `master-*` file.

## 4. Id numbering

**Every seed row has an explicit `id`, and each table's rows occupy a distinct id block whose step
is 10,000.** Bases are multiples of 10,000 **at or above `100000`** (6 digits): `100000`, `110000`,
`120000`, … Rows increment by 1 inside the block (~10,000 rows per block).

| Rule | Detail |
| --- | --- |
| Bases are 6 digits (`≥ 100000`) | Never a sub-100,000 base. A `≥ 100000` id overflows `SMALLINT` (max 32,767 signed / 65,535 unsigned), so a column wrongly declared `SMALLINT` **fails at seed time** rather than silently truncating. |
| Step is 10,000 | Allocate the next free multiple of 10,000 at/above 100,000; never overlap two blocks that could collide within one table. |
| A base may be reused across suites | Uniqueness only has to hold **within one table** (`customers` and `admins` may both start at `100000`). |
| FK columns hold the referenced table's block ids | `{ id: 110001, customer_id: 100001 }`, `{ id: 530001, software_package_id: 520001 }`. Allocate the parent's block first. |
| Hierarchical rows use a structured id **inside** the block | Access tokens: `14` + 2-digit customer + 2-digit sequence → `140101`, `140201`, `140202` — all inside `140000`. |
| **Production master (`master-*/`) is exempt from blocks** | Its ids are small sequential (`1`…`7`) or taken from `app/constants` (`AI_PROVIDER.DEFAULT.ID`), because canonical ids are stable, meaningful, and referenced by application code. Blocks are for *fixture* data (`development/`, and dev-only samples in `dev-master/`). |

**Development suite bases** (each table within the suite; the same bases recur across suites):

| Table position in the suite | id base | example rows |
| --- | --- | --- |
| 1st (root — `customers` / `admins`) | `100000` | `100001`, `100002`, … |
| 2nd (`*_basics`) | `110000` | `110001`, … |
| 3rd (`*_secrets`) | `120000` | `120001`, … |
| 4th (`*_password_hashes`) | `130000` | `130001`, … |
| 5th (`*_access_tokens`) | `140000` | `140101`, `140201`, … |

**Blocks already in use** — do not reuse a base for a new seeder in the same table:

| Table | id base |
| --- | --- |
| `content_plan_rates` | `500000` |
| `content_benchmark_samples` | `510000` |
| `software_packages` | `520000` |
| `software_package_options` | `530000` |
| `integration_clients` | `600000` |

A child table's block sits above its parent's so FK ids stay readable. `dev-master` master samples
get one 6-digit, 10,000-wide block per file.

## 5. Timestamps come from TimestampSeedsSupplier

Do **not** put `created_at` / `updated_at` in seed rows. `supplyAll(seeds)` injects both ("now") for
every row; `deleted_at` is left unset (defaults to null).

```js
// TimestampSeedsSupplier.supplyOne returns:
{ created_at: now, updated_at: now, ...seed }
```

Because `...seed` is spread **after** the timestamps, a row **can** override them — but normally you
don't.

**Business datetimes are different.** A column that means something in the domain (`registered_at`,
`saved_at`, `effective_at`, `generated_at`, `expired_at`) **is** written explicitly in the seed — it
is not an audit column.

## 6. `development/` fixtures cover the app's operational cases

A `development/` seeder must comprehensively cover the cases that arise in the app's operation,
because a unit test can only exercise a branch if a matching fixture row exists. Cover at minimum:

| Case kind | What the row represents |
| --- | --- |
| Success | valid, normal operations that go through |
| Failure | operations rejected by a business rule (validation, insufficient balance, expired, over-limit) — well-formed row, "no" outcome |
| Error | abnormal / inconsistent states the code must still handle (partially-written data, a missing expected relation, an unexpected status) |
| Status variety within success | one row per **distinct status** the entity actually defines (`pending` / `active` / `suspended` / `withdrawn`, …) |

- **Label each row's case with a short comment** (`// active`, `// suspended`,
  `// orphaned — error path`) and group a status's rows on adjacent ids so the block reads as a case
  list.
- **Scope it to what the app actually branches on** — one representative row per branch, not a
  combinatorial explosion. Add an interacting combination (status × plan) as its own labelled row
  only when a test needs it.
- This applies to `development/` **only** — not to master / dev-master, which hold canonical config
  data, not operational case variety.

## 7. Keep every value distinct within a seeder

Choose seed values so **the same value never appears in two different columns**, so a column mix-up
in a test fails loudly instead of passing silently.

```js
// Bad example (id == user_id, and username == name — a column mix-up would pass silently)
{ id: 100001, user_id: 100001, username: 'taro', name: 'taro' }

// Good example (every column in its own value range / space)
{ id: 110001, user_id: 100001, username: 'user-110001', name: 'Alpha Taro' }
```

- **id vs same-row FK / numeric columns**: different ranges. The 10,000-wide blocks do this
  automatically — do not flatten them back onto the same value.
- **text columns**: `username` and `name` (or any two string columns) always hold different strings.

## Applying to the local DB

After adding or changing a seeder, rebuild with **`npm run r`** (`db:refresh`: teardown → migrate →
seed:dev-master → seed:dev). To load a single set without a teardown, run the matching script
directly (`npm run db:seed:dev-master`, `db:seed:dev`, `db:seed:prod`).

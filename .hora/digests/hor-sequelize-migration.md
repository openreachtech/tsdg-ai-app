# hor-sequelize-migration
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-sequelize-migration/ -->

**Read the source above whenever this leaves a question open.**

Migrations define the **physical schema**; the logical declarations (attributes / association /
scope / hook) belong to `hor-sequelize-model`. Keep the two in one-to-one correspondence — a column
added here gets a matching attribute there. This repo does **not** `sync`: the schema is built
entirely by migrations (dev = SQLite / staging = MySQL / live = MariaDB). A model's `unique: true`
is only a declaration; **the real object is always created by the migration**.

**Grand principle: a migration is a filled-in template.** Every migration has the same skeleton, so
review attention goes to the file-specific differences (columns / indexes). Do not write it
cleverly; lean toward the layout of the existing migrations.

## File name and placement

One migration = one file directly under `sequelize/migrations/`, extension `.cjs` (CommonJS —
sequelize-cli will not load ESM `import`).

```
{timestamp}-{seq}-<operation>-<table>[-<column>].cjs
```

| part | rule |
|---|---|
| `{timestamp}` | creation time `YYYYMMDDHHmmss`, 14 digits (`date +%Y%m%d%H%M%S`); ascending = apply order |
| `{seq}` | 6-digit zero-padded running number (`000001`, `000002`, …) |
| `<operation>` | `create_table` or `alter_table` |

Examples: `20260717135803-000001-create_table-content_generations.cjs` /
`20260717140512-000002-alter_table-content_generation_jobs-webhook_url.cjs`

Older migrations use the legacy `<8-digit-seq>-create_table-...` form (no timestamp). Write new
files in the form above.

## Constants at the top — single source of truth for physical names

Outside `up`/`down`, before `module.exports`: `TABLE_NAME` (string) and `COLUMN_NAME` (object,
`SCREAMING_SNAKE` keys → physical snake_case names). That value is referenced by **both** the
column's `field:` and the index name. Do not inline string literals into columns or indexes.

Add `SHORT_COLUMN_NAME` / `SHORT_TABLE_NAME` only when an index name needs shortening (see below).

## create_table skeleton — the smallest complete form

```js
'use strict'

const MigrationAttributeFactory = require('@openreachtech/renchan-sequelize/lib/tools/MigrationAttributeFactory.cjs')

const TABLE_NAME = 'content_generations'
const COLUMN_NAME = {
  CONTENT_GENERATION_JOB_ID: 'content_generation_job_id',
  RESULT_JSON: 'result_json',
  MODEL: 'model',
}

// Define an initialism only for a column whose index name would run long.
const SHORT_COLUMN_NAME = {
  CONTENT_GENERATION_JOB_ID: 'cgji',
}

module.exports = {
  async up (
    queryInterface,
    Sequelize
  ) {
    const factory = MigrationAttributeFactory.create(Sequelize)

    await queryInterface.createTable(TABLE_NAME, {
      ...factory.ID_BIGINT,

      // ForeignKey must start with upper case.
      ContentGenerationJobId: {
        type: Sequelize.BIGINT,
        field: COLUMN_NAME.CONTENT_GENERATION_JOB_ID,
        allowNull: false,
      },
      resultJson: {
        type: Sequelize.JSON,
        field: COLUMN_NAME.RESULT_JSON,
        allowNull: true,
      },
      model: {
        type: Sequelize.STRING(64),
        field: COLUMN_NAME.MODEL,
        allowNull: false,
      },

      ...factory.TIMESTAMPS,
    })

    // A 1:1 relation is enforced by a UNIQUE index (no DB FK).
    await queryInterface.addIndex(TABLE_NAME, [
      COLUMN_NAME.CONTENT_GENERATION_JOB_ID,
    ], {
      unique: true,
      name: [
        TABLE_NAME,
        SHORT_COLUMN_NAME.CONTENT_GENERATION_JOB_ID,
        'unique',
      ].join('_'),
    })

    return Promise.resolve()
  },

  async down (
    queryInterface,
    Sequelize
  ) {
    return queryInterface.dropTable(TABLE_NAME)
  },
}
```

**What `up` and `down` owe:**

| | |
|---|---|
| signature | both `async`, arguments `(queryInterface, Sequelize)` in that order, chopped one per line |
| `up` | `MigrationAttributeFactory.create(Sequelize)` → `createTable` → `addIndex` → `return Promise.resolve()` |
| `down` (create_table) | `return queryInterface.dropTable(TABLE_NAME)` — always, nothing else |

## PK and timestamps come from the shared preset

Spread `...factory.ID_BIGINT` at the **top** of the `createTable` object and
`...factory.TIMESTAMPS` at the **end**. **Never hand-write `id`, `created_at` or `updated_at`.**
The model side does not put the timestamps in its attributes; only the migration creates them.

| preset | columns created |
| --- | --- |
| `factory.ID_BIGINT` | `id` (bigint / autoIncrement / primaryKey / NOT NULL) |
| `factory.ID_INTEGER` | `id` (integer version) |
| `factory.TIMESTAMPS` | `created_at` / `updated_at` (`DATE(3)` / NOT NULL) |
| `factory.TIMESTAMPS_WITH_DELETED_AT` | the above + `deleted_at` (`DATE(3)`) — pair with `paranoid: true` on the model |

## Column notation

camelCase key + `field: COLUMN_NAME.X` + `type: Sequelize.X`. **Always** write `allowNull`; write
`defaultValue` when there is a default. Keep `allowNull` / `defaultValue` / string lengths
identical to the same-named column on the model side.

```js
currency: {
  type: Sequelize.STRING(8),
  field: COLUMN_NAME.CURRENCY,
  allowNull: false,
  defaultValue: 'JPY',
},
```

Omitting `field:` makes the physical name camelCase (mismatching the model's `underscored: true`);
omitting `allowNull` silently falls back to `true`.

| Type | Use |
| --- | --- |
| `BIGINT` | PK / FK-like id |
| `INTEGER` | small integer PK, quantity, version |
| `STRING(n)` | variable-length string (identifier `32`, display name / email `191` — pick by use, never default to 255) |
| `TEXT` / `TEXT('medium')` | long text (body, message, error). Plain `TEXT` caps around 64KB; for an item that can grow long use `TEXT('medium')` (MEDIUMTEXT, ~16MB); `TEXT('long')` only when that is not enough |
| `DATE(3)` | millisecond-precision datetime — the default for every datetime (`registeredAt` / `expiresAt`) |
| `BOOLEAN` | truth value (`isActive`) |
| `JSON` | structured data (`resultJson`); an FK-less id array (`optionIdsJson`) |
| `DECIMAL(p, s)` | money / rate (`dailyRate` as `DECIMAL(14, 2)`) |
| `BLOB('long')` | binary (uploaded file body) |
| `ENUM(...)` | **avoid by default**; use a domain constant + `STRING(n)` |

## FK-like columns — column only, never a DB constraint

A column holding another table's id gets an **uppercase-starting** key (`ContentGenerationJobId` /
`CustomerId`), type `BIGINT`, with this comment verbatim in English immediately above it:

```js
// ForeignKey must start with upper case.
CustomerId: {
  type: Sequelize.BIGINT,
  field: COLUMN_NAME.CUSTOMER_ID,
  allowNull: false,
},
```

The uppercase start matches the model association's "`<associated model name>` + `Id`" resolution;
`field:` maps it to snake (`..._id`).

**Never write** `references`, `onDelete`, `onUpdate`, or `queryInterface.addConstraint(...)` for an
FK. There is not a single FK constraint in the existing migrations. Referential integrity is
enforced in the app layer.

| case | how it is written |
|---|---|
| 1:N relation | column + **plain** index |
| 1:1 relation | column + **UNIQUE** index, prefixed with `// A 1:1 relation is enforced by a UNIQUE index (no DB FK).` |
| circular FK / optional relation | column only, `allowNull: true`, comment `// ForeignKey must start with upper case. (circular FK, column only)` |
| a set of ids not worth FK columns | a `JSON` array column, comment `// An array of ids without an FK.` |
| join table's composite key | composite UNIQUE index |

FK columns usually get an index — they are the starting point of joins and filters.

## Indexes

`queryInterface.addIndex(TABLE_NAME, [columns...], { name, unique? })`. The second argument is an
array of **physical** column names (`COLUMN_NAME.X`). **Always** give `name` explicitly, built by
`.join('_')` on an array.

| kind | shape |
|---|---|
| plain | ends in `'index'` → `<table>_<column>_index` |
| UNIQUE | adds `unique: true`, ends in `'unique'` → `<table>_<column>_unique` |

- **One index → `await` it directly. Several → wrap them in `Promise.all([...])`.**
- Composite index: list the columns
  (`[TABLE_NAME, COLUMN_NAME.STATUS, COLUMN_NAME.EXPIRES_AT, 'index']` →
  `content_sessions_status_expires_at_index`), or fold them into a meaningful label when that runs
  long (`[SHORT_TABLE_NAME, 'plan_tier_currency_effective_at', 'unique']` →
  `cpr_plan_tier_currency_effective_at_unique`; `[SHORT_TABLE_NAME, 'job_package', 'unique']`).
- A UNIQUE named index is **the real constraint** behind a 1:1 relation or a natural key.

### Shortening a long index name

The DB identifier limit is 64 characters; as a safety margin, shorten once a name would run past
**~50 characters**. **Do not shorten when it fits** — mechanical initialising hurts readability
(`customers_registered_at_index` stays full). Shorten in this priority order:

1. **Shorten the column name(s) first** via `SHORT_COLUMN_NAME`, keeping `TABLE_NAME` in full —
   `content_generations` + `cgji` + `unique` → `content_generations_cgji_unique`.
2. **Only if still too long, shorten the table name too** via `SHORT_TABLE_NAME` —
   `cgrf` + `cgji` + `index` → `cgrf_cgji_index`.

The table name is how a reader tells which table an index belongs to, so cut it last.

**How to shorten:** split the snake_case name on `_`, concatenate the **first character** of each
word. `content_generation_job_id`→`cgji`, `content_generation_requirement_files`→`cgrf`,
`content_generation_job_packages`→`cgjp`, `content_plan_rates`→`cpr`, `chat_room_id`→`cri`,
`customer_id`→`ci`. Always put abbreviations in `SHORT_COLUMN_NAME` / `SHORT_TABLE_NAME` constants
and reference them from `name` (never inline). On a collision within a table, add a second letter.

## Comments

English for structural conventions (`// ForeignKey must start with upper case.`); the surrounding
language for domain notes (often Japanese in this repo) — match the surrounding files.

## alter_table (add / remove columns)

Filename `{timestamp}-{seq}-alter_table-<table>-<column>.cjs`. Put a `/* ... */` block at the top of
the file describing the **intent** (ticket number, spec reference, backward-compat notes).

- `up` → `queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, { type, allowNull })`. Several adds may
  be grouped in `Promise.all`.
- **Never use `removeColumn`** — it does not work on MariaDB (live). Drop with raw SQL via
  ``queryInterface.sequelize.query(`ALTER TABLE \`${TABLE_NAME}\` DROP COLUMN \`${COLUMN_NAME}\``)``,
  identifiers quoted with backticks, **one statement per column, sequentially** (SQLite drops one
  column per statement).
- `up` / `down` are symmetric: `down` drops exactly what `up` added.
- A column added to a table that already holds rows must be `allowNull: true` or carry a
  `defaultValue` — never a NOT NULL column after the fact.
- A single column may hold `COLUMN_NAME` as a string; multiple columns make it an object.
- No `MigrationAttributeFactory` require is usually needed (PK / timestamps already exist).

full text: references/alter-table.md

## Applying changes to the local DB

`npm run r` (= `npm run db:refresh`, `NODE_ENV=development`) — teardown → migrate → seed:master →
seed:dev in one shot, after any migration / seeder change. Individually: `npm run db:setup`
(migrate only) / `npm run db:teardown` (delete the SQLite files).

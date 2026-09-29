# hor-database-design
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-database-design/ -->

**Read the source above whenever this leaves a question open.**

Design-level only: *what* tables and columns exist and why. The physical declaration (migration files, DataTypes, indexes) belongs to `hor-sequelize-migration`; model attributes and associations to `hor-sequelize-model`.

## Grand principle

The database is the **single source of truth**, stored in its **canonical, non-redundant** form. Anything *derived* (aggregates, search indexes), *presentational* (timezone, human-readable labels), or *volatile / large* (files, dynamic blobs) is kept **out of the normalized core** and lives in a separate structure or another layer.

**When a rule and performance conflict, do not compromise the core** — add a separate, additive, rebuildable structure beside it. Never fix a query-speed concern by corrupting the write model.

## Normalization

- Design every table to **third normal form (3NF)** by default: each non-key column depends on the whole key and nothing but the key, and no fact is stored in two places.
- When reads degrade, **do not** denormalize the canonical tables. Add either a **summary / read-model table** named with a **`summary_` prefix** (`summary_order_listings`), rebuilt from the canonical tables, or an external **search database**.
- The `summary_` prefix is a signal: "this is derived, not authoritative." Never let application writes treat a summary row as the source of truth.

## Datetimes

**Separate business datetimes from the ORM's audit timestamps.** `created_at` / `updated_at` / `deleted_at` are **audit columns managed by the ORM** — the application does **not** read or write them. When business logic needs a creation / update / registration time to display or reason about, add a **dedicated, well-named column**: `generated_at`, `modified_at`, `registered_at`.

**Suffix rule:**

| Meaning | Suffix | Example |
| --- | --- | --- |
| carries a time of day | `_at` | `modified_at`, `trashed_at`, `expired_at` |
| meaning stops at the calendar date | `_on` | `billed_on`, `due_on` |
| the two ends of a range | two columns, each keeping the suffix | `modified_at_from`, `modified_at_to` |

- A value that has a range is **two columns** — never one column carrying both ends.
- `_from` / `_to` mark **the two ends of a range**. A single column meaning "in effect from this moment" is not a range end: name it for the instant it holds — `effective_at`, not `effective_from`.
- The same name travels unchanged into the model attribute and the SDL field (camelCase form).

**Storage:** every datetime column is **UTC** and typed `DATETIME(3)` (Sequelize `DATE(3)`) — millisecond precision. Timezone conversion is the **application layer's** responsibility, never the database's. Millisecond precision is required so high-frequency writes within the same second still order deterministically.

## Status / category sets → master table

Do not store a status or category as a free-form string. Create a **master table** (`order_statuses`) that defines the set, and give the entity a **key column** that maps to it (the FK-like `OrderStatusId`). Reserve `ENUM` for sets that are **clearly closed and small**; when unsure, use the master table — it is the reversible choice.

**Naming:** name the master table for the classification it holds, **in the plural: `*_statuses` for a status set, `*_categories` for a classification set — never `*_types`.** The entity's key column follows the table (`OrderStatusId`, `GranteeCategoryId`; not `GranteeTypeId`). `type` is prohibited as a suffix because it collides with the JSDoc type annotation. (One exception: a word borrowed verbatim from an external standard, such as `mimeType`.)

The entity's key column is an **FK-like column** (uppercase-initial `OrderStatusId`, **no DB foreign-key constraint**) — see `hor-sequelize-migration`.

**Standard columns of every reference master table:**

| Column | Role |
| --- | --- |
| `id` | primary key — what the entity's FK-like key column references |
| `name` | **system key**: the stable identifier the application binds to (`'ordered'`). Machine-facing, unique, never renamed once referenced |
| `display_name` | **user-facing label** shown in the UI (`'Ordered'`). Free to reword or localize without touching logic |
| `display_order` | the order in which to present the set in the UI |
| `is_active` | whether the entry is currently selectable / in use |

- Application logic keys off `name`, never `display_name`.
- `display_order` is a column, not code — presentation order is data.
- Retire a value with `is_active = false`; never delete the master row (historical references would be orphaned — there is no DB FK constraint). Filter to `is_active = true` when offering choices.
- Put a **UNIQUE index on `name`** — it is the real key of the set (see `hor-sequelize-migration`).

```
order_statuses (id, name, display_name, display_order, is_active)
-- (1, 'ordered',   'Ordered',   1, true)
-- (2, 'cancelled', 'Cancelled', 2, false)   -- retired: kept for history, no longer offered
orders         (id, OrderStatusId, ...)
```

## Versioned master tables

A master table that manages **many records as one unit that changes over time** (price list, rate table, fee schedule) is **versioned** as **two separate tables**: a **version table** (one row per published version, carrying the version key, e.g. an `effective_at` datetime) and the **master-rows table** (the records, each belonging to a version). Read the version effective at a given time; **never edit a published version's rows in place** — publish a new version instead.

```
price_tables      (id, effective_at, ...)                       -- version table
price_table_rows  (id, PriceTableId, product_key, amount, ...)  -- master rows, immutable per version
```

Mechanics: renchan's `SuiteVersionMixinModel` — version table `hasMany` the suite rows, `versionKey` (e.g. `effectiveAt`) selects the version, `findCurrentSuite()` reads it. See the mixin catalog in `hor-sequelize-model`.

## Column types

| Data | Type | Note |
| --- | --- | --- |
| Genuinely dynamic / schemaless values | `JSON` | only for values never queried or joined relationally |
| URL | `TEXT` | not `STRING(n)` — real URLs have no reliable length bound |
| Long content (article body, description) | `TEXT('medium')` (MEDIUMTEXT) | size the column to the content |
| Datetime | `DATE(3)` (UTC) | see Datetimes |
| Status / category | master-table key column | see Master tables |

- `JSON` is for a value whose structure varies per row and is never the target of a relational query (a settings blob, a captured third-party payload). It is the **wrong** home for data with a fixed shape and relationships — normalize relational facts into tables.
- **Integers: default to `INTEGER`**, and `BIGINT` for ids and anything that accumulates over the table's life. Do **not** reach for `SMALLINT` / `TINYINT` to "save space" unless there is a **specific, permanent bound** that guarantees the value can never outgrow the narrow range (a value by definition 0–100, a fixed small code set).
- **Never store a file's bytes in the database.** Put the file in external object storage and keep only a **reference** — the storage key or URL, as `TEXT`.
  ```
  documents (id, OwnerId, storage_key TEXT, content_type, byte_size, uploaded_at)
  ```

## Update history — the archive pattern

When you need to retain the **update history** of a table, use the **archive pattern**: keep the live table holding only the **current** row, and on every save **append** a copy of the row's business attributes — as a new generation — to a **parallel archive table**. Do not keep history by piling every revision into the live table (`is_current` flag, per-row version numbers).

```
customer_orders     (id, CustomerId, OrderStatusId, ...)                -- current row only
customer_orders_bk  (id, CustomerOrderId, ...business attrs, saved_at)  -- one appended row per save
```

Mechanics: renchan's `BackupMixinModel` + a `*_bk` table (`customer_orders` → `customer_orders_bk`): on `afterSave` it appends the business attributes (excluding `id` / `created_at` / `updated_at` / `deleted_at`) plus a `saved_at` generation marker. Pass the mixin from the live model; see the mixin catalog in `hor-sequelize-model`.

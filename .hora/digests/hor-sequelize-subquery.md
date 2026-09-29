# hor-sequelize-subquery
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-sequelize-subquery/ -->

**Read the source above whenever this leaves a question open.**

## Grand principle

A subquery is a **named, reusable `SELECT` registered on the model that owns its condition
columns**, consumed from a `where` clause. Registered with `this.addSubquery({ name, generator })`
inside `static defineSubqueries()`; consumed with `Model.subquery(name, params)`, which returns a
`Sequelize.Literal`.

The API comes from `RenchanModel` in `@openreachtech/renchan-sequelize` — **never roll your own**
(no raw `Sequelize.literal('SELECT ...')` at a call site, no ad-hoc join to express a cross-table
filter). The name **encodes exactly its `where` conditions and its `select` columns**, so a
consumer reads `'?CustomerId.id'` and knows what it means without opening the model.

Comments inside the produced model / resolver code are **English**, matching the codebase.

## Is this a subquery? — the decision

| The requirement | What to use |
| --- | --- |
| Constrain rows of model A by a condition that lives on model B | **subquery** — `A.id IN (SELECT ... FROM b WHERE ...)` |
| Load B *together with* A **for output** (eager-loading) | **`include` association**, per `hor-sequelize-model` — *not* a subquery |

- **A subquery is for filtering, not eager-loading.** Its result columns are what the outer
  `where` matches against (usually an id / FK column).
- It is defined **on the model that owns the condition columns** — the model whose table the
  inner `SELECT` reads.

Typical filtering cases: "payments of the orders belonging to this customer"; "shipments whose
**latest status** is in a given set"; "coupons valid **at** a point in time".

## Naming convention

```
?<cond1>[<op1>]?<cond2>[<op2>].<result1>.<result2>
```

- **Condition columns (the `where`)** each start with `?`. The operator goes in square brackets
  `[...]` immediately after the column name; a plain equality has **no** brackets.
- **Result columns (the `select`)** each start with `.`.
- **The table name never appears in the name.** The subquery is added to a target model, so the
  table is self-evident.

| format | meaning |
| :-- | :-- |
| (none) | set as value directly (plain equality) |
| `[=]` | `Op.eq` |
| `[>]` | `Op.gt` |
| `[>=]` | `Op.gte` |
| `[<]` | `Op.lt` |
| `[<=]` | `Op.lte` |
| `[in]` | `Op.in` |
| `[between]` | `Op.between` |
| `[like]` | `Op.like` |

Reading examples:
- `?CustomerId.id` — "`WHERE CustomerId = ?`, `SELECT id`"
- `?ShipmentStatusId[in].ShipmentId` — "`WHERE ShipmentStatusId IN (...)`, `SELECT ShipmentId`"
- `?validFrom[<=].validUntil[>=].CouponId` — two conditions, each with its own operator
- `?OriginObjectCategoryId?jobDivisionNumber.id` — two equality conditions (no brackets), one result

**The name and the generator must agree.** Every `?` column in the name appears in `where` with
exactly the operator its brackets declare; every `.` column appears in `attributes`. A name that
says `[in]` while the generator assigns a direct value is a bug — the name is the contract.

## Register in `defineSubqueries()`

Call `super.defineSubqueries?.()` first (as with every extension point in `hor-sequelize-model` —
otherwise a Mixin's base behavior is lost), read physical field names off `this.getAttributes()`,
then add each subquery.

The `generator` receives a params object and returns `{ attributes, where }`:

- `attributes` — the `SELECT` column list, as **DB field names** (take them from
  `this.getAttributes().<key>.field`, never hard-code snake_case strings).
- `where` — a Sequelize where clause, keyed by DB field names, using the `Op` symbols that the
  subquery name declares.

```js
/**
 * Define model subqueries
 *
 * @override
 */
static defineSubqueries () {
  super.defineSubqueries?.()

  const allAttributes = this.getAttributes()
  const idField = allAttributes.id.field
  const CustomerIdField = allAttributes.CustomerId.field

  this.addSubquery({
    name: '?CustomerId.id',
    generator: ({
      customerId,
    }) => {
      const attributes = [
        idField,
      ]

      const whereClause = {
        [CustomerIdField]: customerId,
      }

      return {
        attributes,
        where: whereClause,
      }
    },
  })
}
```

A bracketed operator becomes an `Op` symbol in the `where` — `Op` is imported at the top of the
model file as `import { Op as SequelizeOp } from 'sequelize'`:

```js
const whereClause = {
  [validFromField]: {
    [SequelizeOp.lte]: now,
  },
  [validUntilField]: {
    [SequelizeOp.gte]: now,
  },
}
```

## Consume via `Model.subquery(name, params)` under `Op.in`

Call it inside a `buildXxxWhereClause()` method (per `hor-query-resolver`), and drop the returned
literal into the `where`, almost always as the right-hand side of an `Op.in`:

```js
const shipmentLatestStatusSubquery = ShipmentLatestStatus.subquery(
  '?ShipmentStatusId[in].ShipmentId',
  {
    shipmentStatusIds: [SHIPMENT_STATUS.READY_TO_SHIP.ID],
  }
)

const whereClause = {
  TenantBrandId: tenantBrandId,
  id: {
    [Op.in]: shipmentLatestStatusSubquery,
  },
}
```

Combining two subqueries on the same column uses `Op.and`:

```js
return {
  ...whereClause,
  id: {
    [Op.and]: [
      {
        [Op.in]: shipmentLatestStatusSubquery,
      },
      {
        [Op.in]: desiredDeliveryDateSubquery,
      },
    ],
  },
}
```

- Calling `Model.subquery(name, ...)` with a name that was never registered throws
  `invalid subquery ${name} called.` — the name string at the call site must match the registered
  name character for character.

## Testing

Test the **generator**, not the SQL string. It is pure (no DB access), so the test needs no seeder
and lives under `tests/__tests__/sequelize/models/`.

Structure: `describe('<Model>')` → `describe('.subquery')` → `describe('<subquery name>')` →
`test.each`. Import `Op` from `sequelize` so the expected `where` carries the real operator symbols.

```js
const generator = ShipmentLatestStatus.getSubqueryOptionsGenerator('?ShipmentStatusId[in].ShipmentId')

const actual = generator(params)

expect(actual)
  .toEqual(expected)
```

- **`test.each`, prefer ≥ 2 cases** (vary the params); a trivial single-condition subquery may use
  one case. Vary exactly one `params` field in the title and keep it unique per case — dot into an
  array element as needed (`$params.shipmentStatusIds.0`).
- **Cases are `{ params, expected }`** — no other keys unless justified.
- **One `toEqual`** for the whole returned object; build the full `expected` (including `Op`
  symbols) and compare once.
- **AAA, no logic in the body** — arrange the generator, act by calling it, assert.
- The expected `attributes` / `where` keys are the **DB field names** (snake_case) — that is what
  the generator returns, and it verifies the attribute-to-field mapping too.
- Test against real seeded data only when exercising it end-to-end through a resolver that reads
  the DB — that is a resolver test, placed per `hoc-jest`.

full text: `.claude/skills/hor-sequelize-subquery/SKILL.md#5-testing`

## Finishing checklist

- [ ] Registered in `static defineSubqueries()` on the model owning the condition columns, via `this.addSubquery({ name, generator })` — no raw `Sequelize.literal` at call sites.
- [ ] `super.defineSubqueries?.()` first; field names from `this.getAttributes()`.
- [ ] Name follows `?<condition>[<operator>].<result>`, agrees with the generator, and carries no table name.
- [ ] Generator returns `{ attributes, where }` keyed by DB field names.
- [ ] Consumer calls `Model.subquery(name, params)` under `Op.in` (`Op.and` to combine two on one column), name matching character for character.
- [ ] Generator tested via `Model.getSubqueryOptionsGenerator(name)` under `tests/__tests__/sequelize/models/`.

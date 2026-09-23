# hor-sequelize-model
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-sequelize-model/ -->

**Read the source above whenever this leaves a question open.**

## Grand principle

A model is a **filled-in template, not free-form code**. Every model extends `BaseAppRenchanModel` and has the same skeleton: the six extension points (`createAttributes` / `createOptions` / `associate` / `defineScopes` / `defineSubqueries` / `setupHooks`) are **always laid out in the same order, even when unused**, and any with no content keep `super.xxx?.()` plus `// noop`.

- **Do not "delete to omit".** A kept noop declares "considered, and not applicable"; a deleted method cannot be told from a forgotten one.
- When in doubt, lean toward the template. No custom static methods, no changed initialization order. Extend via a Mixin or a framework extension point.
- Comments inside model `.js` code are written in **English**.

## Correspondence with the migration

Attributes correspond **one-to-one** with the migration's columns. camelCase attribute keys map to snake_case physical columns via `underscored: true`. Always change migration and model together. Timestamp columns are the exception — never in the model.

## File & class

- One class per file, directly under `sequelize/models/`. Filename = the **singular PascalCase class name** (`CustomerOrder.js`). `SequelizeActivator` registers by class name; if filename / class name drift, `this._.X` resolves to `undefined`.
- `export default class X extends BaseAppRenchanModel` — never Sequelize's `Model`, never `RenchanModel` directly.
- **Exception**: only tree (Fertile Forest) models extend `FertileForestModel`. Ordinary master / transaction tables always use `BaseAppRenchanModel`.
- Imports are limited to `@openreachtech/renchan-sequelize` (`ModelAttributeFactory` / Mixins), `BaseAppRenchanModel` (relative path), and **domain constants** (`app/domain/*`) holding values used in place of `ENUM`. No business logic, no external I/O.

```js
import {
  ModelAttributeFactory,
} from '@openreachtech/renchan-sequelize'

import BaseAppRenchanModel from '../baseModel/BaseAppRenchanModel.js'

/**
 * CustomerOrder model
 *
 * @class CustomerOrder
 * @extends {BaseAppRenchanModel}
 */
export default class CustomerOrder extends BaseAppRenchanModel {
  // createAttributes / createOptions / associate / defineScopes / defineSubqueries / setupHooks
}
```

## The six methods — fixed order, each with JSDoc

Fixed order, JSDoc (purpose, `@param`, `@returns`) immediately above each:

1. `createAttributes (DataTypes)` — **abstract**, the base throws; always implement.
2. `createOptions (sequelizeClient)`
3. `associate ()`
4. `defineScopes (Op)`
5. `defineSubqueries ()`
6. `setupHooks ()`

```js
  /**
   * Define model attributes
   *
   * @param {import('sequelize').DataTypes} DataTypes - Sequelize DataTypes
   * @returns {object} Model attributes
   */
  static createAttributes (DataTypes) {
    const factory = ModelAttributeFactory.create(DataTypes)

    return {
      ...factory.ID_BIGINT,
    }
  }

  /**
   * Define model options
   *
   * @param {import('sequelize').Sequelize} sequelizeClient - Sequelize instance
   * @returns {object} Model options
   */
  static createOptions (sequelizeClient) {
    return {
      ...super.createOptions(sequelizeClient),
    }
  }

  /**
   * Define model associations
   */
  static associate () {
    super.associate?.()

    this.belongsTo(this._.Customer)
  }

  /**
   * Define model scopes
   *
   * @param {import('sequelize').Op} Op - Sequelize operators
   */
  static defineScopes (Op) {
    super.defineScopes?.(Op)

    // noop
  }

  /**
   * Define subqueries
   */
  static defineSubqueries () {
    super.defineSubqueries?.()

    // noop
  }

  /**
   * Setup model hooks
   */
  static setupHooks () {
    super.setupHooks?.()

    // noop
  }
```

**`super.xxx?.()` comes first, always.** `RenchanModel` calls each Mixin's same-named handler through `mixinsApplier`; an override that does not call `super` **disables the Mixin** (Backup's `afterSave` etc. is swallowed). `?.` keeps it safe when the base has no such method.

## createOptions

Spread `...super.createOptions(sequelizeClient)` and add **only extras**. The base returns `{ modelName, sequelize, syncOnAssociation: false, timestamps: true, underscored: true }` — never restate those per model. Most models finish at the spread alone.

| Extra | When |
| --- | --- |
| `tableName: 'customer_orders_bk'` | only when the physical name breaks "table = plural / model = singular" — the typical case is a backup table `<original table>_bk` (model `CustomerOrdersBk` would infer `customer_orders_bks`). Redundant otherwise. |
| `paranoid: true, // for deleted_at column` | only for a table with `deleted_at` soft delete (migration used `...factory.TIMESTAMPS_WITH_DELETED_AT`). Adding it without the column makes queries fail. |

## Attributes

- Spread `...factory.ID_BIGINT` at the **top** (or `...factory.ID_INTEGER` for an integer PK). Never hand-write `id`. Build with `const factory = ModelAttributeFactory.create(DataTypes)`.
- Keys are **camelCase** (`registeredAt` / `questionsJson`); never write the snake_case physical name.
- **Declare `allowNull` on every attribute**, and `defaultValue` on any column that has a default; keep both in sync with the migration.
- Define the TS interface in `type.d.ts` collected into the global namespace `model` — **not** a JSDoc `@typedef` at the bottom of the model file.

| Type | Use |
| --- | --- |
| `BIGINT` | PK / FK-like id |
| `INTEGER` | small integer PK, quantity, version |
| `STRING(n)` | variable-length string (`191` default; pick `8`/`16`/`32`/`64` by use) |
| `TEXT` | long text (body, message) |
| `DATE(3)` | millisecond-precision datetime (`registeredAt` / `savedAt`) — the default for datetimes |
| `BOOLEAN` | truth value (`isActive`) |
| `JSON` | structured data (`questionsJson` / `resultJson`) |
| `DECIMAL(p, s)` | money / rate |
| `BLOB('long')` | binary |
| `ENUM(...)` | **avoid by default** — use a domain constant + `STRING(n)` |

Do not default string lengths to "255 for now": identifiers `STRING(32)`, display names / emails `STRING(191)`; match the migration's length.

### FK-like columns

Key **starts with an uppercase letter**, type `BIGINT`, with the comment immediately above:

```js
// ForeignKey must start with upper case.
CustomerOrderId: {
  type: DataTypes.BIGINT,
  allowNull: false,
},
```

lowerCamel (`customerOrderId`) fails to wire the relation — Sequelize resolves the FK as `<associated model name>` + `Id`. Do not drop the comment.

`unique: true` on an attribute **states intent only**; the real constraint is the migration's named unique index. Keep both sides consistent when you write it.

## Timestamps

Never put `createdAt` / `updatedAt` / `deletedAt` in `createAttributes()`. Column creation belongs to the migration (`...factory.TIMESTAMPS`), value management to `timestamps: true` from the base `createOptions()` — do not touch `timestamps` on the model side. Attributes stay **business attributes only** (this is what `practicalAttributeNames` and `BackupMixinModel`'s cloning exclusion assume).

For a business "saved-at" time, define a dedicated `DATE(3)` column (`savedAt` / `postedAt` / `registeredAt` / `modifiedAt` / `generatedAt` / `effectiveAt`) — never repurpose `createdAt`.

Naming: `~At` carries a time of day; a calendar-date-only attribute ends `~On` (`billedOn`). A range is two attributes keeping the suffix (`modifiedAtFrom` / `modifiedAtTo`); a single instant meaning "in effect from this moment" is `effectiveAt`, not `effectiveFrom`.

## associate()

Reference the associated model **only** via `this._.<ModelName>` (= `sequelize.models`, resolved after registration; a direct import causes a circular dependency). `super.associate?.()` first.

| Method | Meaning | Side holding the FK |
| --- | --- | --- |
| `this.belongsTo(this._.X)` | I reference one X (I hold the FK) | **me** |
| `this.hasOne(this._.X)` | X references me once (1:1) | the other (X) |
| `this.hasMany(this._.X)` | X references me many times (1:N) | the other (X) |
| `this.belongsToMany(this._.X, { through: this._.Y })` | many-to-many through join table Y | the join table (Y) |

- `belongsTo` on the child (FK-holding) side, `hasOne` / `hasMany` on the parent; both sides may be declared.
- **Pass options only when the default inference is wrong** — `through` for `belongsToMany`, and `foreignKey` when the FK attribute departs from `<ModelName>Id` (a role-named FK, or two FKs to the same model). Restating an option inference already resolves is a violation.
- Loaded property name comes from the declaration: `belongsTo` / `hasOne` → **singular** model name (`order.CustomerOrderTotalPrice`); `hasMany` / `belongsToMany` → **pluralized** model name (`order.CustomerOrderProducts`).
- A join-table model is an ordinary model with a `belongsTo` to **each** end, holding each `<Model>Id`, plus `paranoid` when it soft-deletes.
- **No DB foreign-key constraints** (`references` / `onDelete` / `onUpdate`) — integrity is enforced in the app layer.

## defineScopes / defineSubqueries / setupHooks

| Method | For | API |
| --- | --- | --- |
| `defineScopes(Op)` | named scopes (reusable filtering / ordering) | `this.addScope(name, options)` |
| `defineSubqueries()` | correlated subqueries usable via `this.subquery(name, ...)` | `this.addSubquery({ name, generator })` |
| `setupHooks()` | lifecycle hooks (before/after save and find) | `this.beforeFind` / `this.afterSave` / `this.addHook(...)` |

Routine behavior goes into a **Mixin**, not hand-written here — "clone to a history table on every save" is `BackupMixinModel`, not a hand-written `setupHooks`. Add a per-model scope / hook only for a one-off a Mixin cannot express.

## Mixins

Override `static get Mixins ()` to return an array of MixinModels, imported from `@openreachtech/renchan-sequelize`. The `Mixins` getter and the abstract getters a Mixin requires go **after the six methods**, at the end of the class.

```js
  /**
   * get: Mixin models to apply
   *
   * @returns {Array<Function>} Mixin models
   */
  static get Mixins () {
    return [
      BackupMixinModel,
    ]
  }

  /**
   * get: Backup model for BackupMixinModel
   *
   * @returns {typeof import('./CustomerOrdersBk')} Backup model declaration
   */
  static get BackupModel () {
    return this._.CustomerOrdersBk
  }
```

A required abstract getter left unimplemented fails at the moment the Mixin's handler runs: `".get:BackupModel" must be inherited`. Return the related model with `this._.<ModelName>`.

| Mixin | Purpose | Required abstract getter | Optional override (default) |
| --- | --- | --- | --- |
| `BackupMixinModel` | clone/append business attributes to another table on every save (history) | `BackupModel` | — |
| `LatestStatusMixinModel` | keep a status history; auto-include on find and get the latest | `StatusModel` / `StatusPhaseModel` | `orderAttributeOfStatusPhaseModel` (`'savedAt'`) |
| `SuiteVersionMixinModel` | fetch a versioned "suite" per version | `SuiteModel` | `versionKey` (`'startedAt'`) / `getSuiteSorter` |
| `PaginationMixinModel` | `findAllWithPagination()` and a `&pagination` scope | none | — |
| `ReferralMixinModel` | referral tree via invite codes (Fertile Forest) | `InviteCodeModel` / `ReferralNodeModel` | `inviteCodeAttributeOfInviteCodeModel` and others |
| `AttributesLinearizerMixinModel` | flatten an included nested structure into each node's `dataValues` | none | — |

`BaseMixinModel` is the base of all six and is never passed directly.

### BackupMixinModel — history

In the **`afterSave` hook** it `build`s → `save`s the body's business attributes (all attributes **except `id` / `createdAt` / `updatedAt` / `deletedAt`**) into the `BackupModel` table, appending a generation. **Pass the Mixin to the body table** (`CustomerOrder`); `BackupModel` returns the backup table (`CustomerOrdersBk`).

The backup table is an ordinary model holding the body's business attributes plus a save time (`savedAt`), and it declares `tableName` because its inferred plural clashes with the real `_bk` name.

> Because the Mixin composes onto `afterSave`, the backup is appended only by a write path that fires that hook — the skill states the hook and the `build`→`save` behavior, but does **not** spell out a `.save()`-over-`.update()` rule for call sites. Confirm at the source before relying on it. full text: `.claude/skills/hor-sequelize-model/references/mixins.md#backupmixinmodel-in-use`

### The other mixins — how to pass

`LatestStatusMixinModel`: `belongsToMany(StatusModel, { through: StatusPhaseModel })`, auto-includes in `beforeFind`, exposes the instance's `latestStatus` (head of `savedAt` descending); override `orderAttributeOfStatusPhaseModel` to change the ordering column.

`SuiteVersionMixinModel`: manages `hasMany(SuiteModel)` by version; provides `findCurrentSuite()` / `findAllSuites()` / `createWithSuite()`; pulls the latest version at or before `versionKey` (default `'startedAt'`); override `getSuiteSorter` to change ordering.

`ReferralMixinModel`: `createByInviteCode()` / `buildByInviteCode()`, resolves the parent node in `beforeCreate`, `sprout`s a node in `afterCreate`. The model returned by `ReferralNodeModel` extends `FertileForestModel`.

`PaginationMixinModel` and `AttributesLinearizerMixinModel` need no getter — just pass them in the array.

# hor-resolver-validator
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-resolver-validator/ -->

**Read the source above whenever this leaves a question open.**

> **Surface mismatch — read this first.** The skill scopes itself to **GraphQL resolvers**
> (`app/validator/forResolver/<endpoint>/{queries,mutations}/`). It says nothing about a REST
> surface except one line in `references/inspector-api.md`: "At the GraphQL/REST boundary prefer
> the string-tolerant (`*Like`) checks". The section **"What is tied to GraphQL, what is not"** at
> the end of this digest splits the convention. Do not invent a REST equivalent for the tied half.

> The skill also warns of a second mismatch of its own: "Directory layout differs from the current
> repo on purpose — this is the target convention." The support classes (`BaseInputValidator`,
> `NormalPaginationInputValidator`) come from the renchan framework / shared layer; the inspectors
> come from the `@openreachtech/mentsu-value-inspector` module.

## Grand principle: declare `[predicate, error]` entries, let the base run them

A validator is a `BaseInputValidator` subclass whose **only required override is
`generateValidationEntries()`** — it returns `Array<[() => boolean, RenchanGraphqlErrorCtor]>`. Each
entry pairs a **predicate** (returns `true` when that rule passes) with the **error constructor** to
raise when it fails. The base holds `this.input` and `this.errorHash`, iterates the entries, and
throws the error of **the first failing predicate**.

- **Predicates are small `isValidX()` methods** that read `this.input` and return a boolean. They use
  the inspector classes and/or composed sub-validators — **they never throw**.
- **Errors come from `this.errorHash`** (the resolver's error hash, injected into the validator).
- **Reuse shared validators** (e.g. pagination) by composing them inside entries, not by
  re-implementing limit/offset/sort.

## Directory & naming

- **Validators:** `app/validator/forResolver/<endpoint>/<operation-kind>/<Operation>InputValidator.js`
  - `<endpoint>` tracks the GraphQL endpoint the resolver belongs to (`user`, `customer`, `admin`, …).
  - `<operation-kind>` is **`queries`** or **`mutations`**.
  - e.g. `app/validator/forResolver/user/queries/EmailInsertableVariablesInputValidator.js`.
- **Shared under `app/validator/forResolver/`:** `BaseInputValidator.js` and reusable validators such
  as `NormalPaginationInputValidator.js` (default-exported, commonly imported as
  `PaginationInputValidator`).
- **Inspectors:** imported directly from `@openreachtech/mentsu-value-inspector` — it is a published
  module, so use it from the package, never a local wrapper. `npm install
  @openreachtech/mentsu-value-inspector@1.1.0`.
- Class name = `<Operation>InputValidator` (PascalCase, matching the resolver's `schema`).

## The template

```js
import {
  IntegerValueInspector,
} from '@openreachtech/mentsu-value-inspector'

import BaseInputValidator from '../../BaseInputValidator.js'
import PaginationInputValidator from '../../NormalPaginationInputValidator.js'

const VALID_SORT_COLUMNS = [
  'labelName',
  'fieldPath',
]

/**
 * Class for validating input of the emailInsertableVariables query
 *
 * @extends {BaseInputValidator<ErrorHash, EmailInsertableVariablesInput>}
 */
export default class EmailInsertableVariablesInputValidator extends BaseInputValidator {
  /**
   * Generate validation entries
   *
   * @override
   * @returns {Array<[() => boolean, RenchanGraphqlErrorCtor]>}
   */
  generateValidationEntries () {
    const paginationInputValidator = this.createPaginationInputValidator()

    return [
      [
        () => paginationInputValidator.isValidLimit(),
        this.errorHash.InvalidPaginationLimit,
      ],
      [
        () => paginationInputValidator.isValidOffset(),
        this.errorHash.InvalidPaginationOffset,
      ],
      [
        () => paginationInputValidator.isValidSort(),
        this.errorHash.InvalidPaginationSort,
      ],
      [
        () => this.isValidKeyword(),
        this.errorHash.InvalidKeyword,
      ],
      [
        () => this.isValidOriginObjectCategoryId(),
        this.errorHash.InvalidOriginObjectCategoryId,
      ],
    ]
  }

  /**
   * Create a PaginationInputValidator instance
   *
   * @param {{
   *   input?: EmailInsertableVariablesInput
   * }} [params]
   * @returns {PaginationInputValidator}
   */
  createPaginationInputValidator ({
    input = this.input,
  } = {}) {
    return PaginationInputValidator.create({
      input,
      validColumns: VALID_SORT_COLUMNS,
    })
  }

  /**
   * Validate keyword
   *
   * @returns {boolean}
   */
  isValidKeyword () {
    const {
      keyword = null,
    } = this.input

    if (!keyword) {
      return true
    }

    return typeof keyword === 'string'
  }

  /**
   * Validate originObjectCategoryId
   *
   * @returns {boolean}
   */
  isValidOriginObjectCategoryId () {
    const inspector = this.createIntegerValueInspector({
      value: this.input.originObjectCategoryId,
    })

    // the module has no isPositiveInteger — compose it (string-tolerant *Like)
    return inspector.isIntegerLike()
      && inspector.isPositiveNumberLike()
  }

  /**
   * Create an IntegerValueInspector instance
   *
   * @param {{
   *   value: number | string
   * }} params
   * @returns {IntegerValueInspector}
   */
  createIntegerValueInspector ({
    value,
  }) {
    return IntegerValueInspector.create({
      value,
    })
  }
}

/**
 * @typedef {{
 *   InvalidKeyword: RenchanGraphqlErrorCtor
 *   InvalidOriginObjectCategoryId: RenchanGraphqlErrorCtor
 *   InvalidPaginationLimit: RenchanGraphqlErrorCtor
 *   InvalidPaginationOffset: RenchanGraphqlErrorCtor
 *   InvalidPaginationSort: RenchanGraphqlErrorCtor
 * }} ErrorHash
 */

/**
 * @typedef {import('../../BaseInputValidator.js').RenchanGraphqlErrorCtor} RenchanGraphqlErrorCtor
 */

/**
 * @typedef {graphql.EmailInsertableVariablesInput} EmailInsertableVariablesInput
 */
```

## `BaseInputValidator` contract

The base (`app/validator/forResolver/BaseInputValidator.js`) provides the logic so subclasses only
declare rules:

- **Instance state:** `this.input` (the resolver input) and `this.errorHash` (the resolver's error
  constructors), supplied through the factory `create({ input, errorHash })`.
- **`generateValidationEntries()`** — abstract; the subclass returns
  `Array<[() => boolean, RenchanGraphqlErrorCtor]>`.
- **Run entrypoint** — iterates the entries and, for the first entry whose predicate returns `false`,
  raises that `ErrorCtor`. **Shown as `validate()`; the skill says to use whatever the actual base
  names it** — the name is not guaranteed.
- Generic JSDoc `@extends {BaseInputValidator<ErrorHash, InputType>}` documents the error hash and
  input shapes for that validator.

## Predicate conventions

- **One `isValidX()` per rule**, returning a boolean, reading `this.input`. Never throw inside a
  predicate — returning `false` is how a rule fails; the base turns that into the error.
- **Optional fields pass when absent:** destructure with a default and short-circuit —
  `const { keyword = null } = this.input; if (!keyword) { return true }` — then check the shape.
- **Value-shape checks go through an inspector** built by a small `create*ValueInspector({ value })`
  helper, never an inline `SomeInspector.create()` inside the predicate.
- **Compose shared validators, don't re-implement them.** Pagination (limit / offset / sort) is
  `PaginationInputValidator` (`NormalPaginationInputValidator.js`): create it with the input and the
  allowed sort columns (`VALID_SORT_COLUMNS`), then reference its `isValidLimit()` /
  `isValidOffset()` / `isValidSort()` from your entries. Same for any other cross-cutting validator.

**On ordering:** the skill states only that entry order decides *which* error is raised (first
failing predicate wins); its example lists the three pagination entries before the per-field ones. It
states **no required ordering of rule kinds**. full text:
`.claude/skills/hor-resolver-validator/references/validator-pattern.md#full-template`

## `@openreachtech/mentsu-value-inspector`

Three classes, each a named export of the package root; each subclass inherits its parents' methods,
so instantiate the most specific one you need:

```
ValueInspector            // presence checks
└── NumberValueInspector  // + number checks + normalizeValue()
    └── IntegerValueInspector  // + integer / safe-integer checks
```

**strict vs `*Like`** — every number/integer check comes in two flavors:

| Flavor | Reads | Accepts numeric strings | Example |
| :-- | :-- | :-- | :-- |
| **strict** | the raw value | No | `isNumber('3.14')` → `false` |
| **`*Like`** | the normalized value | Yes | `isNumberLike('3.14')` → `true` |

`*Like` normalizes first (number/string accepted): `'100'` → `100`, while `true` / `1000n` / `{}` /
`'abc'` / `null` / `undefined` → `null` and every `*Like` returns `false`. **`''` normalizes to `0`**
(so `isIntegerLike('')` → `true`). At the GraphQL/REST boundary prefer the string-tolerant (`*Like`)
checks, since inputs often arrive as strings.

| Class | Method | Reads | Meaning |
| :-- | :-- | :-- | :-- |
| `ValueInspector` | `isNull()` | raw | `value === null` |
| | `isUndefined()` | raw | `value === undefined` |
| | `isNullish()` | raw | `null` or `undefined` |
| | `isDefined()` | raw | not `undefined` |
| | `isPresent()` | raw | neither `null` nor `undefined` |
| `NumberValueInspector` | `isNumber()` / `isNumberLike()` | raw / norm | finite number |
| | `isPositiveNumber()` / `isPositiveNumberLike()` | raw / norm | finite `> 0` |
| | `isNegativeNumber()` / `isNegativeNumberLike()` | raw / norm | finite `< 0` |
| | `isZero()` | raw | `value === 0` (incl. `-0`) |
| | `isNaN()` / `isFinite()` / `isInfinite()` | raw | NaN / finite / ±Infinity |
| | `normalizeValue()` | — | normalized `number`, or `null` (lazy + memoized) |
| `IntegerValueInspector` | `isInteger()` / `isIntegerLike()` | raw / norm | integer |
| | `isSafeInteger()` / `isSafeIntegerLike()` | raw / norm | safe integer (`±(2^53 − 1)`) |

**There is no `isPositiveInteger` — compose it** on the same inspector:

```js
// "positive integer" (accepts '42')
inspector.isIntegerLike()
  && inspector.isPositiveNumberLike()

// for an id, also require it to be safe:
inspector.isSafeIntegerLike()
  && inspector.isPositiveNumberLike()
```

Recipes: **optional field** → return `true` early when absent, then check. **Required present** →
`inspector.isPresent()`. **Read the coerced number after validating** → `inspector.normalizeValue()`,
don't re-parse. **Guard empty string** for required numeric fields, since `''` normalizes to `0`.

Behavior cheat sheet:

| Input | `isNumber` | `isNumberLike` | `isInteger` | `isIntegerLike` | `isSafeIntegerLike` |
| :-- | :-: | :-: | :-: | :-: | :-: |
| `42` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `'42'` | ❌ | ✅ | ❌ | ✅ | ✅ |
| `3.14` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `'3.14'` | ❌ | ✅ | ❌ | ❌ | ❌ |
| `Infinity` / `NaN` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `9007199254740993` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `1000n` / `true` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `null` / `undefined` | ❌ | ❌ | ❌ | ❌ | ❌ |

## Error hash & resolver wiring

The resolver declares the codes and passes its `errorHash` into the validator:

```js
/** @override */
static get errorCodeHash () {
  return {
    ...super.errorCodeHash,

    InvalidKeyword: '400.C001.001',
    InvalidOriginObjectCategoryId: '400.C001.002',
    InvalidPaginationLimit: '400.C001.003',
    InvalidPaginationOffset: '400.C001.004',
    InvalidPaginationSort: '400.C001.005',
  }
}

/** @override */
async resolve ({
  variables: {
    input,
  },
  context,
}) {
  EmailInsertableVariablesInputValidator
    .create({
      input,
      errorHash: this.errorHash,
    })
    .validate()

  // ... input is now trusted ...
}
```

**The error names in the validator's `ErrorHash` typedef must match keys in the resolver's
`errorCodeHash`.**

## Testing

Predicates are pure booleans, so unit-test them (and `generateValidationEntries`) directly with the
`hoc-jest` skill — no resolver, no DB. Instantiate the validator with a **stub `errorHash` (`{}`)**,
assert each `isValidX()` over a `test.each` of inputs, and assert that invalid input raises the
matching `InvalidXxx` through the run entrypoint.

```js
const validator = EmailInsertableVariablesInputValidator.create({
  input,
  errorHash: {},
})

expect(validator.isValidOriginObjectCategoryId()).toBe(expected)
```

Case values the skill's example exercises for a positive-integer id: `1` → true, `'1'` → true,
`0` → false, `-1` → false, `'abc'` → false.

## What is tied to GraphQL, what is not

**Tied to the GraphQL surface — the skill gives no REST answer; it is silent.**

| Convention | What the skill ties it to |
| :-- | :-- |
| Path `app/validator/forResolver/<endpoint>/{queries,mutations}/` | `<endpoint>` = the GraphQL endpoint (`user`/`customer`/`admin`); `<operation-kind>` = `queries`/`mutations`. No path is stated for a non-resolver caller. |
| Class name `<Operation>InputValidator` | "matching the resolver's `schema`" — the GraphQL field name. The `*InputValidator` suffix itself is stated only for this case. |
| Where the failing predicate's error comes from | `this.errorHash`, injected from the resolver's `static get errorCodeHash ()`; codes shaped `'400.C001.001'`. No other producer of an error hash is described. |
| The error constructor type | `RenchanGraphqlErrorCtor`, imported from `BaseInputValidator.js`; the entry tuple and `@extends` generic are typed with it. |
| The run site | inside `resolve ({ variables: { input }, context })`. |
| The input typedef | `graphql.<Operation>Input`. |

**Surface-independent — carries to a REST request unchanged.**

- The `BaseInputValidator` subclass shape: one required override, `generateValidationEntries()`.
- The validation-entry list: `Array<[() => boolean, ErrorCtor]>`, first failing predicate raises.
- Base-supplied state `this.input` / `this.errorHash` via `create({ input, errorHash })`, and a run
  entrypoint that iterates the entries (name shown as `validate()`, to be matched to the real base).
- Per-field predicate methods: one `isValidX()` per rule, boolean, reads `this.input`, never throws;
  the optional-field early-`return true` idiom.
- Delegating value checks to `@openreachtech/mentsu-value-inspector` through
  `create*ValueInspector({ value })` helpers — including the whole strict-vs-`*Like` table, the
  composed positive-integer, and the `''` → `0` trap. The reference itself says `*Like` is what you
  want "at the GraphQL/REST boundary", so this half is explicitly stated to span both.
- Composing shared validators (`PaginationInputValidator` + `VALID_SORT_COLUMNS`) instead of
  re-implementing limit/offset/sort.
- Testing predicates as pure functions with a stub `errorHash`.

**Open on the REST surface (the skill says nothing):** where a REST validator file lives, what it is
named, what supplies its `errorHash` when there is no resolver `errorCodeHash`, whether a
non-GraphQL error constructor is acceptable in an entry, and how the raised error becomes an HTTP
response. full text: `.claude/skills/hor-resolver-validator/SKILL.md#error-hash--resolver-wiring`

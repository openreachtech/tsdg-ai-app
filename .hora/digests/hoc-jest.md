# hoc-jest
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-jest/ -->

**Read the source above whenever this leaves a question open.**

## Core principles

- **Use `test()` / `test.each()`, never `it()` / `it.each()`** (`it()` is easy to misread as `if()`; `jest/consistent-test-it` errors).
- Notation convention of the skill: writing `describe()` / `test()` / `expect()` **implies the `.each()` variant too**.
- **QA stance — do not cut coverage using implementation knowledge.** A test must notice even if the implementation is wrong. Judging "this will always be this value" or "this member is obvious" from reading the implementation, and then **omitting cases or members, or collapsing them into a single `test()`, is a QA mistake**. What a test guarantees is the member's **contract (externally observable behavior) as a black box**.
  - When trimming a member, branch, or variable element, the justification must be "this input/state **cannot exist** under the contract," never "because I know the implementation." When in doubt, err on the side of coverage.
  - Members that appear public (including a static memoization pool) are part of the contract.
- **Run the test against the unchanged code first.** A test written for a change is run against the code as it stands **before** the change, and it has to fail there. Cases that pass against the unchanged code are the ones covering behaviour the change does not touch — correct, not a defect.
- **No logic in test files.** A test consists **only of assertions** (`expect()`) checking simple input and output values. Only things **already tested elsewhere** (already-tested classes, factory methods, literal data, tested helpers) may be used inside a test.
- **Write comments in the test code in English** (`// same reference`, `// neutral value; not under test`, …).
- **Removing a member takes two commits, implementation first** — the implementation goes out first, the tests that covered it second. The red between the two is the evidence that the tests removed were the tests covering what was removed.

## describe structure — level 1 = class, level 2 = member

Nesting is fixed: `describe(class) > describe(member) > describe(behavior) > test()`.

- **Level 1 = class name, level 2 = member name.** Never write behavior (`should ...` / `when ...`) at level 1 or 2; behavior goes at **level 3 or deeper**.
- **Repeat the class-name `describe()` per member — one member per class describe.** Do not bundle multiple members into one class describe (a syntactic sticky header; `jest/no-identical-title` is off so this passes lint).
- Behavior-layer describe is named **`should [verb]`** (`should keep property` / `should call constructor`). **Do not use `to [verb]`.** When the behavior depends on a **precondition**, insert `describe('when [precondition]')` and express the behavior with `test('should [verb]')` inside it.
- Do not end a `describe()` / `test()` title with `.` (`jest/valid-title`).

```js
describe('PathnameBuilder', () => {
  describe('constructor', () => { /* ... */ })
})

describe('PathnameBuilder', () => {
  describe('.create()', () => { /* ... */ })
})

describe('PathnameBuilder', () => {
  describe('#buildPathname()', () => { /* ... */ })
})
```

### Member notation in the level-2 describe title

| notation | member |
| :-- | :-- |
| `#instanceProperty` | instance property |
| `#instanceMethod()` | instance method |
| `#get:instanceGetter` | instance getter |
| `#set:instanceSetter` | instance setter |
| `.staticProperty` | static property |
| `.staticMethod()` | static method |
| `.get:staticGetter` | static getter |
| `.set:staticSetter` | static setter |

`#` = instance, `.` = static. When referring to a member **in the prose** of a behavior-layer `describe()` / `test()`, follow the same format — **append `()` for methods** (`should call JSON.stringify() with value and replacer`, not `JSON.stringify`).

### Inheritance describe goes first

If the class under test `extends` another class, place `describe('inheritance')` as the **first** class-name describe, before the member describes. No `cases` / `test.each()` — one `test()`. Import the base class too.

```js
describe('BasicAuthorizationBuilder', () => {
  describe('inheritance', () => {
    test('should be correct class', () => {
      const received = BasicAuthorizationBuilder.prototype

      expect(received)
        .toBeInstanceOf(BaseAuthorizationBuilder)
    })
  })
})
```

### When a single `test()` is allowed instead of `test.each()`

| Situation | Form |
| :-- | :-- |
| Abstract member that throws when not overridden | `describe(member) > describe('when not inherited') > test('should throw error')` |
| Static getter / static property holding a **fixed value** | `describe(member) > describe('when called as is') > test('should be fixed value')` |
| Inheritance | `describe('inheritance') > test()` |
| Default-value filling when a factory is called with **no arguments** and there is exactly **one** omittable argument | `test('with no arguments')` |

Everything else uses `test.each()`:

- **Instance getters require `test.each()`** — the variable element is **which instance it is**. `get Ctor () { return this.constructor }` collapsed to one `test()` would pass even for a hardcoded `return BoundCtorRegistry`. Put the base class and several derived classes into `cases`.
- **Methods that take arguments require `test.each()` with ≥ 2 inputs** — the variable element is the argument. One input would pass against an implementation that ignores the argument. This holds **inside** a `describe('when ...')` branch split too.
- If an argument is a **neutral collaborator uninvolved in the behavior**, drive the axis that *is* involved and fix the neutral one.

```js
// Abstract member, message varies by derived class → cases
describe('BaseAuthorizationBuilder', () => {
  describe('.get:schema', () => {
    describe('when not inherited', () => {
      test('should throw error', () => {
        expect(() => BaseAuthorizationBuilder.schema)
          .toThrow('BaseAuthorizationBuilder.get:schema must be inherited')
      })
    })
  })
})
```

If the fixed value is an **object** (`WeakMap` / `Map` / `Set` — unique reference), pin it **by type**: name the test for the type (`should be a WeakMap`) and assert `toBeInstanceOf(<type>)`, not `toBe()`.

### Behavior-layer splits

| Situation | Split |
| :-- | :-- |
| Valid (normal) and invalid (abnormal) argument values mixed | `describe('with valid values')` / `describe('with invalid values')` — never mixed in one `cases` |
| Boolean return | `describe('should be truthy')` / `describe('should be falsy')`, **omit `expected`**, assert `toBeTruthy()` / `toBeFalsy()` |
| Recursive / nested structure | dedicated `describe('with nested ...')` — at least two levels deep, `expected` nested too |
| Two arguments where one is a mode/flag conditioning the other | `describe('with <arg>: <value>')`, mode **omitted from `cases`** and written directly into `args` |
| Boolean argument or property | `describe('when #isEnabled:false')` / `describe('when #isEnabled:true')`; `#` prefix only when it is an instance property; value written into `args`, not `cases` |
| A member that **may** depend on a property | split by that property axis anyway — verifying both modes give the same result is what guarantees **independence** |
| Memoization / same-reference return | `describe('should be memoized')` |
| Call-count patterns | one describe per count: `when called once` / `when called twice` / `when not called` |

Layer order when two of these coexist: valid/invalid **outside**, the boolean/mode describe **inside**.

For a case representing a **missing property**, leave the property **commented out** rather than silently absent:

```js
{
  valueHash: {
    postId: 10,
    // commentId: 20,
  },
  expected: '/posts/10/comments/',
}
```

### Fixture placement

- A fixture shared by **multiple behavior describes** under the same member is defined **once, directly under the member (level-2) describe**. A fixture used by one behavior stays inside that behavior's describe.
- **Never define shared variables at file scope** (outside all describes). Only **imports** may live at file scope. DRY does not apply to test code — redefine the value, class, or function inside each `describe()` that uses it.
- When one behavior **audits another's `cases`** (counts it, checks completeness), it must be **the same array**, declared once where both can reach it — otherwise the audit checks a copy of itself.

## AAA — Arrange / Act / Assert

Three phases, in order, **separated by one blank line each**.

```js
test.each(cases)('...', ({ input, expected }) => {
  const builder = SomeClass.create(input) // Arrange

  const received = builder.someMethod(input) // Act

  expect(received) // Assert
    .toBe(expected)
})
```

- **Act's return value is named `received`, not `actual`.**
- **Pass a variable to `expect()`, never an expression.** To assert a **property** of the return value, receive the return value in a descriptively named variable (PascalCase for a class), then `const received = <Var>.<prop>`. No blank line between those two lines; the blank line goes after them.
- **Assemble method arguments in Arrange as `const args = { ... }`** and pass the variable in Act. Assembling the object inline in the call is noise in Act. Passing an already-existing variable as-is (`method(input)`) is fine.
- If `args` is **case-invariant** (buildable from fixed fixtures, not from `input` / `expected`), define it **once outside `test.each()`**, not rebuilt per case.
- **Blank lines only separate the three phases.** Do not blank-line the interior of one phase — "build the argument object" and "create the instance" are both Arrange and stay adjacent.
  - Exception: **groups of statements with different concerns** within Arrange may be separated — e.g. "create the subject" then, after a blank line, "define `args` + `jest.spyOn(args, key)`" (those two being tightly coupled, they stay together).

### Only `expected` and `tally` may be passed to the matcher

`input` (or `override`) drove the call in Arrange and **must not be passed to the matcher** — the value passed in and the value expected stay separate in the code too.

- Matcher taking **multiple arguments** → make `expected` an **array of the arguments** and spread it: `toHaveBeenCalledWith(...expected)`.
- Multiple calls → `expected` is an array of per-call argument arrays; take calls out by **destructuring** (`const [firstCall, secondCall] = expected`), never `expected[0]`, and spread each into `toHaveBeenNthCalledWith(n, ...)`.

### Expected-value literals in a single `test()`

| Expected-value literal | How |
| :-- | :-- |
| **Single-line** (`'...'`, number, boolean, `{ id: 100001 }`, `[Alpha, Beta]`) | Write **directly in the matcher** |
| **Multi-line** (multi-key object, nested, array of objects) | **Bind to `const expected`**, matcher line stays `.toEqual(expected)` |

The bound `const expected` belongs to Arrange, so a blank line separates it from Act. In `test.each()` this distinction does not arise — `expected` is always destructured from `cases`.

### `// same reference`

A `toBe()` passed an **object** (function, instance, array) to verify identity carries a trailing `// same reference` comment. Primitive equality (`toBe('Basic')`) carries no comment.

## `test.each` titles

The title interpolates a value that identifies the **input**.

- Interpolate a readable identifying property, dotted as deep as needed: `'scheme: $input.scheme'`, `'BaseCtor: $input.BaseCtor.name'`, `'value: $input.value'`.
- **Even for opaque values** (`WeakMap` / `Map` / `Set` / instances that print as `WeakMap {}`), first look for a meaningfully different attribute and display it as `$input.<field>.<prop>`.
- **`$#` (Jest's row index) is a last resort** — only when the value has no readable identifier at all (e.g. two empty `WeakMap`s). Do **not fabricate** a readable index (`{ id: 1 }`) and distort the declared type to get one.
- In the double loop, the inner `test.each()` titles off the inner case's own field (`'beta: $beta'`, `'credential: $credential'`).
- For the 2ⁿ − 1 default-filling cases, `input` is sparse, so title by **each value in `expected`**.

## The case object

Each behavior defines `const cases = [ ... ]` and runs `test.each(cases)`.

- Every element of `cases` is **an object** — never a bare primitive.
- **Only these four top-level properties.** Do not invent names like `params` / `args`.

| property | purpose |
| :-- | :-- |
| `override` | The stub implementation supplied for an **abstract** member when testing an abstract class. Not used for concrete classes. |
| `input` | The argument(s) passed to the subject under test (constructor / method). |
| `tally` | A value that serves as **both** `input` and `expected` — the same value passed in and asserted. |
| `expected` | The expected return value / property value. |

Plus, **for the outer `cases` of a double loop only**, a prefixed inner cases property (`~Cases`).

- `cases` (and inner `~Cases`) should hold **2 or more** elements; one only with a specific reason (e.g. only one case can be truthy).
- Unnecessary properties may be omitted — not all four are mandatory.

### `tally` — the mechanical check

`tally` must **appear in both** Act (passed to the subject) and Assert (passed to a matcher): `member(tally)` … `expect(...).toXxx(tally)`. Appearing in only one is misuse.

- Only in Assert → it is expected-value-only → use `expected`.
- Only in Act → use `input`.
- If the passed value is an object and the expected value is a scalar nested inside it (or vice versa), they are **different things** — split into `input` / `expected`. Wrapping a member before passing (`new SomeClass({ replacer: tally.replacer })`) is not "as-is."
- If the member **transforms, infers, or renames** the input to produce the expected value, do not use `tally` even where the value happens to match. If **one** case in the array undergoes a real transformation, treat the whole array as `input` / `expected`.
- `tally` may have multiple named members (`tally.alpha`, `tally.beta`) when each is passed and asserted **wholesale**.

### Case data values

- Primitive values are **unique across elements** unless there is a reason — duplicated values let a test pass by coincidence when the implementation returns a different input's value.
- Numeric ids: **at least 6 digits**, `100001`, `100002`, … so the trailing index digit is readable in Jest's log. Never `id: 1`.
- Strings: **base + index suffix** with `-`: `'source-0001'`, `'source-0002'`. Keep the base consistent across elements; do not switch base per element, do not use another separator, and do not break the format to look domain-plausible.
- When `expected` is **opaque and derived** (Base64, hash, signature), the **`input` side** carries the index; `expected` is the raw derived result.
- **A run of words** (tokens joined by a delimiter) uses `alpha`, `beta`, `gamma`, … `omega` **mechanically in order across the whole `cases`**. A single representative token is `omega` — never `foo` / `bar`.
- A string **carrying specific meaning** shows its intent either by being descriptive (`'not-a-constructor'`, `'unparseable-date'`) or by an **English inline comment**.
- **Derived values and magic constants are written as literals** with the derivation as a `// <expression>` comment (`'9007199254740993', // Number.MAX_SAFE_INTEGER + 2`). Never compute inline.
- **Finite and small value sets (roughly ≤ 100, "can a human memorize it") are enumerated in full** — regex-escape characters, enums, boolean combinations, weekdays, HTTP methods. Infinite sets are sampled.
- **Include a value that exercises an internal transformation** (escape / normalize / trim / encode). Cases filled with no-op values would pass with the transformation removed. The **terminal method** implementing the transformation gets all cases; the **caller** samples at least one transforming and one no-op value.
- **Integer features always test near `Number.MAX_SAFE_INTEGER`** — the boundary itself on the **valid** side, `Number.MAX_SAFE_INTEGER + 1` on the **invalid** side. Write the expression, not the literal.
- **Variable-count elements cover the count boundaries down to 3, 2, 1, 0**, laid out **symmetrically within the grid of the existing axis** — never carved into their own independent describe.
- **Never fill `cases` with edge cases only** — include the typical input the member most commonly receives.
- **List normal values first**; `null` / `undefined` / empty arrays later. (Type-violating irregular values go to the valid/invalid describe split instead.)
- **Sample callback functions carry no branches** (`if` / ternary) — keep them a simple transformation.

### Formatting a case object

**At most one property key per line.**

- Structural containers (the object value of `input` / `tally` / `override`) are **always broken onto new lines**. Never `input: { replacer: X }`.
- Leaf payload objects (`value` / `valueHash`) may be inline **with a single key** (`valueHash: { id: 100001 }`); expand with multiple keys.
- Array elements each go on their own line; a single-key element may be inline.
- **Exception — a flat, long enumeration** (no container, the same two or three scalar fields on every element) writes **one element per line**, as a table. Reserved property names still apply; `input` is then a scalar.

## Matchers

**Forbidden:**

- **`expect.anything()`** — matches anything non-null; the assertion effectively does nothing.
- **`expect.any(Object)`** — nearly everything in JS is an Object; it constrains nothing.
- **Alias matchers** — `toBeCalled` / `toThrowError` etc. Use `toHaveBeenCalled` / `toThrow` (`jest/no-alias-methods`).
- **Comparisons built as expressions** — `expect(a === b).toBe(true)` → `expect(a).toBe(b)`; `expect(a > b).toBe(true)` → `expect(a).toBeGreaterThan(b)`.
- **`expect(arr.length).toBe(n)`** — use `toHaveLength()`.
- **Bare `toThrow()`** — a message argument is required (`jest/require-to-throw-message`).
- **Snapshots**, in principle — this skill pins concrete values.
- `test.skip` / `test.only` / `xtest` / `ftest` / `xdescribe` / `fdescribe`; commented-out tests; jasmine globals (`spyOn` / `fail` / `jasmine.*`); `__mocks__` imports.

**Required / preferred:**

- **`toBe()` for primitive equality**; `toContain()` for containment; `toHaveLength()` for length.
- **`toHaveProperty()`, not `toBe()`, for a constructor's retained property.**
- **`toBeInstanceOf(<concrete type>)`** to pin a type, in place of `expect.any(Object)`.
- **`toBeTruthy()` / `toBeFalsy()`** for boolean returns, with `expected` omitted from the cases.
- **`toBe(expected) // same reference`** for a memoized/identity return.
- **`toHaveBeenCalledWith(...)`** — pin arguments; do not settle for `toHaveBeenCalled()` (`jest/prefer-called-with`).
- **`toHaveBeenCalledTimes(n)` only alongside argument verification** — line up `toHaveBeenNthCalledWith(1, ...)` … `(n, ...)` pinning every call's arguments.
- **`expect.any(<concrete type>)` is allowed** where a concrete type is exactly the discrimination and `toBeInstanceOf()` cannot reach (nested inside `toHaveProperty()`). It must **not stand as the whole assertion** — the concrete value is pinned by the assertion beside it.
  - The one exception: **a value produced at the moment of the call** (a clock read, a random draw) has no concrete value to pin beside it, so `expect.any(Date)` there stands as the whole assertion and is not a loosening.
- **`expect.each()`** from `@openreachtech/jest-expect-each` for iteration, in place of `forEach` (`expect.each().toXxx()` / `expect.each().toXxx.each()`).
- Each `test()` holds at least one `expect()`; `expect()` only inside `test()`; never wrapped in a custom helper.
- `toEqual()` is fine — `toStrictEqual()` is not forced (`jest/prefer-strict-equal` off).

## Asserting a throw

Wrap the call in an arrow and pass a **message argument**:

```js
expect(() => BaseAuthorizationBuilder.schema)
  .toThrow('BaseAuthorizationBuilder.get:schema must be inherited')
```

- For an abstract **instance** method, instantiate first, filling the irrelevant constructor arguments with **neutral values** carrying an English comment, then `expect(() => stringifier.stringifyBody(args)).toThrow(expected)`.
- If the message **varies by derived class** (`` `${this.name}...` ``), turn the classes into `cases` and drive them with `test.each()`.
- Throw cases need no `expected` in `cases` when the message is written inline.

> Thin: the skill states the throw form for synchronous calls only. It prescribes `async` / `await` over a `done` callback but does **not** give an explicit `rejects.toThrow()` shape for an async member. full text: `.claude/skills/hoc-jest/references/eslint-jest-rules.md` and `references/structure.md#for-throws-on-abstract-members-insert-when-not-inherited`.

## Mocks and spies

- **Override with `jest.spyOn()` instead of defining a derived class.**
  - Getter: `jest.spyOn(TargetClass, '<name>', 'get').mockReturnValue(...)`.
  - Method: `jest.spyOn(TargetClass, '<method>').mockReturnValue(...)` (`.mockImplementation(...)` when the return must vary by argument).
  - Keep the substituted value in the case's **`override`** property.
  - Run and verify **the subject class itself**, not a derived class.
  - Mocks restore automatically via `afterEach(() => jest.restoreAllMocks())` in `setup-after-env.js` — no manual restoration.
- **Do not write `jest.fn()` directly inline inside `test()`.** It amounts to hand-writing an unverified stub implementation, it is not restored automatically, and it is not tied to a real seam. `jest.spyOn()` **calls through to the real implementation** by default.
- **A function passed as an argument** (callback / handler / deriver) is verified by defining `args` with a **real function** and spying on the property:

```js
const args = {
  /**
   * @param {{ Ctor: new () => * }} params
   * @returns {new () => *}
   */
  deriver: ({ Ctor }) => class extends Ctor {},
}
const deriverSpy = jest.spyOn(args, 'deriver')

registry.declareBoundCtor(args)

expect(deriverSpy)
  .toHaveBeenCalledWith(expected)
```

- **A getter that returns a function**: spy on **the real function it returns** (`jest.spyOn(globalThis, 'btoa')`), not the getter — spying the getter fails to type-check (`TS2345` / `TS2339`, the `'get'` overload collapsing to `never`).
- **Mock promises** with `mockResolvedValue()` / `mockRejectedValue()`, not `mockImplementation(() => Promise.resolve())`.
- **Naming**: any variable holding a `jest.fn()` takes a **`~Spy` suffix** without exception (`btoaSpy`, `deriverSpy`); a constant takes `_SPY` (`BTOA_SPY`). `constructorSpy.spyOn()` returns a **class**, so it stays `SpyClass`; its function spy is `SpyClass.__spy__`, and binding that to a variable takes `~Spy`.

### When a derived class may be defined

- When the substitution extends beyond a member to the **structure of the `class` itself**.
- When a single `describe()`'s `cases` requires **multiple derived classes simultaneously** (instance-getter cases, `when not inherited` message-by-class cases). Hold them in the `cases` elements.
- **The one place `jest.fn()` is allowed**: when the real function has no independently spyable location (the getter generates a new function each time, or returns an unreachable closure) — define a derived class inside `test.each()`, override the getter, and plant a `jest.fn()` there.

## Constructor tests

`describe(class) > describe('constructor') > describe('should keep property') > describe('#<property>') > test.each()`.

- One `describe('#<propertyName>')` **per retained property** (`#alpha`, `#beta`, …).
- Assert with **`toHaveProperty()`**, not `toBe()`.

```js
test.each(cases)('alpha: $input.alpha', ({ input, expected }) => {
  const instance = new SomeClass(input)

  expect(instance)
    .toHaveProperty('alpha', expected)
})
```

- **Isolate the property under test** — only that property goes into each case's `input`; other required constructor arguments are filled with a **neutral value** in the test body, carrying an English comment (`credential: '', // Fill the unrelated required argument with a neutral value`).
- **If nothing is added or removed, pass `input` as-is** — do not build an `args` that just copies `input` 1:1.

## Factory method tests

For `.create()`, test **only**:

1. That it returns an instance of its own class — `toBeInstanceOf(TargetClass)`, describe named `should be an instance of own class`.
2. That it **delegates to the constructor** — describe named `should call constructor`:

```js
const SpyClass = constructorSpy.spyOn(TargetClass)

SpyClass.create(input)

expect(SpyClass.__spy__)
  .toHaveBeenCalledWith(expected)
```

**Do not test property retention here** — that is the constructor's responsibility and is already covered.

### Default values on omitted arguments

Verified by **the default value reaching the constructor**, via `constructorSpy` — never by reading the returned instance's properties.

- **One** omittable argument → `describe('should fill default <name>')` with a single `test('with no arguments')`, calling `SpyClass.create()`.
- **Two or more** omittable arguments → `describe('should fill default value')` (named after default-filling as a whole, not after one argument) enumerating **every combination in which at least one is omitted**: **2ⁿ − 1** cases. The all-specified case fills no defaults and is excluded (covered by `should call constructor`).
  - Put **only the specified arguments** into `input`; **comment out** the omitted ones with `// <name>: omitted → default <value>`.
  - `expected` is the **complete shape** reaching the constructor.
  - Give specified arguments values **different from the default**. Values inevitably repeat across combinations — the uniqueness convention does not apply here, because what identifies a case is the **combination**.
  - Order: **more specified first**, the all-omitted (`input: {}`) case **last**.

## Single loop vs double loop

- **Single loop** when there is no combination between constructor properties and method arguments — gather the required arguments into one `input`.
- **Double loop** — `describe.each()` (outer = constructor property, or one property) × `test.each()` (inner = method argument, or the other property) — is the **default** whenever **both** axes are involved in the output. Lay out **at least 2 × 2**. A single loop pairing one property value with one argument value fails to show each axis independently affects the behavior.
  - The only exception is an axis that is **a neutral collaborator not under test** — and it may be fixed only when **the contract guarantees** it does not affect the behavior, never because reading the implementation suggests so.
  - Inner cases variable: prefixed `~Cases` (`betaCases`, `credentialCases`, `valueHashCases`), named for the inner target.
  - `override` / `input` / `tally` go on the **outer** element. `expected` goes on the **inner** side when it varies per inner argument, on the **outer** side when it is constant per outer property. The only reserved property allowed in the inner `~Cases` is `expected`.

Inside a `describe.each()` callback, before `test.each()` may go: variables buildable **without the inner values** (e.g. the instance built from the outer `input`), separated from `test.each()` by a **blank line**; and the inner `~Cases` itself when it is **identical across every outer case**. This applies equally to a plain `test.each()` — anything not depending on the per-case value is defined once outside the callback.

### Splitting `args` when `input` mixes destinations

If one `input` holds **both a constructor property and a method argument**, splitting is **mandatory** — name each build by **destination member + `Args`**: `constructorArgs`, `buildPathnameArgs`. Never role-based names like `propertyArgs` / `methodArgs`. With only **one** build, the name is plain `args`.

```js
const constructorArgs = {
  templatePathname: input.templatePathname,
}
const buildPathnameArgs = {
  valueHash: input.valueHash,
}

const builder = new PathnameBuilder(constructorArgs)

const received = builder.buildPathname(buildPathnameArgs)
```

## Prohibited syntax inside a test file

- `if` statements, the ternary operator (`? :`), `??`, short-circuit `||` / `&&`.
- **Higher-order functions** — `Array#map()` / `filter()` / `reduce()` — and `Array#forEach()`. Iterate with `.each` (`test.each()` / `describe.each()` / `expect.each()`).
- **Helper function definitions inside a test file** — untested logic, and a violation of file responsibility (a test file's responsibility is the one class it is named for). If a helper is truly needed, define it under `tests/tools/` and write its own test.
- `return` from a `test()`; `export` from a test file; a `done` callback (use `async` / `await`).

**Not logic**: referencing a variable already defined within `describe()` to construct a new object (assembling `args` or a `cases` element from a fixture).

Hooks are only `beforeAll` / `beforeEach` / `afterAll` / `afterEach`, ordered before→after, no duplicates, at the top of the `describe()`. Under `tests/**/*.js` the `no-undefined`, `max-classes-per-file` and no-static-class rules are **off** — test code may write `undefined` literally and define several classes per file.

## Directory and imports

Tests are **not** co-located; they live in a dedicated `tests/` tree.

- `tests/__tests__/**` mirrors the source tree with the source root (`lib/`) **stripped**: `lib/tools/PathnameBuilder.js` → `tests/__tests__/tools/PathnameBuilder.js`. Never `tests/__tests__/lib/...`.
- **One source file, one test file** — every member of the class in that one file.
- A **data file** mirrors its path with the varying segment collapsed: `lib/i18n/locales/*/message.json` → `tests/__tests__/i18n/locales/message.js`.
- **Helpers**: `tests/tools/makeSample.js` ↔ `tests/__tests__/tests/tools/makeSample.js` — the path carried across **whole**, `tests/` included (only `lib/` is stripped, because it *is* the source root's name).
- **Import the subject with a relative path**, never an alias (`~`).
- **Import order**: the **subject under test first**, then a **blank line**, then base classes and collaborators.

> The mirroring base is stated as `lib/` (this skill ships for npm-package repos). In a repo whose source root is named otherwise, the rule is "strip the source root's own name"; confirm against the repo's existing `tests/` tree. full text: `.claude/skills/hoc-jest/references/directory.md#directory-structure`.

## When the subject is not a class

The index rule holds; only what is indexed changes.

| subject | level 1 | level 2 | level 3 |
| :-- | :-- | :-- | :-- |
| module whose default export is a class, function, declared `const`, or an import binding still under its source's name | that definition's name | the export's kind | the exported name |
| module whose default export has no name of its own | a name for what the file is about | the export's kind | the exported name |
| data file, a part asserted | the file's path | the part's key path | — |
| data file, the whole asserted | the file's path | the reading (a bare noun phrase) | — |
| reconciliation of two collections | the relation | a collection | — |

- The export's kind is `default export` or `named export`, written out. A `default export` **stops at level 2** — no name below it. A named export puts its name at level 3 as **`as <name>`**, as the source writes it.
- The data-file and reconciliation rows carry **no `#` or `.`** by design — the absence is what distinguishes a reading of a file from a definition. Do not borrow `.` for a reading.
- The describe is repeated per export / per reading, as the class describe is per member.
- A **reconciliation** is the one shape where the index rule cannot hold, because neither side is the subject. Close the chain end to end: each case's own fields against each other; each case against the declaration; the **unique** case count against the declaration count (never `cases.length`, which a duplicate row satisfies); the declaration total against the catalogue. Reconcile totals **by summing the parts, never by merging them** (a merge collapses a key declared twice). Verify **both directions**. For an **empty** collection, leave the describe out — `test.each([])` throws.

> Compressed: this section is a long worked example in the source. full text: `.claude/skills/hoc-jest/references/structure.md#when-the-subject-is-not-a-class`.

## Types on `cases`

- Attach `@type` **only when needed** to resolve or suppress a type error. Normal-value cases whose type is correctly inferred from the literal need none.
- **Abnormal-value series** (deliberately type-violating `null` / `undefined` / missing keys) take the `@type` declaration **plus** the value cast `/** @type {Array<*>} */ ([ ... ])`.
- **Normal values with a dynamic-key argument type** (`Record<string, *>`) take the `@type` **declaration only** — no `Array<*>` value cast.
- Once a `@type` declaration is attached, **type every field precisely** — no `expected: *`. Derive the type from an existing value (`typeof SomeClass`, `(typeof ScalarHash)[keyof typeof ScalarHash]`).
- **For normal values, don't cast — prepare a real value matching the declared type** (`new WeakMap()`, not `/** @type {*} */ ({ id: 100001 })`).
- Write any as **`*`**, not `any`.
- A **dynamic key taken from `cases`** is resolved on the **cases side** (`name: keyof typeof ScalarHash`), keeping the access site cast-free — not with a value-position cast and not with a type-resolution-only intermediate variable.
- A function's implicit-any argument is typed with **`@param`**, which then makes **`@returns` mandatory** and forces a **multi-line** block.
- The type of an assigned value goes as `/** @type {...} */` **on the line above** the statement; a temporary `/** @type {*} */` cast, when needed, goes on the value side.
- A clean `eslint` run is **not** proof of type resolution — confirm with `npx tsc -p jsconfig.json --noEmit` where available.

> Compressed: the source carries more worked examples of each type-resolution case. full text: `.claude/skills/hoc-jest/references/types.md`.

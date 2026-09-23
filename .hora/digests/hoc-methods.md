# hoc-methods
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-methods/ -->

**Read the source above whenever this leaves a question open.**

Conventions for class method definitions: named arguments, passing properties into private methods, factory methods. Source is `SKILL.md` (196 lines) plus `references/instantiation.md`, `references/factory-class.md`, `references/create-async.md`.

## Factory methods must be defined without exception

- **Class definitions must define a factory method without exception.** Unless a class is inheriting, every class definition must define `static create (...)`. (When inheriting, the parent class's `create` is inherited, so it doesn't need to be redefined.)
- The parameters of `static create (...)` should define what is needed to construct the arguments passed to the constructor.
- Factory methods should, unless there is a specific reason not to, be implemented as **static methods**.

### Division of responsibility between the constructor and `static create (...)`

- The constructor should receive required arguments (e.g. `{ characters }`). It should not have default values.
- **Applying default values for arguments is the responsibility of `static create (...)`.**

### Placement order

- `static create (...)` immediately after the constructor.
- `static createAsync (...)`, if defined, in principle immediately after `.create(...)`.

### Variations

- When variations of `.create(...)` / `.createAsync(...)` are needed, distinguish them with a suffix (e.g. `.createAsAlpha()` / `.createWithBeta()`).

### Instantiation — `new this(...)`, never the class name

- Within `.create(...)`, do not call `new` using the class name. Instantiate with `new this(...)`, so a call from an inheriting subclass creates an instance of that subclass.
- Since every defined class always has a factory method, whenever depending on another class, always instantiate it via its factory method (`.create(...)`). Consequently `new Sample(...)` against a defined class never appears outside test files — the only exception being `new this(...)` inside `.create(...)`.

```javascript
// NG
static create (...) {
  return new RandomTextGenerator({ characters })
}

// OK
static create (...) {
  return new this({ characters })
}
```

### JSDoc format — without exception, and the smallest complete `create()`

Replace `ThisClass` with the class being defined. `@public` because the factory method is an entry point called from outside.

```javascript
/**
 * Factory method.
 *
 * @template {X extends typeof RandomTextGenerator ? X : never} T, X
 * @param {{
 *   characters?: string
 * }} [params] - Parameters for the factory method.
 * @returns {InstanceType<T>} Instance of this class.
 * @this {T}
 * @public
 */
static create ({
  characters = this.DEFAULT_CHARACTERS,
} = {}) {
  return /** @type {InstanceType<T>} */ (
    new this({
      characters,
    })
  )
}
```

The generic `@param` line reads `@param {...} [params] - Parameters for the factory method.`

### Instantiation of a dependency class goes through a factory method

- Do not directly create a dependency class in a default argument of `.create(...)`, etc. — neither `new Dependency(...)` nor `Dependency.create(...)`. Extract into a dedicated factory method and go through it.
- The dedicated method's name is basically "`create` + class name" (`ExternalApiClient` → `createExternalApiClient`).

```javascript
// NG
static create ({
  externalApiClient = ExternalApiClient.create({ env }),
} = {}) {
  // ...
}

// OK
static create ({
  externalApiClient = this.createExternalApiClient(),
} = {}) {
  // ...
}
```

This is lightweight DI: production = real dependency / test = swap via argument or `jest.spyOn(ThisClass, 'createExternalApiClient')` / hotfix = override in a subclass.

## `.createAsync(...)` — when arguments must be generated asynchronously

- When the arguments passed to the constructor need to be generated via asynchronous processing, define `static createAsync (...)`.
- Its JSDoc conforms to `.create(...)`'s, with the return becoming `Promise<InstanceType<T>>`.
- **Calling `new this(...)` directly from `.createAsync(...)` is prohibited.** In principle `.createAsync(...)` returns the return value of `.create(...)`.

```javascript
// OK
static async createAsync () {
  const characters = await this.resolveCharacters()

  return this.create({
    characters,
  })
}
```

## When a direct `new` is allowed (`references/instantiation.md`)

| case | rule |
| :-- | :-- |
| JavaScript built-in classes (`Date` / `WeakMap` / `Set` / `RegExp` / `Error`, …) | free direct `new`; no factory method needed |
| `Map` | **entirely prohibited** — not even a direct `new`. Use `WeakMap` when association is needed |
| Third-party module behaving as a **DTO** (whitelist: `BigNumber` from bignumber.js) | free direct `new` — **but only if the module provides no factory method** (`Model.build()` / `Sample.create()`); if one is provided, use it |
| Hard to tell whether DTO-like | **define a factory method instead of asking a human** |
| **Delegate-style functional class** (held in a property, used by delegating) — third-party *or* application-defined | factory method required, **even when created on the fly inside an instance method** |
| Same class instantiated frequently across multiple classes | introduce an `XxxxFactory` class |

```javascript
// NG: delegate-style class newed on the fly, even temporarily
sendRequest () {
  const client = new ExternalApiClient({ env })

  return client.send()
}

// OK
sendRequest () {
  const client = this.createExternalApiClient()

  return client.send()
}
```

## `XxxxFactory` class (thin here — full text: references/factory-class.md)

Used only when one class is instantiated frequently across many classes. Inherit `BaseFactory`; the concrete factory does **not** redefine `create`, and fixes its target solely by overriding `static get TargetCtor ()`. Creation is split into two orthogonal seams: **`.get:TargetCtor`** (which class — selection) and **`.createTarget()` / `createInstance()`** (how it is created — the single point where `new this.TargetCtor(...)` runs). Open the reference for the `BaseFactory` skeleton and the reasoning before writing one.

## Arguments should be a single named-argument object

- With some exceptions, a defined method's arguments should in principle be received as a single object, using named arguments (destructuring assignment).
- Break each argument onto its own line and chop it down (one property per line).

```javascript
// NG: positional arguments
generate (length) {
  // ...
}

// OK
generate ({
  length,
}) {
  // ...
}
```

### Exception: binding (inflator) methods pass arguments flat

An inflator method is a static method that binds the class passed as an argument and returns a memoized derived subclass. It receives **the arguments to pass, flat** — basically a single argument; multiple/array arguments only for variadic or array input.

```javascript
// NG
static use ({ ConstraintCtor }) {}

// OK
static use (ConstraintCtor) {}

static of (...Ctors) {}

static from (Ctors) {
  return this.of(...Ctors)
}
```

- Names are short and preposition-like (`.as()` / `.use()` / `.of()` / `.to()`), so calls read declaratively: `Document.as(bindingSchema)`, `UnionScalar.of(A, B)`. `from` standardly delegates to `of`.
- These are representative examples only. **The full inflator vocabulary is owned by the inflator-methods convention, not this skill** — go there for `.toKey()` / `.toValue()` and the forward vs. graft distinction.

## Do not pass properties directly to private methods

- Unless there is a specific reason, do not pass an (instance) property directly as an argument to a private / internal method. Internal methods should reference the properties they need directly from `this` — this avoids passing arguments around and preserves encapsulation.
- If a piece of logic needs a property passed as an argument, that is a sign that "it should be a static method rather than an instance method." However, making it static would remove the point of instantiation, so the correct approach is for instance methods to reference `this` with no arguments.

```javascript
// NG
buildKey () {
  return this.formatName({
    name: this.name,
  })
}

// OK
buildKey () {
  return this.formatName()
}

formatName () {
  return this.name.toUpperCase()
}
```

## What this skill does NOT state

- **How a method's responsibility is scoped** (one responsibility per method, verb-aligned splitting of read / transform / persist) is **not in this skill**. It covers argument form, the `this`-referencing rule for internal methods, and factory methods only. The one-responsibility rule appears in the ORT project rule `rules/architecture.md` ("One responsibility per method — verb-aligned, for testability") — read it there; do not infer it from this digest.
- **Method naming** (verb prefixes `find~` / `fetch~` / `build~` / `generate~`, boolean `is~`) is not here either; sibling skill `hoc-naming` (digested at `.hora/digests/hoc-naming.md`) and ORT `rules/naming.md` own it.
- The inflator-method vocabulary is deferred to the inflator-methods convention (a skill not present in `.claude/skills/`).

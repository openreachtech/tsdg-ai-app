# hoc-accessors
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-accessors/ -->

**Read the source above whenever this leaves a question open.**

## Setters are prohibited

- Do not define setters (`set xxx () {}`). All classes are immutable — properties are set once in the constructor and never reassigned.
- To change state, generate a new instance via a factory method.
- Exception: a `set` trap on a `Proxy` handler (`new Proxy(target, handler)`) may be defined as needed.

## `Ctor` is reserved

- `#get:Ctor` is reserved as the conventional getter that "returns `this.constructor`."
- Do not use the name `Ctor` as a member name for any other purpose.

```javascript
get Ctor () {
  return /** @type {typeof DeepLoader} */ (this.constructor)
}
```

## Extract references to dependency modules into a getter

Whether native, third-party, or in-house: **do not use the reference to a dependency directly as the imported identifier inside a method — extract it into a getter.** Reasons: easy patching (override the getter in a subclass; call sites unchanged) and easy mocking (swapping the getter replaces the dependency entirely).

| The dependency is | The form |
|---|---|
| a class to be instantiated via `new` / `.create(...)` | static getter named `[TargetClassName]Ctor` + a dedicated factory method |
| a module that is itself the value, with no instantiation (e.g. `node:fs`, `node:crypto`) | one static getter returning the module as-is — no `Ctor` suffix, no factory method |
| a target class undetermined (abstract base class) | a generic role name, e.g. `TargetCtor` |

```javascript
// OK: [TargetClassName]Ctor + a dedicated factory method
static get AggregatorCtor () {
  return Aggregator
}

static createAggregator ({
  config,
}) {
  return this.AggregatorCtor.create({ config })
}
```

Emergency patch in a subclass = overriding `AggregatorCtor` alone.

## Native modules — static getter, reached through `#get:Ctor`

- **It is static because the body never touches `this`.** `return fs` is the whole of it. What decides the kind of a getter is its body, not the kind of value it holds.
- **An instance reaches it through `#get:Ctor`**, as `this.Ctor.fs` — going through the constructor is what keeps a subclass's override the one that answers.
- Calling a function of the module from within the getter is prohibited. The getter must return nothing but the module reference itself.

```javascript
import fs from 'node:fs'

export default class DeepLoader {
  static get fs () {
    return fs
  }

  get Ctor () {
    return /** @type {typeof DeepLoader} */ (this.constructor)
  }

  collectFileNames ({
    poolPath = this.poolPath,
  } = {}) {
    return this.Ctor.fs.readdirSync(poolPath)
      .filter(it => !it.startsWith('.'))
  }
}
```

## What a getter body may not contain

**No branching** — no `if` statements, no ternary operators.

**No method calls** — the receiver does not matter: `this.xxxx()`, `this.Ctor.xxxx()`, a method on an object reached by drilling down, and a global function are all prohibited. From the caller's side a getter looks like a property access; what looks like a property must be complete as a property reference alone. When processing is needed, define it as a method and let the caller call it as a method.

```javascript
// NG: a method call behind what looks like a property
get authorLabel () {
  return this.buildLabel(this.author)
}

// OK: getter stays a property reference; formatting is a method
buildAuthorLabel () {
  return this.buildLabel(this.author)
}
```

Out of scope / permitted:
- Returning a function **without calling it** is not restricted.
- An abstract getter that requires an override and declares itself unimplemented by throwing — **including the one that reaches the module's own error class through a factory method** (a call inside a getter, without which the exception would be worth nothing, since the getter never returns). The throw's shape follows the error-handling convention.

## Property drilling

A getter's other responsibility is drilling down into properties to resolve the Law of Demeter — confine deep chains in the getter, keep the caller shallow.

- **A getter must not return `undefined`.** Resolve to `null` with `?? null`. This `??` is a kind of branching, permitted as an exception because the condition is limited solely to "identifying `undefined`."
- Treat `this.xxxx` as the receiver; **at most one receiver per line, and at most one property call per line.**
- When the **leading lines of the chain recur across multiple getters**, extract that leading part into its own getter and use it as the receiver from then on.

```javascript
get author () {
  return this.entity.comment
    ?.author
    ?? null
}

get authorId () {
  return this.author?.id
    ?? null
}
```

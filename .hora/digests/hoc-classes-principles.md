# hoc-classes-principles
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-classes-principles/ -->

**Read the source above whenever this leaves a question open.**

## Core principle: do not create classes without properties

- A class must hold at least one instance property.
- Do not create a class that is nothing but a collection of static methods / static fields (a static-only class). Design it as a state-holding instance class, or delegate to a single-responsibility class.
- Adding `static` fields does **not** relax this. A `static` field is not an instance property, so a class holding only those remains prohibited as a static-only class.
- A class that has `extends` is out of scope — the responsibility belongs to the base class.

Detailed reasons and exceptions for the no-properties / static-only prohibition live in the class-prohibitions convention (sibling skill `hoc-classes-prohibits`), not here.

## The five points of the system (a bundle of premises)

1. **Deep immutability** — Do not reassign after construction; keep nested values (e.g. instances of other immutable classes) immutable too. **The collection types Array / Set are not deep-frozen; updates (adding/removing elements) are allowed.** **However, a structure that references an individual element (e.g. pulling out a single element via `array[i]`) is prohibited** — it circumvents the prohibition on mutable objects. A collection's value must always be "used all at once" (scanned/transformed/aggregated over every element as a whole). When you need to associate by object, use `WeakMap` (if you need to enumerate, hold the keys in an Array and traverse through them). Do not use `Map`.
2. **Property = a constructor argument of the same name** — Every property that stores a value is passed as a constructor argument of the same name, so the set of property names a class occupies appears in the constructor signature itself and hidden fields cannot exist in principle.
3. **Constructor-only** — Only `this.xxx = xxx` inside the `constructor` counts as a property.
4. **Treat references as the contract** — The published API references fix the public surface. Direct access to a member not in the references is "undocumented = outside the contract," and breaking after coupling to it is the caller's responsibility.
5. **Enumerating instances is prohibited** — Do not enumerate a class instance via `Object.keys` / `Object.entries` / `for...in` / spread `{...instance}` / `Object.assign`. It is a category error that treats a behavior-bearing object as a POJO/dictionary and drops the prototype (methods) to make a degraded copy.

## Definition of "property"

- Only `this.xxx = xxx` inside the `constructor` counts as a property.
- Do not use class fields (`x = 1`) or private fields (`#x = 1`).

Grounds (each is load-bearing): **single manifest** — one place, the constructor and its argument signature, answers "what does this class hold," guaranteeing strictly one location; **linear, clear initialization order** — class fields initialize right after `super()`, before the constructor body, which breeds bugs under inheritance; **eliminates split-brain** — no "default in a field / overridden in the constructor" double declaration.

## `static` fields

- **`static` fields (`static X = ...`) may be used.** The class-field / private-field prohibition is about **instance properties**; `static` is out of its scope.
- **Do not use `static #X`** (the static form of native private): when a `static` method refers to `this.#X`, **a call through a derived class throws a TypeError.**
- **Put accumulating associations, pools, and caches in `static` + `WeakMap`, not in an instance** — a cache is not a value, and on an instance it would join equality comparison and serialization. `static` + `WeakMap` sits outside instance value semantics, is non-enumerable and key-gated, and stays inspectable on demand via `util.inspect(Ctor, { showHidden: true })`.
- **Do not reassign the reference itself.** Deep immutability extends to `static` as well. Only the inside of a collection may change, and `Map` is not used even for `static`.

## What not to use

- **`#private`** — Under an immutable property design there is no work left that is unique to `#private`. Soft-private (`this._x`) is visible and correct. Do not use `#private` unless a human explicitly specifies it. (Secrecy for keys/passwords is not `#`'s job either — JS `#` is not a security boundary against memory dumps/debuggers; that is a separate layer: encryption, or not retaining.) full text: `.claude/skills/hoc-classes-principles/SKILL.md#private`
- **`decorator`** — Adds no capability; it is syntactic sugar over a higher-order function + metadata. This policy chooses "explicitness > brevity." A field decorator attaches to a class field, which this policy prohibits. Do not use unless a human explicitly specifies it.

## Rules

- A class holds at least one instance property (if it cannot, replace it with a method of a state-holding class / delegation to a single-responsibility class)
- Properties are only `this.xxx = xxx` inside the `constructor`; class fields and private fields are not allowed
- `static` fields are allowed (`static #X` is not); put accumulating associations, pools, and caches in `static` + `WeakMap`; do not reassign the reference
- Every property that stores a value is received via a constructor argument of the same name; do not reassign it (deep immutability). Array / Set may be updated but referencing an individual element is prohibited (always use the whole at once); use `WeakMap` for association, do not use `Map`
- Do not directly access members not in the references; do not enumerate instances
- Do not use `#private` or `decorator` (except when a human explicitly specifies it)
- A class that has `extends` is out of scope

## Proviso

The benefits hold only once all five points of the system are in place. If any one of them (especially deep immutability) is broken while the others remain, the ground for each rule collapses. The rules' legitimacy is load-bearing on one another.

## Not covered by this skill

This skill states no **factory-method** (`static create()`) requirement, and says nothing about what a constructor may do beyond "only `this.xxx = xxx` counts as a property." For the factory-method requirement and the constructor's no-logic rule, read the constructor convention (sibling skill `hoc-classes-constructor`) and the ORT `architecture.md` rule — do not infer them from this digest.

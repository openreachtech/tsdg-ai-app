# hoc-errors
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-errors/ -->

**Read the source above whenever this leaves a question open.**

## Generation methods return null on failure

- For a method that returns a generated value, return `null` rather than throwing an exception "when generation is not possible."
- **However, if there is a specific instruction to do so, implement it to throw an exception.**

```javascript
// OK: return null when generation is not possible
/**
 * @param {{
 *   length: number
 * }} params - Parameters.
 * @returns {string | null} Generated text, or null if it cannot be generated.
 */
generate ({
  length,
}) {
  if (!Number.isInteger(length) || length < 0) {
    return null
  }

  // ...
}
```

## How an abstract member declares itself unimplemented

An abstract method or getter that requires an override in a subclass throws where it is reached without one. **Two throws express that, and a module takes one of them throughout.**

| Route | What is thrown | Where it belongs |
| :-- | :-- | :-- |
| The plain error | `new Error()` carrying the wording below | The default, and the whole of it for a module that declares no error class of its own |
| The module's own error | The class that module declares for its failures | A module whose errors are part of what it publishes |

**The choice belongs to the module and is made once.** A module must not mix the two — nothing about a member would say which it will be.

**Declaring the class is the module's decision, not this convention's.** What settles it is whether callers are meant to catch that module's failures by type; a module nobody catches that way gains nothing from the class and takes the plain route.

### The plain error

- Unify the `new Error()` message to the following format.

```
`${<class name>}<member-notation> must be inherited`
```

- Unify the wording as `must be inherited`, with no trailing period (`.`).

```javascript
// OK: instance method (override required in subclass)
normalizeValue () {
  throw new Error(`${this.constructor.name}#normalizeValue() must be inherited`)
}

// OK: static getter
static get rawSchema () {
  throw new Error(`${this.name}.get:rawSchema must be inherited`)
}

// OK: static method
static generateCredential () {
  throw new Error(`${this.name}.generateCredential() must be inherited`)
}
```

### The module's own error

- **The message is the error class's, not this convention's.** Where the class builds one from an error code and a value, the code and the value are what a reader sees; the `must be inherited` wording belongs to the plain route and is not restated here.
- **The member goes in under the key `memberName`** — one fixed string to search for when looking for where a member is declared abstract.

```javascript
// OK: the module's own error, with the member named and the class resolved
static get config () {
  throw ConcreteMemberNotFoundError.create({
    value: {
      memberName: `${this.name}.get:config`,
    },
  })
}
```

### The member is named as the documentation convention names it

- `<member-notation>` follows "Notation of Class Members" from the documentation convention (instance method `#instanceMethod()` / static getter `.get:staticGetter` / static method `.staticMethod()`, etc.).
- This holds **in the plain error's message and in the `memberName` the module's own error carries** — the notation cannot differ by route.

### The class name is resolved at run time

- `<class name>` is resolved dynamically, embedding the actual runtime class (subclass) name.
  - Instance member: `this.constructor.name`
  - Static member: `this.name` (in a static context, `this` is the class itself)
- **Do not hard-code the class name.** Hard-coding displays the wrong class name when inherited by a subclass.
- **The module's own error hides the mistake more easily**, because the name sits inside a value object rather than in a template literal next to the member. Resolve it there too.

```javascript
// NG: class name hard-coded + wording and trailing period not unified
static get boundSchema () {
  throw new Error('CompositeScalar.get:boundSchema must be overridden.')
}
```

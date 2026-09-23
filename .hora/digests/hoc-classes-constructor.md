# hoc-classes-constructor
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-classes-constructor/ -->

**Read the source above whenever this leaves a question open.**

Conventions related to class constructors. The source is one file (`SKILL.md`, 32 lines) with no `references/`; this digest carries all of it.

## Do not assign default values to parameters

- Do not assign default values to constructor parameters.
- **The constructor's whole responsibility is to hold what its parameters receive.** Each one is
  assigned to the property of the same name, and no value is decided here.
- **Deciding a value the caller did not supply belongs to the factory methods**, `static create
  (...)` first among them. That division is settled by the method-definition convention.

```javascript
// NG: assigning a default value to a parameter
constructor ({
  delimiter = ',',
}) {
  this.delimiter = delimiter
}

// OK: no default value
constructor ({
  delimiter,
}) {
  this.delimiter = delimiter
}
```

## What this skill does not carry

- **The factory-method requirement itself is not in this skill.** This skill only names `static create (...)` as the place a defaulted value is decided, and defers the division to "the method-definition convention" — it does not state that every class must define a factory method, nor its shape. Do not infer that rule from here; open the skill that owns method definition (sibling skill `hoc-methods`, with `references/instantiation.md` and `references/factory-class.md` — not read for this digest).
- **The parameter form is shown, not ruled.** Both examples take a single destructured named-argument object, one binding per line with a trailing comma. This skill states no rule about that form; it is only what its example shows.
- Nothing here about constructor visibility, `super()`, property count, or JSDoc.

# hoc-jsdoc
<!-- hora-skills-ort-core 0.4.0 -->
<!-- source: .claude/skills/hoc-jsdoc/ -->

**Read the source above whenever this leaves a question open.**

All typing is JSDoc — no TypeScript syntax, no `.ts` files, never `import type`. The skill body applies to every JavaScript file, backend and frontend; the files marked *Frontend* below say so in their own headers.

## Blocks: presence and layout

- **`function` declarations and methods (`MethodDefinition`) must have JSDoc.** Empty constructors and empty functions are **not** exempt. Arrow functions, function expressions and class declarations are not targeted.
- **No empty JSDoc blocks, no empty descriptions** (`no-blank-blocks` / `no-blank-block-descriptions`).
- **Single-line JSDoc blocks are prohibited** — always write a block across multiple lines. Only exceptions: `lends` / `type`, plus `extends` / `inheritdoc` / `override`.
- **Every line starts with `*`**; keep the `*` column aligned, one space after the tag / type / name / hyphen.
- **Exactly one blank line between the description and the first tag; no blank lines between tags; none before the closing.**
- **Tag order follows the default `tagSequence`**: roughly `@param` → `@returns` → `@throws` → … → `@public`/`@access` → `@example`.
- A `@param` **description** is prefixed with a hyphen `- `; a `@returns` description takes **no** hyphen.
- Description text style (leading capital, trailing period, completeness) is **not** enforced — `match-description` and `require-description` are off. What is enforced is that the block and its description are not blank.

full text: references/eslint-jsdoc-rules.md

## Object types and named arguments

- **Do not use `{object}`.** Write an object as an inline type literal, listing each property as a named parameter.
- **Name a single object argument `params`** unless there is a special reason not to.
- **No delimiter after a chopped-down property** — no semicolon, no comma.

```javascript
/**
 * @param {{
 *   alpha: string
 *   beta: number
 * }} params - Parameters.
 */
```

## `@returns` — always, with a description

- Every function and method gets `@returns`, **even one that returns nothing**: `@returns {void}` (`@returns {Promise<void>}` when async). Never omit the tag. (Stricter than lint.)
- Attach a **description** as well as a type. Sole exception: `@returns {void}` / `@returns {Promise<void>}`, which stand on the type alone. (Stricter than lint.)
- No hyphen between the type and the description.

```javascript
/**
 * @returns {string} Default characters to pick from.
 */
```

- A function that throws needs `@throws`; a generator needs `@yields`.
- **Add `@public`** to the JSDoc of any method that serves as an entry point accessed from outside.

## Type vocabulary

| Rule | Write |
|---|---|
| arrays | `Array<string>` — trailing-`[]` (`string[]`) is prohibited |
| any | `*` — never `any`, and `*` only when the type cannot be narrowed |
| "no value" | `null` — never `undefined` in a type (`@returns {string \| null}`); exception only when a third-party module requires `undefined` |
| returns nothing | `@returns {void}` — never `@returns {undefined}` |
| unknown-key object | `Record<string, *>` — `object` / `Object` is prohibited regardless of the reason |
| known-key object | a type literal with explicit properties — the best option, preferred over `Record<string, *>` |
| generics | make them concrete: `Array<UserEntity>`, not `Array<object>` |

**Do not write undefined type names.** Anything beyond built-ins (`string` / `number` / `boolean` / `Array` / `*` / `null`, …) and TS utility types (`Record` / `Partial` / `Pick` / `Omit` / `ReturnType`, …) must be **defined before** it is referenced, via `@typedef` / `@class` / `@interface` / import.

## Writing `@typedef`

- At least **three lines** — a single-line `@typedef` is prohibited by lint.
- **One `@typedef` per block.**
- **Separate `@typedef` blocks with a blank line.**

```javascript
/**
 * @typedef {*} BooleanLike
 */

/**
 * @typedef {{
 *   id: number
 *   name: string
 * }} UserEntity
 */
```

## Params / FactoryParams, placement, factory shape

*Scope note: `references/placement.md` and `references/class-typing.md` both declare themselves **Frontend (Vue / Nuxt) only**. The naming pair and the `create()` template idiom below are quoted from them verbatim; the skill body itself states no class-typing convention.*

- **`@typedef` blocks go at the END of the file** (after the class/exports), each in its own `/** … */` comment.
- Params typedef: `<ClassName>Params`; factory params: `<ClassName>FactoryParams`. When `create()` defaults no keys, FactoryParams simply aliases Params; when it defaults some via DI, those keys are made optional in FactoryParams (frontend uses the ambient `RequiredExcept<Params, 'key'>`).

```js
/**
 * @template {X extends typeof OrderDetailProductContext ? X : never} T, X
 * @override
 * @param {OrderDetailProductContextFactoryParams} params
 * @returns {InstanceType<T>} Instance of this class.
 * @this {T}
 */
static create ({
  // ...
}) {
  return /** @type {InstanceType<T>} */ (
    new this({
      // ...
    })
  )
}
```

- **`@override`** goes on overridden statics/getters — notably `static create`, `static get EMIT_EVENT_NAME`, `static get document`.
- **`@template` with constraints** in generics; **`@extends`** on the class doc.
- **Class field types** via `@property` in the class-level doc, or captured through the constructor's params typedef.

full text: references/class-typing.md, references/placement.md

## Type-only imports

- Never the TypeScript `import type` statement. Two styles: the **`@import` block tag** and the **inline `import('…')` expression**.
- **Follow the style the repository has established; do not mix both for the same type.** Furo / Nuxt apps use `@import`; **renchan backends use the inline `import('…')` expression.** If neither is established, prefer `@import`.
- One `@import` tag per JSDoc block, one source module per block, blocks at the end of the file, blank line between them.
- Inline form: `import('<module>').<ExportedName>`, `.default` for a default export; **always include the filename extension** (`.js` / `.vue`).
- Types declared under `declare global` in `types/*.d.ts` (`RequiredExcept`, `OptionalExcept`, `NullableExcept`, `schema.graphql.*`, `furo.*`, `GraphqlType.*`) are used **unqualified, never imported**.

```javascript
/**
 * @returns {import('./CustomerOrdersBk.js').default} Backup model declaration.
 */
```

full text: references/import-tag.md, references/import-expression.md

## Not covered here

`references/vue-props-and-globals.md` (Vue `PropType` on prop definitions) is omitted — frontend only.

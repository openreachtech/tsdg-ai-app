# hor-type-interface
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-type-interface/ -->

**Read the source above whenever this leaves a question open.**

Skill states a **general, project-independent rule** — the directory names, namespaces and example type names are the recommended convention with illustrative fakes; use your project's own model and resolver names, never bake its domain concepts into the rule.

## Grand principle

One file per entity (one model, one resolver), each declaring into a **shared global namespace**; TypeScript declaration merging combines the same-named `namespace` blocks from every file into one. Adding a model = adding a file. Declared under `declare global`, the types need **no import** in any JSDoc.

## Naming & placement

| Kind | File | Namespace | Interface names | Access |
| --- | --- | --- | --- | --- |
| Model | `types/models/<ModelName>.d.ts` | `model` | `<ModelName>` | `model.<ModelName>` |
| Resolver | `types/resolvers/<category>/<resolverName>.d.ts` | `graphql.<category>` | `<Resolver>Input`, `<Resolver>Result` | `graphql.<category>.<Resolver>Input` |

- File base names match the entity: `<ModelName>` (PascalCase) for models, `<resolverName>` (matching the resolver, camelCase) for resolvers.
- Avoid the denied vague identifiers in field names (`data` / `info` / `list` / …); name a field for what it holds.

## The `.d.ts` scaffold

Every declaration file has the same three-line envelope: `export {}` module marker, then `declare global`, then the `namespace`.

```ts
export {}

declare global {
  namespace model {
    // interfaces here
  }
}
```

- **`export {}`** makes the file a module (so `declare global` is legal). It exports nothing itself.
- The **namespace name is fixed by kind**: `model` for model interfaces, `graphql.<category>` for resolver types.

**Sample code follows the project's lint style**: `.d.ts` uses no semicolons, 2-space indent, and interface members are one-per-line (no trailing comma or semicolon). Comments in generated files are English for structural notes; domain notes match the surrounding language.

## Model interfaces (one file per table)

```ts
// types/models/User.d.ts
export {}

declare global {
  namespace model {
    interface User {
      id: number
      email: string
      displayName: string | null
      registeredAt: Date
      OrganizationId: number
    }
  }
}
```

- **One interface per file**, named exactly for the model, so it is reachable as `model.User`.
- **Fields mirror the table's columns.** Use the precise scalar type (`number` / `string` / `Date` / `boolean`); a nullable column is `<type> | null`.
- **A field holding another model's id starts with an uppercase initial** (`UserId`, `OrganizationId`), mirroring how the ORM's associations are named — this distinguishes a foreign-key field from a plain scalar at a glance.
- Optionally, a model interface may `extend` a framework base-model interface (if the architecture provides one for the common columns); keep that base generic, not a hard-coded app path.

## Resolver input/output types (one file per resolver)

Not exercised by a feature that declares no API operation — context only. `types/resolvers/<category>/<resolverName>.d.ts` declares into `namespace graphql.<category>` (`<category>` = the API/endpoint group: `user`, `admin`, `portal`, …), with the same `export {}` → `declare global` envelope:

```ts
declare global {
  namespace graphql.user {
    interface CreateOrderInput {
      productId: number
      quantity: number
    }

    interface CreateOrderResult {
      order: model.Order
    }
  }
}
```

- **Input** is the resolver's argument shape; **Result** is what it returns. A query uses the same pairing.
- **Reuse model interfaces in the output** — a Result field is typed as `model.<ModelName>`; both namespaces are global, so one references the other with no import.
- **Resolver-local helper types** (a nested filter input, a row sub-shape) live in the **same file** as the resolver they belong to.
- The same resolver name under a different endpoint is a different file and a different namespace.

full text: .claude/skills/hor-type-interface/SKILL.md#3-resolver-inputoutput-types-one-file-per-resolver

## Accessing the types

JSDoc references the global namespaces directly — no import: `@param {model.User} user`, `@returns {Promise<graphql.user.CreateOrderResult>}`.

## Finishing checklist

- [ ] The type lives in its **own file**.
- [ ] File envelope is `export {}` → `declare global` → the correct `namespace`.
- [ ] Model interface is 1:1 with a table; fields mirror columns; nullable is `| null`; a foreign-key field starts uppercase.
- [ ] Resolver file declares `<Resolver>Input` + `<Resolver>Result`, reuses `model.<ModelName>` in outputs, keeps helper types in the same file.
- [ ] The `types/**` directory is included in the project's `tsconfig` / `jsconfig` `include` so the ambient declarations resolve project-wide.

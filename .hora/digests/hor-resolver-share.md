# hor-resolver-share
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-resolver-share/ -->

**Read the source above whenever this leaves a question open.**

> The skill states a **general, project-independent rule** — a refined best practice, not a description of any one project's code, so it need not match a given repo's existing notation. The class and property names in it (`CustomerGraphqlShare`, `workerDispatcher`, `permissionService`, …) are **illustrative fakes**; use your project's own names and never hard-code its file paths or domain concepts into the rule. The framework base class is shown as `BaseGraphqlShare`; treat it as "your framework's Share base".
>
> **Surface note:** the skill's description scopes it to GraphQL resolvers receiving `context.share`. The Share/Context split, the admission test, the class shape, the one-assembly-point rule and the one-way dependency are stated as general rules. What is tied to the GraphQL surface specifically: the `context.share.<name>` access path, the `<Role>GraphqlShare` naming, the `BaseGraphqlShare` base, `subscriptionBroker` (GraphQL subscription events), and "the API's engine names its Share class" at boot. On another transport, carry the rules over and rename the surface-bound parts.

## Grand principle

Share is a **per-process container of shared singletons — no request state, no logic**. It holds the instances that are **built once and reused by every request/resolver** of an API: the subscription broker, the worker (background-job) dispatcher, the authorization/permission service, shared external clients, environment access. The framework constructs it at boot and passes it — via the Context — to every resolver as `context.share`. Share's only job is **to hold and expose these shared instances**; it runs no business logic and stores no per-request data.

One Share instance is shared by **all concurrent requests**, so anything request-scoped or per-user (the current principal, the request input, a per-request transaction) belongs in the **Context** (built fresh per request), never on Share — writing it to Share creates data races.

**Comment language**: keep structural comments in English and write any domain notes in whatever language the project uses for domain prose — match the surrounding files. Sample code follows the project's lint style (no semicolons, 2-space indent, a space before the parameter parenthesis, trailing commas).

## 1. Share (per process) vs Context (per request)

The two containers split by **lifetime and sharing**:

| | Share | Context |
| --- | --- | --- |
| Built | once, at server boot (`createAsync`) | fresh, per request |
| Shared by | **all** concurrent requests of the process | one request |
| Holds | shared singletons (broker, dispatcher, permission service, clients, env) | the request principal, per-request state, and a handle to `share` |
| Reached from a resolver | `context.share.<name>` | `context.<name>` |

- **Decision rule**: is the thing the **same for every request** and safe to reuse concurrently? → Share. Does it **depend on who is calling or on this request**? → Context.
- The Context carries a reference to the Share, which is why a resolver reaches a shared instance through `context.share`. Share does not know about Context or resolvers — the dependency is one-way (Context → Share).

```js
// Good: request-scoped principal lives on the Context; shared dispatcher lives on Share
const caller = context.principal // per-request → Context

await context.share.workerDispatcher.dispatchJob({ // shared singleton → Share
  body: {
    requestedBy: caller.id,
  },
})
```

```js
// Avoid: stashing request-scoped state on the shared object
this.currentPrincipal = authenticatedPrincipal // shared across all concurrent requests → data race
```

## 2. What belongs in Share (the admission test)

A candidate goes on Share only when it passes **all three**:

1. **Shared** — used across multiple resolvers (often across multiple APIs).
2. **Concurrency-safe** — stateless, or internally synchronized; holding no per-request data.
3. **Build-once-worthy** — holds a connection or is expensive to create, so building it per request would be wasteful or wrong.

Typical members (role names, not fixed to any project):

| Member | What it is |
| --- | --- |
| `subscriptionBroker` | The PubSub broker that publishes/subscribes GraphQL subscription events across processes. |
| `workerDispatcher` | The enqueuer that dispatches background jobs to workers (reuses one queue connection). |
| `permissionService` | The shared authorization/permission service resolvers consult to gate access. |
| shared external clients | Long-lived clients for external services (reused, connection-pooled). |
| `env` | Environment/configuration access shared process-wide. |

Do **not** put on Share: request inputs or the current principal (→ Context), resolver/business logic, GraphQL entities or query results, or a mutable cache keyed by request.

## 3. The class shape (constructor DI + `create` + `createAsync`)

A Share class extends the framework Share base and follows the standard member order: **constructor → `create` (sync factory) → `createAsync` (async boot factory)**. Dependencies are **injected through the constructor** and held as read-only properties.

```js
import {
  BaseGraphqlShare,
} from '@openreachtech/renchan'

/**
 * Shared object for the customer GraphQL API.
 * Holds process-lifetime instances shared by every resolver of this endpoint.
 *
 * @extends {BaseGraphqlShare}
 */
export default class CustomerGraphqlShare extends BaseGraphqlShare {
  /**
   * Constructor.
   *
   * @param {{
   *   workerDispatcher: object
   *   permissionService: object
   * }} params - Own dependencies; base params are forwarded via rest.
   */
  constructor ({
    workerDispatcher,
    permissionService,
    ...restArgs
  }) {
    super(restArgs)

    this.workerDispatcher = workerDispatcher
    this.permissionService = permissionService
  }

  /**
   * Factory method.
   *
   * @param {*} params - Same shape as the constructor.
   * @returns {CustomerGraphqlShare} Instance of this class.
   */
  static create ({
    workerDispatcher,
    permissionService,
    ...restArgs
  }) {
    return new this({
      workerDispatcher,
      permissionService,
      ...restArgs,
    })
  }

  /**
   * Async factory method. Assembles the shared instances once, at server boot.
   *
   * @param {{
   *   config: object
   * }} params - Boot configuration.
   * @returns {Promise<CustomerGraphqlShare>} Instance of this class.
   */
  static async createAsync ({
    config,
  }) {
    const workerDispatcher = await WorkerDispatcher.createAsync({
      config,
    })

    const permissionService = PermissionService.create({
      config,
    })

    return this.create({
      env: this.generateEnv(),
      workerDispatcher,
      permissionService,
    })
  }
}
```

- **Constructor = pure assignment** (`super(restArgs)` then assign own deps). No I/O, no building — everything is already built and handed in. This is what makes Share testable.
- **`createAsync` is the single place the shared instances are assembled.** Async because some deps connect (broker, queue). Build them, then call `create`. The framework base commonly supplies helpers for the cross-cutting ones (a broker factory, an env accessor); use them rather than re-implementing.
- **Properties are read-only after construction** and named for their role (arrays plural, single instances singular). Resolvers read them; nothing reassigns them.

## 4. Lifecycle & wiring (boot → Context → resolver)

1. **Boot**: the API's engine names its Share class; the framework calls `Share.createAsync({ config })` **once**, producing the single per-process Share.
2. **Per request**: the framework builds a Context for the request and gives it a reference to that Share.
3. **In the resolver**: code reads shared instances via `context.share.<name>`.

- **Share never imports resolvers or the Context** — the arrows point Context → Share, resolver → `context.share`. Keeping the dependency one-way stops Share from becoming a hub that knows about request handling.
- **One assembly point.** All shared instances are wired in `createAsync`; a resolver never constructs a broker/dispatcher/client of its own. If a resolver needs a new shared instance, add it to Share (in `createAsync` + a property), don't construct it ad hoc.

## 5. Naming

- **One Share per API/endpoint**, named `<Role>GraphqlShare` (e.g. `CustomerGraphqlShare`, `AdminGraphqlShare`). When several endpoints share the same set of dependencies, factor a common app-level Share base and let each endpoint's Share extend it (add only its extras).
- **Properties are named for the instance's role** — `subscriptionBroker`, `workerDispatcher`, `permissionService`. Arrays are plural; single instances singular. Avoid the denied vague identifiers (`data` / `info` / `list` / `manager` …).

## 6. Testing

Because every dependency is **constructor-injected**, a Share is trivial to unit-test and resolvers become testable: a test builds a Share (or a plain `context.share` stand-in) with **fakes**, and asserts the resolver used them.

- Construct the Share via `create({ ... })` with **fake** deps (a fake dispatcher, a fake broker) — never build a real broker/queue/client in a test.
- Assert the resolver reads/uses the shared instance it should (e.g. the fake `workerDispatcher` received the expected dispatch).
- Do not exercise `createAsync` against real infrastructure in unit tests; that is integration territory.

## Finishing checklist

- [ ] Everything on Share is **shared, concurrency-safe, and build-once** — it passes the admission test (§2); nothing request-scoped or per-user is on it.
- [ ] No business logic on Share — it only **holds and exposes** shared instances.
- [ ] Class shape is constructor (pure assignment) → `create` → `createAsync`, with all deps **injected via the constructor** (§3).
- [ ] The shared instances are assembled in **one place** (`createAsync`), built once at boot; resolvers reach them via `context.share.<name>` and never construct their own (§4).
- [ ] Dependency direction is one-way: Context → Share; Share imports no resolver/Context.
- [ ] Tests inject **fakes** through the constructor; no real broker/queue/client is built in a unit test (§6).

## Where this skill is thin (and the source will not help)

The skill is a single 262-line `SKILL.md` — no `references/`, no `scripts/` — so everything above is near-verbatim and re-reading the source adds only the "why" prose and one longer `resolve()` example. Gaps the skill itself leaves open:

- **What `BaseGraphqlShare` provides.** `super(restArgs)` forwards "base params" that are never enumerated; `this.generateEnv()` and a broker factory (`this.createBroker({ config })`) appear in the example but are never defined — the skill only says the base "commonly supplies helpers for the cross-cutting ones". Confirm against the framework, not this skill.
- **How the engine names its Share class.** §4 says the API's engine names it and the framework calls `createAsync({ config })`; the exact hook or property is not given.
- **Nothing about non-GraphQL transports.** The skill never discusses REST or any other surface, so how a per-process Share is reached outside a resolver's `context.share` is unstated here.
- **No guidance on splitting one collaborator across both containers** (e.g. a shared verifier configured per request) — the skill gives only the binary decision rule of §1.

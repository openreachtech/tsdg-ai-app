# hor-restfulapi-architecture
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-restfulapi-architecture/ -->

**Read the source above whenever this leaves a question open.**

## Core principle: a renderer is a resolver with an HTTP envelope

The REST layer (`server/restfulapi/`) **mirrors the GraphQL layer**: a per-request **context**, a per-process **share**, an **engine**, and an error hash declared up front. The difference is the surface — a **renderer** returns a **`RestfulApiResponse`** (`statusCode` + `content` / `error`) and a **flusher** writes it.

Support classes (`BaseRestfulApiServerEngine`, `BaseGetRenderer` / `BasePostRenderer`, `RestfulApiResponse`, `BaseRestfulApiContext` / `BaseRestfulApiShare`, `BaseRestfulApiResponseFlusher`) come from `@openreachtech/renchan`.

1. **Return responses, never throw.** Every exit is a `RestfulApiResponse` — success via `RestfulApiResponse.create({ statusCode, content })`, failure via `this.errorResponseHash.Xxx.createAsError()`. A thrown error becomes a generic 500 (Unknown).
2. **The engine owns cross-cutting concerns; the renderer owns one endpoint.** Auth (the visa filter), middleware, versioning, and the standard error envelopes live on the engine. The renderer knows only its route, its errors, and its `render()`.
3. **Validate at the boundary, then delegate.** REST input arrives split across `body` / `query` / path params and is all string-like; normalize and validate before touching the DB.

- **Comments: English for code, the surrounding language for domain notes.** Match the neighbors.

## Request lifecycle

1. The framework builds the render input `{ body, query, context, request }` — `body` is the multer-fulfilled request body, `query` is `expressRequest.query`, `context` is created async (resolves the user + visa), `request` wraps the express request (path-param proxy).
2. If the renderer's **`passesFilter`** is `true`, the filter is skipped; otherwise the engine's **filter handler** (auth) runs. An error response from the filter short-circuits `render()`.
3. `renderer.render(input)` runs and returns a `RestfulApiResponse`.
4. Any **thrown** error is caught and converted to a `500` (Unknown) — renderers should still return their own typed errors.
5. The renderer's **flusher** writes status, headers, body.

## Directory, versioning, and route binding

```
server/restfulapi/
  AppRestfulApiServerEngine.js       # the engine
  contexts/
    AppRestfulApiContext.js          # per-request context
    AppRestfulApiShare.js            # per-process share
  flushers/                          # custom response flushers
  renderers/
    v1/
      get/   <Name>Renderer.js       # one file per endpoint
      post/  <Name>Renderer.js
    v2/
      get/   …
      post/  …
```

- **`renderers/<version>/<method>/<Name>Renderer.js`** — the folder encodes the **version** (`v1`, `v2`) and the **HTTP method** (`get`, `post`, …). One renderer = one file, one class. Class name = `<Name>Renderer` (PascalCase); **keep the verb out of the class name** and let the folder carry it (the repo has both `FooRenderer` and `FooGetRenderer` — prefer the folder-only form for new files).
- **The engine selects the version.** `config.renderersPath` points at **one** version directory (`renderers/v1/`) and `config.pathPrefix` (`/v1`) is prepended to every `routePath`. So `routePath = '/articles'` in `renderers/v1/get/` serves **`GET /v1/articles`**. A new version is a new directory served by an engine pointed at it with its own `pathPrefix`.
- **The route is `pathPrefix + routePath`, method = the renderer's `method`.** The framework discovers every renderer under `renderersPath`, reads its `routePath` and `method`, and registers the express route — **you never wire routes by hand**.

## The renderer — the fixed surface

```js
import {
  BasePostRenderer,
  RestfulApiResponse,
} from '@openreachtech/renchan'

import Article from '../../../../../sequelize/models/Article.js'

export default class CreateArticleRenderer extends BasePostRenderer {
  /**
   * get: Route path.
   *
   * @override
   * @returns {string}
   */
  static get routePath () {
    return '/articles'
  }

  /**
   * get: Error structure hash.
   *
   * @override
   * @returns {Record<string, RestfulApiType.ErrorResponseEnvelope>}
   */
  static get errorStructureHash () {
    return {
      InvalidRequestBody: {
        statusCode: 400,
        errorMessage: 'Invalid request body',
      },
    }
  }

  /**
   * get: Passes filter.
   *
   * @override
   * @returns {boolean}
   */
  get passesFilter () {
    return false // run the engine auth filter before render
  }

  /**
   * Render.
   *
   * @override
   * @param {RestfulApiType.RenderInput<*, *>} input
   * @returns {Promise<RestfulApiType.RenderResponse>}
   */
  async render ({
    body,
    context: {
      now,
      userId,
    },
  }) {
    if (!this.isValidBody({
      body,
    })) {
      return this.errorResponseHash.InvalidRequestBody.createAsError()
    }

    const article = await this.saveArticle({
      body,
      now,
      userId,
    })

    return RestfulApiResponse.create({
      statusCode: 201,
      content: {
        articleId: article.id,
      },
    })
  }

  // ... isValidBody(), saveArticle() ...
}
```

- **`get passesFilter()`** — `true` = public (skip the engine auth filter); default `false` = run it.
- **`render()` must return a `RestfulApiResponse` on every path.** Destructure only what the endpoint needs.

### `render()` input: `{ body, query, context, request }`

| Key | What |
| --- | --- |
| `body` | the parsed request body (POST/PUT/PATCH); for `multipart/form-data`, multer has already run and files are attached |
| `query` | `expressRequest.query` (the query-string params, all strings) |
| `context` | the per-request context: `now`, `share`, `env`, `userId` / `userEntity`, and the visa predicates |
| `request` | the wrapped express request; `request.expressRequest` is the raw request; `request.pathParameterHashProxy` reads path params (`/articles/:articleId`) and returns **`null`** for a missing key rather than `undefined` |

### Method-verb subclasses

| Base class | method | Notes |
| --- | --- | --- |
| `BaseGetRenderer` | `get` | no request body |
| `BasePostRenderer` | `post` | body-bearing (multer middleware, file uploads) |
| `BasePutRenderer` | `put` | body-bearing |
| `BasePatchRenderer` | `patch` | body-bearing |
| `BaseDeleteRenderer` | `delete` | |
| `BaseHeadRenderer` / `BaseOptionsRenderer` / … | head / options / … | |

Body-bearing verbs (post/put/patch) extend a request-body base that wires **multer** for `multipart/form-data`; the rest extend the plain renderer base directly. All ultimately extend `BaseRenderer`, which holds the factory, the error hash, and `flushResponse()`.

### Dependency injection (optional)

No constructor unless the renderer depends on a tool that tests must substitute. Then the factory triple — **and pass the error hash through**:

```js
constructor ({
  randomTextGenerator,
  errorResponseHash,
}) {
  super({
    errorResponseHash,
  })

  this.randomTextGenerator = randomTextGenerator
}

static create ({
  randomTextGenerator = this.createRandomTextGenerator(),
  errorStructureHash = this.errorStructureHash,
} = {}) {
  const errorResponseHash = this.buildErrorResponseHash({
    errorStructureHash,
  })

  return new this({
    randomTextGenerator,
    errorResponseHash,
  })
}

static createRandomTextGenerator () {
  return RandomTextGenerator.create()
}
```

The base's `create()` builds `errorResponseHash` from `errorStructureHash` via `buildErrorResponseHash()`. When you override `create()`, do that build yourself and pass `errorResponseHash` to `super()` — **never drop it**.

### File uploads (body-bearing renderers)

Declare the accepted multipart file fields via `static get fileFieldsConfigHash()` — `{ <fieldName>: <maxCount> }`. The base builds the multer middleware from it; with an empty hash multer runs in `.none()` mode (parses fields, no files). Uploaded files are attached to the request and merged into `body` before `render()` runs.

```js
static get fileFieldsConfigHash () {
  return {
    attachment: 1,
  }
}
```

## Engine

```js
export default class AppRestfulApiServerEngine extends BaseRestfulApiServerEngine {
  /** @override */
  static get config () {
    return {
      pathPrefix: '/v1', // prepended to every routePath; null = none
      renderersPath: rootPath.to('server/restfulapi/renderers/v1/'),
      staticPath: rootPath.to('public/'),
    }
  }

  /** @override */
  static get Share () {
    return AppRestfulApiShare
  }

  /** @override */
  static get Context () {
    return AppRestfulApiContext
  }

  // ... standardErrorEnvelopHash, generateFilterHandler, visaIssuers, collectMiddleware ...
}
```

Imports in the source example: `express`, `cors`, `{ BaseRestfulApiServerEngine } from '@openreachtech/renchan'`, `rootPath from '../../app/globals/root-path.js'`, then the app Share / Context.

- **`static get standardErrorEnvelopHash()`** — the **cross-cutting** error envelopes, keyed by name, each `{ statusCode, errorMessage }`. The framework requires at least `Unknown`, `ConcreteMemberNotFound`, `Unauthenticated`, `Unauthorized`, `Database`. These back the engine's own `errorResponseHash` (used by the filter handler); per-endpoint errors live on the renderer (`errorStructureHash`).

```js
/** @override */
static get standardErrorEnvelopHash () {
  return {
    Unknown: {
      statusCode: 500,
      errorMessage: 'Unknown error',
    },
    Unauthenticated: {
      statusCode: 401,
      errorMessage: 'Unauthenticated',
    },
    Unauthorized: {
      statusCode: 403,
      errorMessage: 'Unauthorized',
    },
    // ConcreteMemberNotFound, Database, ...
  }
}
```

- **`collectMiddleware()`** — the express middleware stack (cors, JSON / urlencoded body parsers, static file serving, …). Returns an array applied in order.

### The auth filter: `generateFilterHandler()` + `visaIssuers`

Run before `render()` for every renderer whose `passesFilter` is `false`.

- **`get visaIssuers()`** — async predicates that populate the request's **visa**, each given `{ expressRequest, userEntity, engine }`:

```js
/** @override */
get visaIssuers () {
  return {
    hasAuthenticated: async ({
      userEntity,
    }) => userEntity !== null,
    hasAuthorized: async ({
      userEntity,
    }) => true,
    hasPathPermission: async ({
      userEntity,
    }) => true,
  }
}
```

- **`generateFilterHandler()`** — returns an async `({ body, query, context, request }) => errorResponse | null`. Read the visa via the context and **return an error response to reject**, or `null` to allow:

```js
/** @override */
generateFilterHandler () {
  return async ({
    context,
  }) => {
    if (!context.hasAuthenticated()) {
      return this.errorResponseHash.Unauthenticated.createAsError()
    }

    if (!context.hasAuthorized()) {
      return this.errorResponseHash.Unauthorized.createAsError()
    }

    return null
  }
}
```

## Context (per request)

`AppRestfulApiContext extends BaseRestfulApiContext`. The framework builds it **per request**: it extracts the access token from the header (`x-renchan-access-token`), calls `findUser`, and builds the visa from the engine's `visaIssuers`.

```js
export default class AppRestfulApiContext extends BaseRestfulApiContext {
  /**
   * Resolve the authenticated user from the access token.
   *
   * @override
   * @param {{
   *   expressRequest: ExpressType.Request
   *   accessToken: string | null
   *   now?: Date
   * }} params
   * @returns {Promise<renchan.UserEntity | null>}
   */
  static async findUser ({
    expressRequest,
    accessToken,
    now = new Date(),
  }) {
    // look up the token → return the user entity, or null
  }
}
```

The context is what `render()` receives as `context`. It exposes:

- **`now`** — the request timestamp (`requestedAt`); use it so all writes in the request share one time.
- **`userId` / `userEntity`** — the authenticated user (or `null`).
- **`share`** — the per-process share; **`env`** / **`NODE_ENV`** — configuration.
- **`hasAuthenticated()` / `hasAuthorized()` / `hasPathPermission()` / `canRender()`** — the visa predicates the filter handler reads.
- **`uuid`** — a per-request id.

Override `findUser` to do the token → user lookup. Add domain-neutral aliases if useful (e.g. a `provider` getter aliasing `userEntity`), but keep app-specific naming out of the base pattern.

## Share (per process)

`AppRestfulApiShare extends BaseRestfulApiShare`. A single object created once at startup, reachable as `context.share`. It holds `env` and is the place for **shared, long-lived collaborators** (an external-API client, a provider). Often a `// noop` subclass until something needs sharing:

```js
export default class AppRestfulApiShare extends BaseRestfulApiShare {
  // noop
}
```

## RestfulApiResponse and the error hash

`RestfulApiResponse` holds `{ statusCode, headers, content, error }`. `get status()` aliases `statusCode` (the flusher reads `renderResponse.status`).

- **Success** → `RestfulApiResponse.create({ statusCode, headers?, content })`; `content` is the payload, `error` stays `null`.
- **Failure** → **do not `new` an error response by hand**; take it from the built error hash: `this.errorResponseHash.Xxx.createAsError()`, which fills in the entry's `statusCode` and wraps the message as `{ error: { message } }`.
- A renderer declares **every error it can return up front** in `static get errorStructureHash()` (shape shown in the renderer example above); unlike GraphQL (code only), each REST entry also carries a `statusCode` and `errorMessage`, because an HTTP response needs a status.
- `buildErrorResponseHash()` turns each `{ Name: { statusCode, errorMessage } }` entry into a constructable `RestfulApiResponse` subclass on **`this.errorResponseHash`** (also reachable as `this.Error`).
- **Naming = the reason** (`InvalidRequestBody`, `ArticleNotFound`) — read as a sentence at the return site. No `info` / `data` suffixes.
- **Cross-cutting** errors (`Unauthenticated`, `Unauthorized`, `Unknown`, `Database`) are declared **once on the engine** (`standardErrorEnvelopHash`) and used by the auth filter — do not redeclare them per renderer.

**Extending the response** — when the default envelope is not enough (a custom body shape, extra headers, a computed status), subclass `RestfulApiResponse` in the app and return that subclass, keeping the `{ statusCode, content, error }` contract the flusher relies on. Prefer extending over hand-building one-off response objects, so every endpoint returns the same recognizable shape.

## Flushers

A flusher (`BaseRestfulApiResponseFlusher` subclass) writes the response to express: status → headers → body. The renderer picks one via `static get FlusherCtor()`.

| Flusher | contentType | body |
| --- | --- | --- |
| `JsonRestfulApiResponseFlusher` (default) | `application/json` | `{ content, error }` |
| `HtmlRestfulApiResponseFlusher` | `text/html` | HTML string |
| `CsvRestfulApiResponseFlusher` | `text/csv` | CSV |
| app custom (e.g. a redirect flusher) | your choice | your choice |

A renderer that returns JSON needs no `FlusherCtor` override. Select a non-default flusher per renderer:

```js
/** @override */
static get FlusherCtor () {
  return HtmlRestfulApiResponseFlusher
}
```

**Custom flusher** — extend `BaseRestfulApiResponseFlusher`, set `static get contentType()` and implement `flushResponseBody()` (or override `flushResponse()` entirely for non-body responses like a redirect). It reads `this.renderResponse` (the `RestfulApiResponse`) and `this.expressResponse`. Place app flushers under `server/restfulapi/flushers/`.

```js
export default class RedirectRestfulApiResponseFlusher extends BaseRestfulApiResponseFlusher {
  /** @override */
  static get contentType () {
    return 'text/html'
  }

  /** @override */
  flushResponse () {
    this.expressResponse.redirect(
      this.renderResponse.status,
      this.renderResponse.content?.redirectUrl ?? '/'
    )
  }
}
```

## Input validation — the target shape (not the current repo)

The current repo validates REST input **ad hoc** inside `render()` (a hand-rolled `isValidRequestBody()` per renderer). The **target** is the same validator structure GraphQL uses, reached with two collaborators; the renderer flow becomes **adapter → input → validator → (on failure) map to the renderer's `errorResponseHash` entry**.

| Class | Duty |
| --- | --- |
| **Adapter** (one per operation) | shape and type only: read `{ body, query, request }`, coerce strings, default missing values to `null`, merge the sources. No value judgements. It is the **only** place that knows input was split across sources and arrived as strings. |
| **Validator** (`BaseInputValidator` subclass) | value rules on the normalized `input`: presence, format, ranges, enums. Pure booleans; no DB; predicates never throw. |
| **Renderer / DB layer** | existence, ownership, and state checks that require the database (a missing row → a `404`-class response). These stay out of the validator, exactly as on the GraphQL side. |

The validator overrides `generateValidationEntries()`, returning `[predicate, ErrorIdentity]` pairs; the base's `validateInput()` runs the predicates in order and returns the **first failing** entry's error, or `null` when all pass:

```js
generateValidationEntries () {
  return [
    [
      () => this.isValidTitle(),
      this.errorHash.InvalidTitle,
    ],
    [
      () => this.isValidTagIds(),
      this.errorHash.InvalidTagIds,
    ],
  ]
}
```

Wiring in the renderer:

```js
const input = CreateArticleInputAdapter.create({
  body,
  query,
  request,
})
  .buildInput()

const validationResult = this.validateInput({
  input,
})

if (validationResult) {
  return validationResult
}
```

**The error-type bridge** — a GraphQL-style validator yields a **code-only** error, but REST must return a **status-bearing** `RestfulApiResponse`:

| Option | How |
| --- | --- |
| **Map in the renderer (recommended)** | keep `BaseInputValidator` transport-neutral: its `errorHash` entries are error **identities**, `validateInput()` returns the failing identity or `null`, and the renderer maps it to `this.errorResponseHash.Xxx.createAsError()`. The validator stays byte-for-byte the GraphQL one; only the renderer knows about HTTP status. |
| **A REST base validator** | a thin `BaseRestfulApiInputValidator` overrides how the failing entry is instantiated so it returns a `RestfulApiResponse` via `createAsError()` directly, fed the renderer's `errorResponseHash`. Use this if you would rather the validator emit the final response. |

Either way, keep `createInputValidator()` / `validateInput()` as thin named methods on the renderer, mirroring the GraphQL side, so the two surfaces read the same.

The adapter's full worked example (`static create` / `constructor` / `buildInput()` / `extractTagIds()` / `extractArticleId()`, with JSDoc) is compressed here to the duty table above — full text: `.claude/skills/hor-restfulapi-architecture/references/validation.md#the-adapter`

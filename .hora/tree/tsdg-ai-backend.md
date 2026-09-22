# tsdg-ai-backend
<!-- boilerplate: renchan-boilerplate 1.14.0 -->
<!-- test cache: wired by hoc-test-cache, as the `backend` unit of .hora-cache.json -->

A cache of what the real tree was read to hold. **On any disagreement the tree wins**, and
this file gets rewritten from it. Re-read it whenever the recorded version no longer matches.

## Directory layout

```
app/        domain logic. globals/ holds the env and root-path barrels
server/     graphql/ (two engines) and restfulapi/ (one engine)
sequelize/  config.cjs, _.js (activation), models/, migrations/, seeders/
tests/      __tests__/, _orders/, _live/, setup-after-env.js
constants/  shared constants
types/      hand-written and generated declarations
public/     static files the REST engine serves
```

`app/`, `sequelize/models/` and `sequelize/migrations/` ship empty — nothing to match a
convention against yet, so the conventions below come from the framework's own wiring.

## How servers are split

One entry point, `server/index.js`, builds three servers and binds every one to loopback:

| Server | Port | Engine |
|---|---|---|
| Customer GraphQL | 3900 | `server/graphql/CustomerGraphqlServerEngine.js` |
| Admin GraphQL | 5800 | `server/graphql/AdminGraphqlServerEngine.js` |
| REST | 8001 | `server/restfulapi/AppRestfulApiServerEngine.js` |

`pm2.config.cjs` declares **one** app, `GraphQL API` → `server/index.js`. There is no job
daemon process in it.

The REST engine's `config` already reads `pathPrefix: '/v1'` and
`renderersPath: server/restfulapi/renderers/v1/`, which is the prefix the spec's routes use.
Its `generateFilterHandler()` ships with the three-visa shape — `hasAuthenticated()`,
`hasAuthorized()`, `hasPathPermission()` — resolved on the per-request context.

## How things get registered

**By directory scanning, in every case found.** This is the good case: implementation drops
its own file into the right directory and nothing aggregates.

| What | Registered by |
|---|---|
| a REST renderer | the engine's `renderersPath`, walked by the framework |
| a Sequelize model | `sequelize/_.js` → `SequelizeActivator.createAsync({ modelsPath })` |

No aggregation file was found that a new file has to be appended to.

## Naming conventions

Nothing in the tree to read them off yet — `app/` and `sequelize/models/` are empty. The
framework's own files show the shape: one class per file, the file named for the class,
`Base*` for a framework base, `*ServerEngine` / `*Context` / `*Share` / `*Renderer` suffixes.

## How tests are written

`jest.config.js` maps `~/` to the repository root and loads `tests/setup-after-env.js`
before each suite. The three trees ship as the convention expects them:

```
tests/__tests__/    mirrors the source path. Non-writing tests
tests/_orders/      grouped by domain. DB-writing tests
tests/_live/        tests that hit live systems, run by `npm run test:live`
```

`npm test` runs `./test.sh`, not jest directly.

## Existing model definitions

None. `sequelize/config.cjs` fixes the dialect per environment, and **`development` is
SQLite**, file-backed at `sequelize/storage/development.sqlite3`:

| Environment | Dialect | Source of its values |
|---|---|---|
| `development` | **sqlite** | hard-coded in `config.cjs` |
| `live` | mariadb | hard-coded in `config.cjs` |
| `staging` | mysql | hard-coded in `config.cjs` |
| `production` | from `DATABASE_DIALECT` | `.env` |

**The `DATABASE_*` keys of `.env.development` feed `production` alone.** See the divergence
note below.

## The existing GraphQL schema

`server/graphql/schemas/` ships the framework's own SDL only. This project declares no
GraphQL server, so nothing is expected to grow here.

## npm scripts

| Script | What it runs |
|---|---|
| `test` | `./test.sh` — the suite. What the cache unit declares |
| `test:live` | `./test-live.sh`, with `NODE_ENV=live` |
| `lint` / `l` | `eslint .` |
| `dev` | `nodemon server`, with `NODE_ENV=development` |
| `db:setup` | `sequelize-cli db:migrate` |
| `db:seed:master` | seeds `sequelize/seeders/dev-master` |
| `db:seed:dev` | seeds `sequelize/seeders/development` |
| `db:teardown` / `db:drop` | `rm sequelize/storage/*.sqlite3` |
| `db:refresh` / `r` | teardown, setup, both seeders, in that order |

## A local end-to-end environment

**None ships.** There is no `e2e/` directory and no stack beside the one this run placed.
Checkpoint 17 is what builds it.

## Placed by this setup run

| File | Why |
|---|---|
| `docker.sh` | the boilerplate ships the `db:*` scripts but no way to bring middleware up |
| `docker-compose.development.yml` | MariaDB 10.5.12 and Redis 7.4 without a profile, the rest behind one. Every port bound to `127.0.0.1` |

## Divergences worth carrying forward

**1. `.env.development`'s database keys do not reach development.** The origin document
directs that they be filled to match the compose file; `config.cjs` fixes `development` to
SQLite, so nothing local reads them. They are filled anyway, so the two never disagree once
an environment does read them — but a local `db:refresh` builds a SQLite file, not MariaDB.

**Examined and found consistent, not contradictory.** The two statements cover different
runs: the automated suite executes on SQLite under `NODE_ENV=development`, which is the
boilerplate's default and what the test convention assumes, while the MariaDB the spec
declares is what `docker.sh` brings up for manual verification. **What this leaves open is
a real risk rather than an inconsistency:** `text('medium')`, `json` and `datetime(3)`
behave differently on the two engines, so a type error can pass the suite and surface only
on the engine that runs live.

**2. `pm2.config.cjs` declares one process; the spec declares two.** The spec's server table
names a REST API and a worker. The boilerplate's pm2 config knows only the first.

**3. Two GraphQL servers boot that this project does not declare.** `server/index.js` starts
a customer and an admin GraphQL server alongside the REST one. The spec declares neither.

**4. The boilerplate's `CLAUDE.md` is its own publicity policy, not a conventions document.**
Its only section forbids naming a private party anywhere in the repository, because the
boilerplate is public. Whether that policy is wanted in a product repository is a decision
for this project.

**5. The `AUTH_*` environment keys belong to cookie authentication this service does not
use.** They are read by the GraphQL engine only. Filled with local values rather than left
empty, because an empty `AUTH_COOKIE_SECURE` is read as `true`.

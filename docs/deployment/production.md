# Production deployment runbook — 1.0.0 (Google Cloud Run)

| | |
|---|---|
| **Status** | **WALKED END TO END** against a live project. Every correction that run produced is folded into the steps below rather than appended as errata, so a step that reads oddly usually reads that way because the obvious form of it failed |
| Target environment | production |
| Target version | 1.0.0 |
| Image tags | `1.0.0` built first, `1.0.1` carried the Cloud SQL socket fix, `1.0.2` adds client-secret rotation (Part III). The product version is 1.0.0 throughout |
| Written | 2026-09-29 |
| Revised | 2026-10-20, after the first live run |
| What it implements | `specs/1.0.0/spec.md` — §7 (non-functional), §17 (`provider-layer`), §19 (`retention`), §22 (version acceptance criteria) |
| Build kind | **First build.** Nothing is serving yet, so Part I runs once and in full |
| End state | **A real provider answering.** The stub is an intermediate state of the build, held for the length of step 1.15 only. Part I is not finished until 1.16 shows `gemini-2-5-flash` in `ai_model_calls` |
| Downtime allowed | A few minutes per release, agreed with the operator |

This document is for touching production **one line at a time**. Every step says what to run, what
the screen shows when it worked, and what to do when it did not. **Every command runs in Cloud
Shell** unless a step says otherwise.

**Read chapter 7 before chapter 1.** Nothing there blocks the build any more, but two of its
items change what you should set while you are setting everything else.

---

## Chapter 0 — What everyone reads

### 0.1 Topology

| Role | What runs it | Notes |
|---|---|---|
| Client-facing API | Cloud Run **service** | The four REST routes under `/v1`. The only thing a client reaches. Listens on `$PORT` |
| Run worker | Cloud Run **worker pool** | Consumes the run queue. Listens on no port, so it is not a service |
| Database | Cloud SQL for **MySQL 8** | The `mariadb` dialect driver speaks to it. Reached over the Cloud SQL connector |
| Queue | **Memorystore for Redis**, inside the VPC | BullMQ. Holds the run queue, the callback queue and the three retention schedules |
| Model provider | **Vertex AI, as the worker itself** | `@google/genai` with `vertexai: true`, addressed by `VERTEX_AI_PROJECT_ID` and `VERTEX_AI_LOCATION`. There is no key anywhere. `GEMINI_API_KEY` is a fallback the driver takes only when those two are not both set — see 1.16 |
| Secrets | **Secret Manager** | Injected as environment variables |

**Two processes, and the split is deliberate.** `pm2.config.cjs` in the backend explains it: a run
calls a model and fetches files, either of which can take the 300 seconds §7 allows a run — far
longer than a request may be held open. The API answers `202` with a run key and enqueues; the
worker consumes. Both read one Redis and one database.

**Nothing is public except the API service.** §7 says every request is signed and there is no public
route, no health check and no guest allow-list.

**Every setting reaches both processes as an environment variable, under `NODE_ENV=production`.**
Under that one name `@openreachtech/renchan-env` looks for a bare `.env` in the working directory
and **throws if it is absent** (`DotenvLoader.js:49` rethrows dotenv's error), while reading no
`.env.production` at all. So the image carries an **empty `.env`**, and every real value comes from
the process environment, which wins over the file.

### 0.2 Placeholders

Fill this table with your own values before running anything. Every `<...>` below is a value from
here.

| Symbol | Meaning | Example |
|---|---|---|
| `<PROJECT_ID>` | GCP project ID | `example-ai-prod` |
| `<REGION>` | Region | `asia-northeast1` |
| `<AR_REPO>` | Artifact Registry repository name | `tsdg-ai` |
| `<SQL_INSTANCE>` | Cloud SQL instance name | `tsdg-db` |
| `<SQL_CONNECTION>` | Cloud SQL connection name, from 1.3 | `example-ai-prod:asia-northeast1:tsdg-db` |
| `<REDIS_HOST>` | Memorystore's address, from 1.4 | `10.12.0.3` |
| `<VPC_CONNECTOR>` | Serverless VPC connector name, used by the API service | `tsdg-connector` |
| `<VPC_NETWORK>` | VPC network the worker pool joins directly, from 1.4 | `default` |
| `<VPC_SUBNET>` | Subnet in that network | `default` |
| `<TAG>` | Tag of the version being deployed | `1.0.0` |
| `<API_URL>` | The API service's URL, from 1.9 | `https://tsdg-api-xxxxx.a.run.app` |
| `<CLIENT_HOSTS>` | Hosts the service may fetch media from | `files.example.com,storage.example.com` |

### 0.3 What the operator needs at hand

- Cloud Shell on the project: `gcloud config set project <PROJECT_ID>`. It already has `gcloud`,
  `docker` and `git`
- Node 24 in Cloud Shell, for the migrations and the scheduler registration: `nvm install 24`
  (the backend requires `>=22.18.0`)
- Read access to the backend repository
- **Nothing to hold for the model provider.** The worker calls Vertex AI as its own service
  account, so there is no key to carry into this procedure, store, or revoke afterwards — see
  1.16

### 0.4 Permissions required

| Role | On what | For |
|---|---|---|
| `roles/run.admin` | the project | deploying the service and the worker pool |
| `roles/artifactregistry.writer` | the repository | pushing the image |
| `roles/cloudsql.admin` | the project | creating the instance; `client` is enough afterwards |
| `roles/redis.admin` | the project | creating Memorystore |
| `roles/secretmanager.admin` | the project | writing the secrets; `secretAccessor` is enough afterwards |
| `roles/iam.serviceAccountUser` | the runtime service accounts | deploying as them |

### 0.5 How long it takes

| | |
|---|---|
| Part I, first build | about 90 minutes, of which Cloud SQL takes 10–15 unattended |
| Part II, a release | about 15 minutes, of which the image build takes most |

### 0.6 The downtime commitment

**A few minutes per release is accepted.** The API is replaced revision by revision, so requests in
flight finish; the worker pool is replaced the same way. A run already queued is **not lost** during
a restart — it is a record in Redis, and the next worker to start picks it up. What a client sees
during the replacement is, at worst, a connection error on a new request, which their own retry
covers.

---

## Part I — First build (once only)

### 1.1 Read chapter 7

**Purpose.** Nothing there blocks the build, but two items decide values you are about to set
and are cheaper to apply now than to change afterwards.

**Preconditions.** None.

**Command.** Read chapter 7.

**Expected output.** Not applicable — this is a reading step.

**On failure.** Not applicable.

**Rollback.** Not applicable.

**Interrupts service?** No.

### 1.2 Enable the APIs

**Purpose.** Everything below fails without them, with errors that name the API rather than the
step.

**Preconditions.** 0.4's roles.

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com
```

**Expected output.** `Operation "operations/..." finished successfully.` Enabling an API that is
already enabled is silent and is not an error.

**`aiplatform.googleapis.com` is the one the model calls need** (0.1). Left disabled, everything
builds and deploys and the first real run fails at the vendor call instead — far from here, and
reported as a run failure rather than as a missing API.

**On failure.** `PERMISSION_DENIED` means 0.4's roles are not held. Billing not enabled gives
`FAILED_PRECONDITION`.

**Rollback.** None needed; enabling an API changes no data.

**Interrupts service?** No.

### 1.3 Create Cloud SQL

**Purpose.** The database every row lives in.

**Preconditions.** 1.2.

```bash
gcloud sql instances create <SQL_INSTANCE> \
  --database-version=MYSQL_8_4 \
  --edition=ENTERPRISE \
  --tier=db-custom-2-7680 \
  --region=<REGION> \
  --storage-auto-increase \
  --backup-start-time=18:00

gcloud sql databases create tsdg_ai --instance=<SQL_INSTANCE>

# generate the password into a variable, so it can still be read after the command returns
DATABASE_PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
printf '%s\n' "$DATABASE_PASSWORD"

gcloud sql users create tsdg_app \
  --instance=<SQL_INSTANCE> \
  --password="$DATABASE_PASSWORD"

gcloud sql instances describe <SQL_INSTANCE> --format='value(connectionName)'
```

**Expected output.** The last command prints `<PROJECT_ID>:<REGION>:<SQL_INSTANCE>`. **Write it into
0.2 as `<SQL_CONNECTION>`.** Creation takes 10–15 minutes and prints `Creating Cloud SQL
instance...done.`

**`--edition` is named because the default is not yours to assume.** The `db-custom-*` tiers
belong to the Enterprise edition, and an instance created without the flag can be placed in
Enterprise Plus, which refuses that tier and fails the command. One line removes the question.

**The password is generated into a variable rather than into the command.** Written as
`--password="$(openssl rand -base64 32)"` the value exists only inside the substitution and is
gone the moment the command returns — and 1.6 needs it. `tr -d '\n'` is not decoration either:
1.6 is where the same missing character cost a crash loop.

**On failure.** A name already in use cannot be reused for a week after deletion; choose another.

**Rollback.** `gcloud sql instances delete <SQL_INSTANCE>`. **Irreversible once data exists.**

**Interrupts service?** No — nothing is serving yet.

### 1.4 Create the VPC connector and Memorystore

**Purpose.** Redis holds the queues and the retention schedules. Memorystore has no public address,
so Cloud Run reaches it through a serverless VPC connector.

**Preconditions.** 1.2.

```bash
gcloud compute networks vpc-access connectors create <VPC_CONNECTOR> \
  --region=<REGION> \
  --range=10.8.0.0/28

gcloud redis instances create tsdg-redis \
  --size=1 \
  --region=<REGION> \
  --redis-version=redis_7_0

gcloud redis instances describe tsdg-redis --region=<REGION> \
  --format='value(host)'
```

**Expected output.** The last command prints a private address such as `10.12.0.3`. **Write it into
0.2 as `<REDIS_HOST>`.**

**On failure.** `Range is already in use` means another connector holds `10.8.0.0/28`; pick a free
`/28`.

**Rollback.** Delete both. Deleting Redis discards every queued job and every registered schedule;
1.12 re-registers the schedules.

**Interrupts service?** No.

### 1.5 Create the Artifact Registry repository

**Purpose.** Somewhere to push the image.

**Preconditions.** 1.2.

```bash
gcloud artifacts repositories create <AR_REPO> \
  --repository-format=docker \
  --location=<REGION>
```

**Expected output.** `Created repository [<AR_REPO>].`

**On failure.** `ALREADY_EXISTS` is fine; continue.

**Rollback.** `gcloud artifacts repositories delete <AR_REPO> --location=<REGION>`.

**Interrupts service?** No.

### 1.6 Put the secrets in Secret Manager

**Purpose.** Two values must never appear in a command line, a file in the repository or a Cloud
Run environment variable set in the console.

**Preconditions.** 1.2, and the Cloud SQL password from 1.3.

```bash
# the Cloud SQL password from 1.3
printf '%s' '<the password>' | gcloud secrets create tsdg-database-password --data-file=-

# 32 bytes as 64 hex characters, used to encrypt each client's signing secret at rest.
# It must be hex and exactly that length: ApiClientSecretCipher refuses anything else by
# name, so a base64 value here fails at the first request rather than at this step.
#
# `tr -d '\n'` is the whole reason this line looks odd, and it is not optional.
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create tsdg-client-secret-key --data-file=-

# read it back before anything mounts it. 64, not 65
gcloud secrets versions access latest --secret=tsdg-client-secret-key | wc -c
```

**Expected output.** `Created version [1] of the secret [...]` twice, then `64`.

**A trailing newline in `tsdg-client-secret-key` crash-loops the worker, and here is the whole
chain.** `openssl rand -hex 32` ends its output with a newline; Secret Manager stores the bytes it
is handed; Cloud Run passes the variable through exactly as stored. So the process reads 65
characters where it demands 64. `ENCRYPTION_KEY_PATTERN` is `/^[0-9a-f]{64}$/iu` — anchored, with
no `m` flag, and JavaScript's `$` does not forgive a trailing newline the way a shell comparison
would. The container exits at boot with `API_CLIENT_SECRET_ENCRYPTION_KEY must be 64 hex
characters, the 32 bytes AES-256-GCM takes`, and it exits identically on every retry while the
API service beside it looks healthy. **This happened on the live run**, which is why the `wc -c`
line above is part of the step rather than advice.

**Two secrets, where the first draft of this runbook created four.** Both of the dropped ones were
empty placeholders, and an empty secret is worse than an absent one — it is a thing to mount, to
grant access to, and to forget:

| dropped | why |
|---|---|
| `tsdg-redis-password` | Memorystore here runs with AUTH off, and `RedisConnection.generatePassword()` answers `null` for an absent variable. "Send no AUTH" is already what happens; mounting an empty secret only adds a read |
| `tsdg-gemini-api-key` | The worker reaches Gemini through Vertex AI as itself (0.1, 1.16), so no key is ever read. One created here and filled in later is a live credential nothing consults — exactly the kind nobody remembers to revoke |

**If a key fallback is ever needed**, create that secret at that moment and mount it then. The
driver prefers Vertex and reads a key only when `VERTEX_AI_PROJECT_ID` and `VERTEX_AI_LOCATION`
are not both set.

**`tsdg-client-secret-key` cannot be changed later without re-encrypting every client secret.**
Generate it once and never rotate it casually — see 7.3.

**On failure.** `ALREADY_EXISTS` means the secret is there; add a version with
`gcloud secrets versions add <name> --data-file=-` instead.

**Rollback.** `gcloud secrets delete <name>`. Irreversible.

**Interrupts service?** No.

### 1.7 Create the two runtime service accounts

**Purpose.** The API and the worker need different things. Only the worker calls the model provider;
only the worker runs the retention sweeps.

**Preconditions.** 1.2.

```bash
gcloud iam service-accounts create tsdg-api    --display-name='tsdg API'
gcloud iam service-accounts create tsdg-worker --display-name='tsdg worker'

for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  for SA in tsdg-api tsdg-worker; do
    gcloud projects add-iam-policy-binding <PROJECT_ID> \
      --member="serviceAccount:${SA}@<PROJECT_ID>.iam.gserviceaccount.com" \
      --role="$ROLE" >/dev/null
  done
done

# only the worker calls the model, and it calls as itself
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:tsdg-worker@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user" >/dev/null
```

**Expected output.** Two `Created service account [...]` lines, then the loops run silently.

**`roles/aiplatform.user` on the worker alone is what replaces an API key.** This is the whole of
the provider's credential: granted here, it is never written down, never stored and never rotated.
The API service does not get it, because the API service never calls a model.

**On failure.** `PERMISSION_DENIED` on the binding means `roles/resourcemanager.projectIamAdmin` is
not held.

**Rollback.** Delete both accounts.

**Interrupts service?** No.

### 1.8 Build and push the image

**Purpose.** One image runs both the API and the worker; the entrypoint differs per deployment.

**Preconditions.** 1.1 (the Dockerfile is part of 7.1), 1.5, and the backend checked out at `<TAG>`.

```bash
cd tsdg-ai-backend
git fetch --tags && git checkout <TAG>

gcloud builds submit \
  --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG>
```

**Expected output.** Ends with `STATUS: SUCCESS` and the pushed digest.

**On failure.** Read the build log the command links to. A missing `.env` in the image is the
failure this service fails on at **run** time rather than build time — see 0.1.

**Rollback.** None needed; an unused image costs storage only.

**Interrupts service?** No.

### 1.9 Deploy the API service

**Purpose.** The client-facing half.

**Preconditions.** 1.3, 1.4, 1.6, 1.7, 1.8.

```bash
# every value in one file, so that no line continuation can be lost in transit
cat > ~/api-env.yaml <<'YAML'
NODE_ENV: production
DATABASE_NAME: tsdg_ai
DATABASE_USERNAME: tsdg_app
DATABASE_DIALECT: mariadb
DATABASE_HOST: /cloudsql/<SQL_CONNECTION>
DATABASE_PORT: '3306'
REDIS_HOST: <REDIS_HOST>
REDIS_PORT: '6379'
MEDIA_FETCH_ALLOWED_HOSTS: <CLIENT_HOSTS>
VERTEX_AI_PROJECT_ID: <PROJECT_ID>
VERTEX_AI_LOCATION: <REGION>
YAML

# one line, no continuations
gcloud run deploy tsdg-api --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG> --region=<REGION> --service-account=tsdg-api@<PROJECT_ID>.iam.gserviceaccount.com --set-cloudsql-instances=<SQL_CONNECTION> --vpc-connector=<VPC_CONNECTOR> --no-allow-unauthenticated --env-vars-file=$HOME/api-env.yaml --set-secrets=DATABASE_PASSWORD=tsdg-database-password:latest,API_CLIENT_SECRET_ENCRYPTION_KEY=tsdg-client-secret-key:latest

gcloud run services describe tsdg-api --region=<REGION> --format='value(status.url)'

# count what the revision actually holds. Eleven, not six
gcloud run services describe tsdg-api --region=<REGION> --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | wc -l
```

**Expected output.** `Service [tsdg-api] revision [tsdg-api-00001-abc] has been deployed and is
serving 100 percent of traffic.` The last command prints the URL. **Write it into 0.2 as
`<API_URL>`.**

**The environment is a file, and the deploy is one line, because of what the obvious form does.**
A pasted block of a dozen `--set-env-vars` flags joined by backslashes loses a backslash the way
pasted text does, and the loss is silent: the shell takes the broken line as the end of the
command, everything after it is dropped, the deploy **succeeds**, and the revision comes up
holding six variables where eleven were written. That is what happened on the live run, and the
symptom was a worker that would not boot rather than an error at this step. A file cannot lose a
line, `--env-vars-file` replaces the whole set rather than merging into it, and the count above
says whether the revision got what the file said.

**Quote the numbers in the YAML.** `DATABASE_PORT: 3306` is an integer to a YAML parser, and this
flag wants strings; `'3306'` is a string. Same for the Redis port.

**`REDIS_TLS` and `REDIS_PASSWORD` are absent deliberately.** The Redis sits inside the VPC with
AUTH off, and both readers treat an absent variable as a decision rather than an omission — `null`
for the password, no TLS for the transport. `REDIS_TLS=` as an empty value says the same thing
less clearly, and an empty value inside a comma-separated `--set-env-vars` list is a trap of its
own.

**`--set-cloudsql-instances`, not `--add-`.** `--add-` appends, so a second deploy lists the same
instance twice. It is harmless, and it is also permanent noise in every `describe` after it.

**`MEDIA_FETCH_ALLOWED_HOSTS` left empty refuses every media URL**, and every run then ends
`failed` with `MEDIA_UNREADABLE` and zero model calls. That is the allow-list working, not a
defect — but it means an empty value is a silent "nothing will ever succeed". Set it before the
smoke check.

**On failure.** `Revision is not ready` usually means the container exited at boot. Read
`gcloud run services logs read tsdg-api --region=<REGION> --limit=50`; a missing `.env` and a
missing `NODE_ENV` are the two boot failures this service has.

**Rollback.** `gcloud run services delete tsdg-api --region=<REGION>`.

**Interrupts service?** No — nothing is serving yet.

### 1.10 Deploy the worker pool

**Purpose.** The half that executes runs. It listens on no port.

**Preconditions.** 1.9.

```bash
# the same eleven values as 1.9. A service and a worker pool are configured separately,
# so the file is handed over again rather than shared
cp ~/api-env.yaml ~/worker-env.yaml

# one line, no continuations
gcloud beta run worker-pools deploy tsdg-worker --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG> --region=<REGION> --service-account=tsdg-worker@<PROJECT_ID>.iam.gserviceaccount.com --set-cloudsql-instances=<SQL_CONNECTION> --network=<VPC_NETWORK> --subnet=<VPC_SUBNET> --vpc-egress=private-ranges-only --command=node --args=scripts/startJobDaemon.js --instances=1 --env-vars-file=$HOME/worker-env.yaml --set-secrets=DATABASE_PASSWORD=tsdg-database-password:latest,API_CLIENT_SECRET_ENCRYPTION_KEY=tsdg-client-secret-key:latest
```

**Expected output.** `Worker pool [tsdg-worker] has been deployed.`

**A worker pool does not take the flags a service takes.** `worker-pools deploy` **rejects**
`--vpc-connector` and `--min-instances` outright; it joins the VPC by network and subnet directly,
and its instance count has a different flag name. Copying 1.9's command and changing the noun
fails twice before it works:

| a service takes | a worker pool takes |
|---|---|
| `--vpc-connector=<VPC_CONNECTOR>` | `--network=<VPC_NETWORK> --subnet=<VPC_SUBNET> --vpc-egress=private-ranges-only` |
| `--min-instances=1` | `--instances=1` |

**`--instances=1` is not optional.** A worker pool scaled to zero consumes no queue, and a run
accepted with `202` would sit in Redis until something scaled it up.

**On failure.** Same logs command with `worker-pools`. A pool that boots and dies within seconds,
repeatedly, while the API service beside it serves normally, is 1.6's trailing newline — read the
log for the key's name before looking anywhere else.

**Rollback.** Delete the worker pool. Queued runs stay in Redis and resume when it returns.

**Interrupts service?** No.

### 1.11 Create the schema

**Purpose.** Migrations build every table. Nothing works before this.

**Preconditions.** 1.3, and Node 24 in Cloud Shell.

```bash
cd tsdg-ai-backend
npm ci

# Cloud SQL Auth Proxy, so sequelize-cli reaches the instance from Cloud Shell.
# Cloud Shell does not ship it; fetch it once.
curl -sSLo cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
./cloud-sql-proxy <SQL_CONNECTION> &

export NODE_ENV=production
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=3306
export DATABASE_NAME=tsdg_ai DATABASE_USERNAME=tsdg_app
export DATABASE_PASSWORD='<the password from 1.3>'
export DATABASE_DIALECT=mariadb
touch .env   # renchan-env throws without it under NODE_ENV=production

# 127.0.0.1 is a host here and /cloudsql/... is a socket there, and one setting carries
# both: DatabaseDialectOptionsBuilder treats a value beginning with "/" as a socket path
# and anything else as a host, so the same NODE_ENV=production works through the proxy

npx sequelize-cli db:migrate
```

**Expected output.** One `== <timestamp>-<name>: migrated (0.0xxs)` line per migration, ending with
no error. A second run prints `No migrations were executed, database schema was already up to
date.`

**On failure.** `ER_ACCESS_DENIED_ERROR` means the user or password is wrong. A migration that fails
part-way leaves the ones before it applied; fix the cause and re-run — `db:migrate` resumes.

**Rollback.** `npx sequelize-cli db:migrate:undo` steps back one migration. **Do not use
`npm run db:teardown`: it is `rm sequelize/storage/*.sqlite3` and means nothing here.**

**Interrupts service?** Yes, from the first release onward — a schema change and the running code
must be compatible. For this first build nothing is serving.

### 1.12 Load the master data

**Purpose.** Categories, statuses, providers, models and the agent-to-model binding. **Without the
binding row an agent cannot be called at all.**

**Preconditions.** 1.11, and the same exported environment.

```bash
npx sequelize-cli db:seed:all --seeders-path sequelize/seeders/master
```

**Expected output.** One `== <timestamp>-<name>: migrated` line per seeder, sixteen in all.

**Do not run `npm run db:seed:master`.** Despite its name that script points at
`sequelize/seeders/dev-master`, which is the development copy. Production's master data is
`sequelize/seeders/master`, and it must be named explicitly as above. See 7.3.

**Never run `sequelize/seeders/development`** anywhere near production: it seeds runs, media and
API clients whose signing secrets are published in a public repository.

**On failure.** A duplicate key means the seeders already ran; confirm with
`SELECT COUNT(*) FROM ai_models;` — two rows, `stub` and `gemini-2-5-flash`.

**Rollback.** `npx sequelize-cli db:seed:undo:all --seeders-path sequelize/seeders/master`.

**Interrupts service?** No.

### 1.13 Register the retention schedules

**Purpose.** The three retention sweeps are **records in Redis**, not processes. Nothing registers
them automatically, and a deployment that skips this step runs a service whose retention never once
fires — which surfaces weeks later as data §19 said would be gone.

**Preconditions.** 1.4, and Redis reachable from where you run this.

```bash
export REDIS_HOST=<REDIS_HOST> REDIS_PORT=6379 REDIS_PASSWORD=''
npm run schedulers:start
```

**Expected output.** The script inspects every response and **throws on any schedule that did not
register**, so a clean exit with code 0 is the success signal. Confirm independently:

```bash
redis-cli -h <REDIS_HOST> --scan --pattern 'bull:purge-*'
```

Three queues appear: `purge-expired-provider-uploads`, `purge-expired-run-content`,
`purge-expired-run-traces`.

**On failure.** The script names the schedules that failed. A connection that hangs rather than
failing means Redis is unreachable and `maxRetriesPerRequest: null` is waiting — check the VPC
connector.

**Re-running is safe** and is how a changed cron expression is applied. Changing a `schedulerId`
instead registers a *second* schedule and orphans the first; `npm run schedulers:stop` under the
**old** id is the way back, before the rename.

**Rollback.** `npm run schedulers:stop`.

**Interrupts service?** No.

### 1.14 Provision the first API client

**Purpose.** Nothing can call the service until a row exists in `api_clients` with an encrypted
signing secret and a registered callback URL prefix.

**Preconditions.** 1.11, 1.12, the Cloud SQL proxy from 1.11 still running, and the same
exported environment — including `API_CLIENT_SECRET_ENCRYPTION_KEY`, which must be the value
1.6 put in Secret Manager.

```bash
export API_CLIENT_SECRET_ENCRYPTION_KEY='<the 64 hex characters from 1.6>'

node scripts/registerApiClient.js '<the client's name>' '<their callback URL prefix>'
```

**Expected output.**

```
Registered.

  name                 <the client's name>
  callback URL prefix  https://api.example.com/callbacks/
  client key           <48 hex characters>
  secret               <43 characters>
```

**Capture the secret as it appears.** It is stored encrypted, the model's default scope does not
select the column, and nothing in this repository prints one back. This output is the client's
only copy; hand it over through something that is not this terminal's scrollback. A lost secret
is replaced by registering a new client, never recovered.

**The callback prefix is a control, not a label.** A run's terminal callback is posted only to a
URL beginning with it; anything else is refused as `unregistered-callback-url` and never sent. A
prefix wider than it needs to be is a wider place a result can be sent.

**On failure.** The command refuses a prefix that is not an absolute `http(s)` URL ending in a
slash, prints why, and **exits 1** — so a wrapper script can tell a refusal from a success. An
`API_CLIENT_SECRET_ENCRYPTION_KEY` that is not 64 hex characters is refused by name at this
step rather than at the first request.

**Rollback.** Delete the row; that client can no longer call.

**Interrupts service?** No.

### 1.15 Smoke check on the stub — the pipeline, before the vendor

**Purpose.** Prove the whole pass works before anyone depends on it, and before a vendor is in
the way. This is §22's first acceptance criterion, run against production.

**Why the stub answers here, and only here.** A fresh install binds to the stub by design, and
this step is the reason to leave it there for a few minutes: it exercises the signature, the
database, the queue, the worker, the media fetch and the signed callback **with nothing outside
the deployment involved**. If this passes and 1.16 then fails, the fault is the vendor or the key,
and you know that without having to work it out. Going straight to 1.16 makes every failure
ambiguous, and spends money and customer photographs proving plumbing.

**This is not the end state.** Part I is finished at 1.16, not here.

**Preconditions.** 1.9 through 1.14.

```bash
# 1. The service refuses an unsigned request
curl -s -o /dev/null -w '%{http_code}\n' <API_URL>/v1/ai-runs
# expected: 401

# 2. A signed request creates a run
#    signature = HMAC-SHA256(secret, "<timestamp>.<raw body>"), hex
curl -s -X POST <API_URL>/v1/asset-media-extractions \
  -H 'content-type: application/json' \
  -H 'idempotency-key: smoke-0001' \
  -H 'x-ort-client-id: <client key>' \
  -H 'x-ort-timestamp: <epoch seconds>' \
  -H 'x-ort-signature: <hex>' \
  --data-raw '<the body you signed>'
# expected: 202, with a runKey and statusName "queued"

# 3. Reading it back by key returns the same body the callback carried
curl -s <API_URL>/v1/ai-runs/<runKey> \
  -H 'x-ort-client-id: <client key>' \
  -H 'x-ort-timestamp: <epoch seconds>' \
  -H 'x-ort-signature: <hex over "<timestamp>.">'
# expected: 200, statusName "succeeded"
```

**Expected output.** As commented. Step 3 signs over an **empty** body — the raw body of a request
that declares none is the empty string.

**4. Confirm which model answered.** This is the one check that cannot be inferred from a status:

```sql
SELECT m.name, COUNT(*)
FROM ai_model_calls c JOIN ai_models m ON m.id = c.ai_model_id
GROUP BY m.name;
```

On a default install every row says `stub`. That is correct and expected — see 1.16.

**On failure.** A `401` on step 2 means the signature or the client row is wrong. A run that ends
`failed` with `MEDIA_UNREADABLE` means the media host is not in `MEDIA_FETCH_ALLOWED_HOSTS`. A run
that stays `queued` means the worker pool is not consuming — check `--min-instances`.

**Rollback.** None; the smoke run is data like any other and the retention sweeps remove it.

**Interrupts service?** No.

### 1.16 Turn the real provider on — REQUIRED, this is what go-live means

**Purpose.** To make the service answer with a real model. **Part I is not complete without this
step**, and a deployment that stops at 1.15 is a deployment serving deterministic fixtures to
real clients.

A fresh install answers on the **stub**: deterministic fixtures, no key read, no outbound call.
That is the shipped default — §17 expresses it as data rather than as a branch — and turning a
vendor on is a change of **one row**.

**Preconditions.** 1.15 passed, `aiplatform.googleapis.com` enabled (1.2), the worker holding
`roles/aiplatform.user` (1.7), and `VERTEX_AI_PROJECT_ID` / `VERTEX_AI_LOCATION` in the worker's
environment (1.10).

**The switch is the binding row, and nothing else.**

```sql
-- which models exist
SELECT id, name, is_default FROM ai_models;

-- the switch
UPDATE ai_agent_default_models
SET ai_model_id = (SELECT id FROM ai_models WHERE name = 'gemini-2-5-flash'),
    saved_at = NOW()
WHERE ai_agent_id = (SELECT id FROM ai_agents WHERE name = 'asset-media-extraction-agent');
```

**`ai_models.is_default` is not the switch.** It is a column carried for a later version that picks
a model for an agent with no binding. **Setting it changes nothing today**, and a deployment that
sets it and stops would keep receiving stub answers with no error, no warning and no sign anything
was ignored. This was measured, not assumed: a run configured that way came back `succeeded` with
three model calls, answered by the stub.

**Nothing is deployed for this, and nothing is restarted.** There is no key to add, because the
worker authenticates as itself; and `AiAgentModelBindingFinder` reads the agent, its bound model
and the driver with one `findOne` **per run**, holding no cache across runs. So the `UPDATE` above
takes effect on the next request — which is also why the rollback at the end of this step takes
effect on the next request, and why neither direction needs a revision.

**Then run one request** — 1.15's step 2 — and read the token rows.

**Expected output — and this is the only thing that proves it.**

```sql
SELECT m.name, c.input_token_count, c.output_token_count
FROM ai_model_calls c JOIN ai_models m ON m.id = c.ai_model_id
ORDER BY c.id DESC LIMIT 5;
```

The newest rows must say `gemini-2-5-flash`. **If they say `stub`, the switch did not take** — and
nothing in the running service will tell you, because a stub answer is a successful answer.

**On failure.** A model named in the binding whose provider has no driver refuses the run rather
than answering — so a `failed` run here is the honest outcome, and a `succeeded` one answered by
`stub` is the dangerous one. A `PERMISSION_DENIED` from `aiplatform` names the missing half of 1.7
directly; a configuration that set only one of the two `VERTEX_AI_*` values falls back to the key
path and refuses for a missing key, which reads as a vendor problem and is not one.

**Rollback.** Set the binding back to the `stub` row. It takes effect on the next run.

**Interrupts service?** No, but runs in flight finish on whichever model they started with.

---

## Part II — Every release

### 2.1 Pin down what is being shipped

```bash
cd tsdg-ai-backend
git fetch --tags
git log --oneline $(git describe --tags --abbrev=0)..<TAG>
```

**Expected output.** The commits going into this release. If a migration is among them, read 2.3
before continuing.

**Interrupts service?** No.

### 2.2 Record what is running now

**Purpose.** This is the rollback target. Write it down before anything changes.

```bash
gcloud run services describe tsdg-api --region=<REGION> \
  --format='value(status.latestReadyRevisionName)'
gcloud beta run worker-pools describe tsdg-worker --region=<REGION> \
  --format='value(status.latestReadyRevisionName)'
```

**Expected output.** Two revision names. **Write them down.** 2.8 cannot be run without them.

**Interrupts service?** No.

### 2.3 Back up the database

**Purpose.** The step before anything irreversible. Code can be rolled back; data cannot.

```bash
gcloud sql backups create --instance=<SQL_INSTANCE>
gcloud sql backups list --instance=<SQL_INSTANCE> --limit=1
```

**Expected output.** A backup whose status is `SUCCESSFUL`. Do not continue on `FAILED`.

**On failure.** Retry once; if it fails again, stop the release.

**Interrupts service?** No.

### 2.4 Build and push the image

As 1.8, with the new `<TAG>`.

**Interrupts service?** No — nothing is switched over yet.

### 2.5 Apply the migrations

**Purpose.** Schema first, code second.

**Preconditions.** 2.3 succeeded.

As 1.11's `npx sequelize-cli db:migrate`.

**Expected output.** The new migrations only, or `No migrations were executed`.

**The compatibility rule.** The code that is live **right now** runs against the schema this step
just produced, for as long as 2.6 takes. So a migration in a release may **add** — a table, a
nullable column, an index — and may not remove or rename anything the live code still reads. A
column that stops being used is dropped in a **later** release, after the code that used it is gone.

**On failure.** Fix and re-run; `db:migrate` resumes from where it stopped.

**Rollback.** `db:migrate:undo` for a reversible migration; restore 2.3's backup otherwise.

**Interrupts service?** Briefly possible, if a migration takes a lock on a large table.

### 2.6 Replace the API and the worker

```bash
gcloud run deploy tsdg-api --region=<REGION> \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG>

gcloud beta run worker-pools deploy tsdg-worker --region=<REGION> \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/<AR_REPO>/tsdg-ai-backend:<TAG>
```

**Expected output.** Each prints a new revision name and `serving 100 percent of traffic`.

**On failure.** `Revision is not ready` leaves the previous revision serving, so a failed deploy is
not an outage. Read the logs, fix, redeploy.

**Rollback.** 2.8.

**Interrupts service?** Requests in flight finish on the old revision. A run mid-execution when the
worker is replaced is re-delivered by BullMQ.

### 2.7 Verify

Run 1.15's four checks, and — **whenever the release touched the provider layer, the model rows or
the binding** — 1.16's token query as well. A release can change which model answers without anyone
intending it, and a stub answer looks exactly like a real one.

### 2.8 Rollback

```bash
# code only, leaving the data alone — try this first
gcloud run services update-traffic tsdg-api --region=<REGION> \
  --to-revisions=<the revision from 2.2>=100

gcloud beta run worker-pools update tsdg-worker --region=<REGION> \
  --image=<the image the old revision ran>
```

**Expected output.** `serving 100 percent of traffic` against the old revision.

**How far back you can go.** Code, immediately. **Schema, only as far as 2.3's backup** — and
restoring it discards every run accepted since. So a release whose migration only added things is
rolled back by code alone; one that removed something is not, which is why 2.5 forbids removal in
the same release.

**Interrupts service?** Briefly, during the traffic switch.

---

## Part III — Rotating a client's signing secret

**From image `1.0.2` onward.** A client that has to change its secret — because it leaked, or
because a policy says so — does not get a new registration. Two commands move it, hours or days
apart, and the old secret keeps working in between.

**Preconditions.** The Cloud SQL proxy and the exported environment of 1.11, including
`API_CLIENT_SECRET_ENCRYPTION_KEY` as in 1.14.

### 3.1 Give the client its new secret

```bash
node scripts/rotateApiClientSecret.js '<the client's name>'
```

**Expected output.** `rotated`, with the new secret printed once. The old secret moves into the
client's previous slot and keeps verifying; the new one is what callbacks are signed with from
this moment.

**Hand the new secret to the client's callback verifier first, and to its request signer second.**
The asymmetry is the one thing that bites here. Inbound requests are checked against both secrets,
so the client may keep signing with the old one for as long as it needs. **Outbound callbacks are
signed with the new one only.** A client whose callback verifier still holds just the old secret
rejects every callback sent during the window with `401`; each is retried seven times over about
an hour and then dropped. Polling still returns the result, so the loss is a notification rather
than a run — but it is a loss, and it is avoidable by ordering the two sides correctly.

**On failure.** `rotation-already-under-way` (exit 1) means a previous rotation was never retired;
run 3.2 first. `client-not-found` (exit 1) means the name is wrong — it is the client's `name`,
not its client key.

**Rollback.** None, and this is deliberate: the old secret is still accepted, so there is nothing
to undo. The new secret cannot be reprinted — a client that lost it rotates again.

**Interrupts service?** No.

### 3.2 Retire the old secret, once the client has deployed

```bash
node scripts/retireApiClientPreviousSecret.js '<the client's name>'
```

**Expected output.** `retired`. From here only the new secret verifies.

**Do not run this until the client confirms it is signing with the new secret.** This is the step
that closes the window, and running it early is indistinguishable, from the client's side, from
the service rejecting valid requests.

**On failure.** `nothing-to-retire` **exits 0** — the slot was already empty, which is what a
second run looks like and is not an error.

**Rollback.** None. The old secret is gone from the row; a client still holding it rotates again.

**Interrupts service?** Only for a client that never deployed the new secret, which this step
assumes has happened.

---

## Chapter 7 — Open issues

**7.1 and 7.2 are closed, and this document is no longer a draft — it has been walked end to
end.** What remains is 7.3's two script traps and 7.4's operational gaps. None of them blocks a
build, and one of 7.4's four closed itself when the driver gained a Vertex AI path.

### 7.1 The service could not run on Cloud Run — **CLOSED, 2026-09-29**

`server/index.js` bound `127.0.0.1` on fixed ports 8001, 3900 and 5800 and read no `PORT`, while
Cloud Run requires `0.0.0.0:$PORT` and exposes one port per service. Done:

- `server/index.js` reads `PORT`, defaulting to 8001, and binds `0.0.0.0`
- **the customer and admin GraphQL engines are removed** (`Q163`) — 19 source files and 10 test
  files. Between them they exposed one operation, `healthCheck`, on a guest allow-list §7 says
  does not exist, and they carried the wildcard CORS, the unauthenticated static mount
  (`Q160`), the upload middleware, the unauthenticated WebSocket transport and the GraphiQL
  console (`Q161`). Removing them closed all of it and left one port to serve
- a `Dockerfile` and a `.dockerignore` exist. The image writes the empty `.env` the framework
  requires, and `.dockerignore` keeps `.env.development` — whose values are published in a
  public repository — out of it

**Verified by running, not by reading.** With `PORT=9123` the service answers `401` to an
unsigned request, `ss` shows `LISTEN 0.0.0.0:9123`, and ports 3900 and 5800 refuse the
connection. Suites after the change: **153 suites / 5192 tests** and **8 / 531**, all passing,
lint clean.

**Left deliberately undone.** Seven GraphQL packages and `express-rate-limit` are now referenced
by no source file in this repository, but `@openreachtech/renchan`'s own barrel may still load
them. Removing them from `package.json` is a separate change that needs that checked first.
`pm2.config.cjs` also describes a process-manager deployment this target does not use.

### 7.2 There was no way to create a production API client — **CLOSED, 2026-09-29**

`api_clients` rows were created only by `sequelize/seeders/development/`, whose secrets are
committed to a public repository, so a freshly built production could not accept a single signed
request. `scripts/registerApiClient.js` now does it, and 1.14 is the step that runs it.

It generates a 48-character key and a 43-character secret, encrypts the secret through the same
`ApiClientSecretCipher` the request path decrypts with, writes the row active with no rotating
secret, and prints both values once.

**Verified end to end, not by reading.** A client registered by the command signed a request the
service answered **`200`**; the same request signed with a different secret was answered
**`401`**. The stored envelope decrypts back to the secret that was printed — which is the one
property a mocked test would have hidden, and is asserted against the real database.

**One defect was found by running it and is fixed.** A refusal printed its reason and then exited
**0**, because `ProcessClerk#exit()` reads `exitCode` and the call named the field `code`, so the
default of 0 applied. A pipeline reads the code and never the text, so the command's only failure
mode was invisible. It exits 1 now, and two tests pin it.

### 7.3 Two traps in the existing scripts

- **`npm run db:seed:master` seeds `dev-master`, not `master`.** The name says one thing and the
  `--seeders-path` says another. 1.12 works around it by naming the path explicitly; the script
  should be corrected so the workaround is not needed.
- **`API_CLIENT_SECRET_ENCRYPTION_KEY` cannot be rotated by replacing the value.** Every stored
  client secret is encrypted under it, so a new value makes all of them undecryptable at once.
  Rotating it means re-encrypting every row, and no tool does that today. **A client's own signing
  secret is a different matter and does rotate** — Part III, from 1.0.2 onward.

### 7.4 Operational gaps this deployment shape creates

- **Log files do not survive.** `MentsuLogger` writes under `logs/` in the working directory, and on
  Cloud Run that filesystem is per-instance and discarded. §22's logging contract therefore produces
  files nobody can read. The logger should write to stdout so Cloud Logging captures it. Related:
  the logger writes **only** under `NODE_ENV=production`, which this deployment does set — so
  production is the one environment where those lines exist at all (`Q149`).
- **Every SQL statement goes to Cloud Logging.** `sequelize/config.cjs` sets `logging: false` for
  `development` only, so `production` takes Sequelize's default of `console.log` (`Q154`). On Cloud
  Run that is cost and noise, and it should be `logging: false`.
- **No TLS option exists on the SQL connection** (`Q24`). Reaching Cloud SQL over the connector's
  unix socket avoids the exposure, which is why 1.9 uses `/cloudsql/<SQL_CONNECTION>` rather than a
  host and port. Do not point `DATABASE_HOST` at a public IP.
- **The provider is reached by a service account, not by an API key — CLOSED.** The driver gained a
  Vertex AI path (`GeminiApiClient.createWithVertexAi()`), the worker calls as its own identity
  under `roles/aiplatform.user`, and no key exists in Secret Manager or anywhere else. A key is
  still read as a fallback when `VERTEX_AI_PROJECT_ID` and `VERTEX_AI_LOCATION` are not both set,
  so the fallback remains available without being configured.

---

## Chapter 8 — What changes when CI runs this

| | |
|---|---|
| Who runs it | A Cloud Build or GitHub Actions service account with the 0.4 roles, not a person |
| Keys | Workload Identity Federation instead of a downloaded key file. No key file is ever written to a runner |
| 2.2's "write it down" | Becomes a build artifact: the two revision names captured as step output, so 2.8 can read them |
| 2.3's backup | Becomes a required step whose failure stops the pipeline, not a judgment call |
| 1.16's switch | **Stays manual.** Turning a real provider on is a deliberate act with a cost attached, and the acceptance criterion says so |
| The smoke check | Runs as a pipeline step, and its four assertions become the gate |

---

## Chapter 9 — Watching production

### 9.1 Where each part stands

```bash
gcloud run services describe tsdg-api --region=<REGION> \
  --format='value(status.conditions[0].message)'
gcloud beta run worker-pools describe tsdg-worker --region=<REGION> \
  --format='value(status.conditions[0].message)'
redis-cli -h <REDIS_HOST> --scan --pattern 'bull:*:meta'

# the worker's own log. Ask for a window or an order, never both
gcloud logging read 'resource.type="cloud_run_worker_pool" AND resource.labels.worker_pool_name="tsdg-worker"' \
  --freshness=1h --limit=50
```

**`--order=asc` makes `--freshness` do nothing, and says so nowhere.** The combination returns the
oldest lines the project holds, which during a crash loop looks exactly like a service that has
been broken since the beginning of time. Drop `--order` and read newest-first, or widen
`--limit`.

### 9.2 The four questions worth a query

```sql
-- is anything stuck?
SELECT s.name, COUNT(*) FROM ai_runs r
JOIN ai_run_statuses s ON s.id = r.ai_run_status_id
GROUP BY s.name;

-- which model is actually answering, this week
SELECT m.name, COUNT(*) FROM ai_model_calls c
JOIN ai_models m ON m.id = c.ai_model_id
WHERE c.created_at > NOW() - INTERVAL 7 DAY GROUP BY m.name;

-- are callbacks landing?
SELECT http_status_code, COUNT(*) FROM ai_run_callback_deliveries
WHERE created_at > NOW() - INTERVAL 1 DAY GROUP BY http_status_code;

-- is retention keeping up? (a copy still at the vendor past its expiry is the backlog)
SELECT COUNT(*) FROM provider_uploaded_files
WHERE provider_purged_at IS NULL AND expires_at < NOW();
```

### 9.3 What a failure reason means

| `failure_reason_code` | What happened |
|---|---|
| `MEDIA_UNREADABLE` | The media URL's host is not in `MEDIA_FETCH_ALLOWED_HOSTS`, or the file could not be fetched. Check the allow-list first |
| `unregistered-callback-url` (a delivery refusal, not a run failure) | The callback URL does not begin with that client's `callback_url_prefix`. Nothing was sent |

### 9.4 The one thing no query will tell you

**Nothing in the running service says the model switch was set wrongly.** A service bound to the
stub answers every request successfully, with token counts and a signed callback. The only signal is
`ai_model_calls.ai_model_id`, which is why 1.16 and 2.7 both end there.

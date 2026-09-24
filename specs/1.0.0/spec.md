<!--
  A blank spec. It gets copied to specs/<version>/spec.md and filled in.

      /hora-spec                        writes it with you, in conversation
      cp specs/skeleton/spec.md specs/1.0.0/spec.md    to fill it in by hand

  Headings and table headers only — nothing here is filled in for you, and
  nothing here explains itself. What each section is for, which ones are
  required, and what makes /hora stop and ask are all in
  .claude/skills/hora/references/spec-format.md. Read that; write this.

  /hora-spec does the copying itself, and writes each section once you have
  read and approved it. Nothing else ever writes into specs/, except
  /hora-plan, one approved edit at a time.

  specs/skeleton/ is not a version. /hora only ever reads directories under
  specs/ whose name is a semver version, so this one is never planned, never
  implemented, and never reported as unfinished.

  The repository layout's Directory column is only for adopting Hora Kit onto
  a repository that already exists under another name. A new project leaves
  the whole column out.

  Sections 9 onward are examples of feature sections, not a fixed list.
  Delete the ones this project has no use for, add the ones it needs, and
  renumber freely — /hora reads `id`, never a section number.

  Section 15 is required, and `none` is a valid body for it. A feature's own
  acceptance criteria stop at that feature's gate, so a behavior that spans
  several features is written there instead — one `###` per version, each with
  its own `id`, and every criterion naming the features it spans. See
  spec-format.md, "A criterion is checked at its own feature's gate" and
  "15. Version acceptance criteria".

  Have documents already? Drop them into specs/<version>/sources/ (things
  that ARE the spec — requirements, an API reference) or annex/ (things that
  EXPLAIN it — mockups, diagrams, an old design doc). Both ship empty.
  /hora-spec's stage 0 reads them, confirms the split with you, and fills in
  the Sources and Annex tables below. Neither directory is required — any
  layout works, and writing the tables by hand works too.

  Only have a rough idea? Put it in specs/<version>/request/ — a mail, a
  ticket, a page of bullets, in your own words — and run /hora-spec. Stage 0
  reads it as what you want this version to do, and the seven stages turn it
  into the sections below, one approved section at a time. Nothing in it
  becomes spec text on its own, and /hora-plan never reads it.

  This whole file is the FIRST version's starting point. From the second
  version on, spec.md is a diff against the version before it — do not copy
  this file into 1.1.0, or twenty empty headings land in a document that only
  needed one new feature. See spec-format.md, "From the second version on".

  A feature section may also carry `<!-- built: spec | backend | frontend -->`,
  and it is deliberately absent from every block below. It is ONLY for adopting
  Hora Kit onto code that already runs — it says how far that feature was
  already implemented, so that working code is not rebuilt — and it must never
  be guessed. /hora-spec confirms it with you, one feature at a time, showing
  what it found — under `Authority: as-built` with the derived gate as the
  default to select; a `to-spec` feature never carries it at all. A new
  project writes it nowhere.

  Section 5's `Baseline:` line is required whenever `Current implementation:`
  is not `none`, and a new project leaves it blank like everything else. It
  says how much of the inherited code this version's tag actually claims:
  `verified`, every existing feature specified and accepted like any other, or
  `inventoried`, which permits a feature to carry
  `<!-- baseline: inventoried -->` and be listed instead — a heading, its
  annotations and one line of prose, built but neither specified nor accepted.
  Write it in this file; a declared Source may not satisfy it. See
  spec-format.md, "5. Existing assets".
-->

# tsdg-ai design document

## 1. Document information

| Item | Content |
|---|---|
| Product version | 1.0.0 |
| Document revision | 1 |
| Author | Hieu Nguyen — Open Reach Tech |
| Question language | English |
| Annotation source | — |

**Project name: `tsdg-ai`**


## 2. Repository layout

| Repository | Origin | Role |
|---|---|---|
| `tsdg-ai-backend` | `renchan` | the REST API and the jobs. Holds the database |

No frontend repository is declared. This service has no screens: its only callers are
another server and an operator working on the machine it runs on.

### 2.1 Servers

| Server | protocol | consumer |
|---|---|---|
| `client-api` | REST | the client system |
| `worker` | — | the API server in the same repository. No contract is cut for it |

**REST rather than the stack's default style, for two of the reasons that count.** The
consumer already exists and already speaks REST — it is another company's backend, not a
frontend built alongside this. And half the contract runs the other way: this service calls
the consumer back on a registered URL when a run finishes, which is a webhook.

**One endpoint, not one per caller.** Every caller is a machine holding the same kind of
identity — a client record and a secret — so a second endpoint would duplicate the
signature filter without separating anything. The run list is narrowed to the calling
client inside the query rather than in any interface, so an operator read across clients
is a second query and not a rewrite. The first human identity this service would hold
arrives with the admin console, which this version defers and which is a surface of its own.


## 3. Actors and roles

| Actor | Identified by | Roughly how many | Inside / outside |
|---|---|---|---|
| client system | an `x-ort-client-id` issued by ORT, plus an HMAC signature over `timestamp + "." + rawBody` | 1 registered client at launch | outside |
| ORT operator | access to the machine the service runs on. This version issues them no client id and no login: they reach the service through the read-only command, which reads the database directly | a handful | inside |

The asset owner — the person who presses the button in the client system's wizard and
chooses Use or Dismiss — is **not** an actor of this service. This service accepts no
end-user connection and never writes their record; the deciding step belongs to the
client system.


## 4. Implementation scope

### Built this time (1.0.0)

- Accepting a signed, idempotent request and answering with a run key (#run-contract)
- Recording a run, its steps and its model calls (#run-record)
- Executing a run in a worker, dispatched only once the creating transaction has committed (#run-execution)
- Delivering the result on a signed callback, and reading it back by run key (#run-delivery)
- Listing runs, filtered and paginated, scoped to the calling client (#run-list)
- Canceling a run at a step boundary (#run-cancel)
- A read-only operator command that finds runs without a run key in hand (#operator-cli)
- The provider layer — stub by default, with prompts, tool schemas and models held as data (#provider-layer)
- Fetching media through a host allow-list, with size caps and an egress record (#media-fetch)
- Purging content and the decision trace on two separate clocks (#retention)
- Field suggestions from an asset's photos (#asset-media-extraction)

Reconsider 1.0.0's scope when: milestone 1 closes with more than two features
unaccepted, or any one feature is sent back twice.

### Out of scope for now (to be built later)

- Progress while a run is going — an event at each step boundary, and the operator's live stream (#run-progress) → no version yet. Once a service whose runs last minutes rather than seconds is scheduled. Deferred because the client already reads the run back and the operator has the command, so no stated use case is impossible without it. Seam: the worker already records every step boundary in the decision trace, so emitting from those boundaries later changes no step and no run
- Video among an asset's media → no version yet. Once the client's upload wizard accepts video. Seam: a medium's kind is a value the request already carries, so adding a kind changes no request shape, and a kind this version does not handle is refused by name rather than ignored
- Reading legal documents → no version yet. Needs the legal-document catalogue per asset group and the fields to read. Seam: the run contract, the step trace and the consensus settlement are shared by every service, so a new service is a new loop rather than a new contract
- The session outreach pack → no version yet. Needs the notice template after legal review, the prohibited-phrase list, and the tone. Seam: as above, and the prohibited-phrase list is data with history rather than code
- Clause extraction from case documents, and answering bidders with verified citations → no version yet. Needs the schedule for porting sessions, case documents and bidder questions to the client's own backend. Seam: as above
- An admin console, with accounts, sessions and roles of its own → no version yet. It carries an estimate separate from the AI services, and would be the first human identity this service holds. Seam: the run list is scoped by the calling client inside the query rather than in any interface, so an unscoped operator read is a second query and not a rewrite
- The calibration target — a High-band suggestion correct at least 90% of the time, Medium at least 70% → no version yet. Needs a labelled gold set drawn from the client's asset-type catalogue, and a decision on who labels it. Seam: the confidence formula carries a version and every run records which version scored it, so recalibrating is a new version of the formula rather than a change to any run
- Integration with the client's own system — their suggestion layer, their callback controller, a staging run through their wizard → after this version is finished. It is stated as not what this version is measured by
- System-level monitoring — alerting, health checks and error aggregation → no version yet. Needs the service's SLA: the uptime target, who is reachable out of hours, and the response time for an incident. No alert threshold can be chosen before that number exists. Seam: the read-only operator command already answers "which runs are stalled" and "which have failed since when" in one invocation, so wiring it into a scheduled check or an alerting tool later adds no query

### Permanently out of scope

- Writing anything into the client's database. Build no bypass layer: this service holds no connection string of theirs
- Holding business state — field schemas, clause sets, session facts. They travel with each request and are used only within the run, so a change on their side needs no deployment here
- Retrying a model call automatically. A silent retry multiplies cost and hides a systematic failure; the caller resubmits under a new idempotency key instead
- Deciding anything — approving a record, confirming a clause, composing what an outside party reads, choosing recipients. The result shape carries no field by which any of it could be done
- Accepting a connection from an end user. This service authenticates machines only, and no endpoint accepts an end-user login
- Organisation capability data, and any ranking model built on it


## 5. Existing assets

Current implementation: none (new). Three unrelated services are used as material, extracted under `annex/reference/`
Treatment: port it — `rgp-yazaki`'s document-reading layer and `leepai`'s multi-provider layer are read and moved; `linoa`'s REST renderer is referenced only (match the behavior, rewrite the implementation)
Authority: not applicable — no implementation of this product exists
Baseline: not applicable — no implementation of this product exists


## 6. Terminology and domain concepts

| Term | Description |
|---|---|
| run | one execution of one AI service, created by one request and identified by a run key. Every service produces one |
| run key | the identifier of a run, returned at request time and used to read the run back |
| client system | the registered caller. Holds a client id and the shared secret the signature is computed with |
| idempotency key | a value the caller sends so a repeated request returns the run it already created, rather than starting a second one |
| callback | the signed request this service sends to the client system's registered URL when a run progresses or finishes |
| step | one stage of a run. A step is either code or a model call, and each one is recorded |
| model call | one request to an AI provider, recorded with its model, its token counts and its outcome |
| provider | the outside service that runs a model. Reached only through a client module |
| stub | the provider driver that answers deterministically without calling anybody. The default in every environment |
| egress record | the record of a file handed to a provider — what was sent, where, and when |
| media allow-list | the set of hosts this service may fetch a file from. A URL on any other host is refused |
| field schema | the list of fields the client system sends with a request, saying what may be suggested and what each field accepts |
| suggestible field | a field whose kind this service can propose a value for. Today: text, number and select |
| evidence kind | what a reading was based on — visible text, a visual estimate, or a category prior. It weights the confidence |
| absolute majority | agreement by more than half of the readings. Without one, no value is returned |
| confidence | a number from 0 to 1 computed by code from the observed agreement and the evidence kind. Never a number a model declared |
| field state | what a returned field is — extracted, derived, suggested, or missing |
| media signature | a value derived from a request's media, which makes the stub's answer deterministic for the same input |
| decision trace | the record of how a run reached its result — step names, reason codes, agreement counts, confidence, prompt version. Retained separately from content |
| content | media, documents, question text and raw model output. Retained on its own clock, shorter than the trace |
| reason code | a code plus JSON parameters returned in place of a human sentence. The client system builds the wording people read |


## 7. Non-functional requirements

| Item | Requirement |
|---|---|
| Volume | ~100 runs a day at launch, ~1,000 a day foreseen within two years. One run is one deliberate press by an asset owner, and is charged as one |
| Callers | one registered client system at launch, plus one client id issued for operation. The client record is built for several from the first day |
| Heaviest operation | one asset-media-extraction run: up to 12 photos fetched through the allow-list and handed to a provider, then read 3 times, each reading forced through a single tool call. It must stay separable — a queue of its own, and a server of its own later if it needs one |
| Response | no caller ever waits for a result. Every request is answered with a run key, and the result arrives on a callback or is read back by that key |
| Availability | working hours, on ORT's own machine, operated by ORT. An hour's outage is tolerable and a day's is inconvenient rather than blocking — the asset owner fills the fields in by hand instead |
| Retention | content 30 days; the decision trace 730 days. Two separate settings, never one |
| Media limits | 10 MB per photo, and at most 12 photos in one request — matching the client's own upload limit, so nothing is refused twice for different reasons |
| Run time limit | 300 seconds. A run still going past it ends as failed |
| Readings | each medium is read 3 times, and a value is settled by absolute majority across those readings |
| Security level | high. An asset photo is treated as personal data: it may carry a face, a plate or a document in frame, and at the moment the owner presses the button the posting is not yet public. The stub is the default in every environment, and turning a real provider on is a recorded decision — its date, its environment and its model |
| Test engine | the automated suite runs on SQLite, which is what the boilerplate fixes `development` to; MariaDB is what the manual-verification stack brings up and what runs live. The two are deliberate, and the gap is a known risk: `text('medium')`, `json` and `datetime(3)` behave differently on the two engines, so a type error can pass the suite and appear only on the engine that runs live |
| External dependencies | the AI providers, and the client's own file storage. Either can be slow or unavailable; no model call is retried automatically, and the caller resubmits under a new idempotency key |
| Logging | ids, latency, token counts, reason codes and error codes only — no image, document or question content anywhere |
| Authentication | every request is signed, and every route runs the filter. Nothing is reachable without it: no public route, no health check, no guest allow-list. Adding one later is a recorded decision, not a habit |
| Authorization | every operation names its caller in its own table. A run belongs to the client that created it; a request for another client's run answers as though it did not exist rather than admitting that it does |
| Personal data | the asset's field values and the media URLs, which arrive inside the request body; the suggested values in the result body; the raw model output; and the subject label, which the caller writes and which may name a place or a person. All four are content, purged on the content clock. The decision trace carries none of them |
| Secrets | the key the client secrets are encrypted under, the provider keys, and the read-only credential for fetching the client's files. Each is issued by ORT and read only inside the module that needs it. A client secret is never returned by any operation and never logged, in either its live or its rotating form |
| Rate limiting | the run-creating request is limited per client. The idempotency key stops a repeat of the same request; it does nothing about a thousand different ones, and each run costs three model readings |
| Exposure | only the API server accepts a connection. The data store, the queue's store and the worker are not reachable from outside |
| Uploads | none. Media arrives as a URL this service fetches from an allow-listed host; nothing is uploaded to this service, so there is no upload to validate |
| Cross-origin requests | refused entirely. Every caller is a server, and no browser reaches this service directly |
| Error leakage | a refusal carries a reason code and its parameters, never a message built from internals. Parameters carry metadata — a path, a length, a count — never a value read from a photo |


## 8. Manual verification

| Middleware | Version | profile | Purpose |
|---|---|---|---|
| MariaDB | 10.5.12 | (default) | the primary data store |
| Redis | 7.4 | (default) | the queue's store |


## 9. Run contract
<!-- id: run-contract -->
<!-- target: backend -->
<!-- depends: none -->

Delivers the shared entry every AI service is reached through: the REST engine, the
per-request context that resolves a client from its signature, the base renderer a
service's POST extends, and the run record itself. It declares no route of its own —
a concrete route belongs to the service that answers it.

There is no operation for rotating a client's secret this version. A rotation is a direct
database write, made by an operator on the machine, and the window in which both secrets
are accepted is what keeps it from being an outage.

### Data model

#### `api_clients`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `name` | string | NOT NULL | who the client is, for an operator reading a list |
| `client_key` | string | NOT NULL, unique | the value a caller sends to identify itself |
| `secret_ciphertext` | text | NOT NULL | the shared secret, encrypted at rest |
| `previous_secret_ciphertext` | text | NULL | the secret being rotated out; accepted while it is set |
| `callback_url_prefix` | text | NOT NULL | a callback is refused unless its URL starts with this |
| `is_active` | boolean | NOT NULL | a client switched off is refused without being deleted |
| `registered_at` | datetime(3) | NOT NULL | UTC |

#### `ai_run_categories` — master

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | int | PK | |
| `name` | string | NOT NULL, unique | the system key — one per AI service |
| `display_name` | string | NOT NULL | |
| `display_order` | int | NOT NULL | |
| `is_active` | boolean | NOT NULL | |

One row seeded this version, for asset media extraction. Each later service adds a row, never a column.

#### `ai_run_statuses` — master

Same shape as `ai_run_categories`. Seeds queued, running, succeeded, failed, canceled.

#### `ai_runs`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `ApiClientId` | bigint | NOT NULL, indexed | the client that created it |
| `AiRunCategoryId` | int | NOT NULL | which service this run is |
| `AiRunStatusId` | int | NOT NULL, indexed with `started_at` | |
| `run_key` | string | NOT NULL, unique | the identifier the caller holds |
| `request_key` | string | NOT NULL, **unique with `ApiClientId`** | the caller's idempotency key |
| `request_body_hash` | string | NOT NULL | so the same key with a different body can be refused |
| `external_ref` | string | NOT NULL | the caller's own object key. Never interpreted |
| `subject_label` | text | NOT NULL | one human-readable line from the caller, echoed back untouched |
| `correlation_id` | string | NOT NULL, indexed | groups the runs belonging to one business object |
| `callback_url` | text | NOT NULL | where the terminal callback goes |
| `request_body` | text('medium') | NULL once purged | content |
| `result_body` | text('medium') | NULL until it succeeds, and once purged | content |
| `failure_reason_code` | string | NULL | set only on failure |
| `failure_parameters` | json | NULL | the code's own parameters — genuinely schemaless per code |
| `engine_label` | string | NULL | which loop and model produced the result |
| `accepted_at` | datetime(3) | NOT NULL | UTC |
| `started_at` | datetime(3) | NULL until a worker picks it up | |
| `finished_at` | datetime(3) | NULL until terminal | |
| `cancel_requested_at` | datetime(3) | NULL | |
| `canceled_at` | datetime(3) | NULL | |
| `content_purged_at` | datetime(3) | NULL | distinguishes purged from never having carried content |

The unique pair of client and request key is the whole of idempotency: the same key
returns the same run, and a second run for it cannot exist.

### Use cases
<!-- usecases -->

- the client system signs a request with its client id and secret, and receives a run key back before any work has begun
- the client system, unsure whether its request arrived, sends it again under the same idempotency key and gets back the run it already created instead of a second one
- ORT rotates a client's secret without an outage, because both the old and the new secret are accepted while the rotation is under way

### Acceptance criteria
<!-- acceptance -->

- a request whose signature is the hex HMAC-SHA256 of `timestamp + "." + rawBody` under the client's secret is accepted; one whose body differs from the signed body by a single byte is refused and writes no run
- a request whose timestamp is more than 300 seconds from the server's clock, in either direction, is refused
- a request carrying no idempotency key is refused
- the same idempotency key with the same body returns the run created the first time, answering in the same shape and carrying that run's status as it now stands, and no second run exists for it
- the same idempotency key with a different body is refused with `409`, and the first run is unchanged
- a request missing any of the four required common fields — the caller's object key, the subject label, the correlation id, the callback URL — is refused
- a newly accepted request answers with the run key, the run kind, a status of queued and the accepted time, and nothing else
- while a rotation is under way, a signature computed with either of the client's two valid secrets is accepted
- a request carrying no signature, or one signed with a secret that is not this client's, is refused before any handler runs and writes nothing
- a request from a client whose record is switched off is refused, and creates no run


## 10. Run record
<!-- id: run-record -->
<!-- target: backend -->
<!-- depends: run-contract -->

### Data model

#### `ai_run_step_categories` — master

Same shape as the other masters. Seeds code, ai, human.

#### `ai_run_steps`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `AiRunId` | bigint | NOT NULL, indexed | |
| `step_index` | int | NOT NULL, unique with `AiRunId` | the order it ran in |
| `step_name` | string | NOT NULL | which step this was |
| `AiRunStepCategoryId` | int | NOT NULL | code, ai or human |
| `outcome_code` | string | NOT NULL | how the step ended |
| `rejected_items` | json | NULL | what this step dropped, and why: the field path, the reason code, and figures such as a length or an agreement count. **Never the value itself** — the trace outlives the content, and a value kept here would survive the purge meant to remove it |
| `reason_code` | string | NULL | the step's own reason, where it has one |
| `started_at` | datetime(3) | NOT NULL | UTC |
| `finished_at` | datetime(3) | NULL while it is running | |

Part of the decision trace, so it is kept on the long clock and never purged with content.

#### `ai_run_field_statuses` — master

Same shape as the other masters. Seeds extracted, derived, suggested and missing.

#### `ai_run_evidence_categories` — master

Same shape as the other masters. Seeds the kinds of evidence a reading can rest on:
something visible in the medium, an estimate made from it, and a prior drawn from the
category the subject belongs to.

#### `ai_run_field_outcomes`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `AiRunId` | bigint | NOT NULL, indexed | |
| `field_path` | string | NOT NULL, unique with `AiRunId` | which field was settled |
| `AiRunFieldStatusId` | int | NOT NULL | what the field came out as |
| `AiRunEvidenceCategoryId` | int | NULL when nothing was settled | what the majority reading rested on |
| `suggestion_confidence` | decimal | NULL when nothing was settled | the score, as computed |
| `agreed_reading_count` | int | NOT NULL | how many readings agreed |
| `total_reading_count` | int | NOT NULL | out of how many |
| `confidence_method_version` | string | NOT NULL | which version of the formula scored it |
| `settled_at` | datetime(3) | NOT NULL | UTC |

**This is how a run answers for itself once its content is gone.** The confidence, the
agreement counts and the version of the formula that produced them are decisions, not
content, so they live on the long clock beside the step trace — and none of this table
holds a value read out of a medium. Without it the retention promise could not be kept:
the scores lived only in the result body, which is purged at thirty days, and no column
held the formula's version at all.

Recalibrating the formula later reads two years of these rows, which is what makes the
deferred calibration target reachable rather than a wish.

### Use cases
<!-- usecases -->

- an operator asked what a run actually did reads it back with its steps in the order they ran, each saying what it was and how long it took
- an operator asked why a run returned no value for a field reads the agreement counts and reason codes recorded against the step that settled it

### Acceptance criteria
<!-- acceptance -->

- every run carries one of five statuses — queued, running, succeeded, failed, canceled — and a run never leaves succeeded, failed or canceled once it is there
- a run whose result is legitimately empty is recorded as succeeded, not as failed
- each step of a run is recorded in the order it ran, and says whether it was code or a model call
- a failed run records a reason code; a succeeded run records none
- the time cancellation was asked for and the time it took effect are recorded separately, so the gap between them is measurable
- a field a run settled is recorded with its state, its confidence, how many readings agreed out of how many, and the version of the formula that scored it — and none of that is content, so none of it is removed by the content purge


## 11. Run execution
<!-- id: run-execution -->
<!-- target: backend -->
<!-- depends: run-record -->

No table of its own. Delivers the worker process, its queue connection, the rule that a
run's job is dispatched only after the creating transaction commits, and the run's time
limit. The concrete job of a service belongs to that service.

### Background jobs

| Job | Trigger | Queue | Payload | Why not in the request path |
|---|---|---|---|---|
| (the shape every run job takes) | a service's POST, after commit | one per service | `{ aiRunId }` | a run calls a model and fetches files from elsewhere; either can be slow or down, and the caller is answered before any of it starts |

The body carries an id and nothing else: everything a worker needs is re-read from the
database, so a job body can never disagree with the record.

### Use cases
<!-- usecases -->

- the client system gets its run key at once and the work happens afterwards, so its own request never waits on a model
- a run that was accepted is still executed after the process that accepted it has restarted
- a run that has been going too long stops by itself instead of holding a worker indefinitely

### Acceptance criteria
<!-- acceptance -->

- the job for a run is dispatched only after the transaction that created the run has committed; a transaction that rolls back dispatches nothing
- a run accepted while no worker is running is executed once a worker starts
- a model call is never retried automatically: a run that fails on a provider error reports it rather than calling again
- a run still running past the time limit ends as failed, carrying the time-limit reason code
- a run's status moves from queued to running to exactly one terminal state


## 12. Run delivery
<!-- id: run-delivery -->
<!-- target: backend -->
<!-- depends: run-execution -->

### Data model

#### `ai_run_callback_delivery_categories` — master

Same shape as the other masters. Seeds one row this version, for the terminal callback.
The deferred progress callback is a second row, not a second column.

#### `ai_run_callback_deliveries`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `AiRunId` | bigint | NOT NULL, indexed | |
| `AiRunCallbackDeliveryCategoryId` | int | NOT NULL | which callback this was |
| `attempt_index` | int | NOT NULL | which try |
| `http_status_code` | int | NULL when the request never completed | |
| `attempted_at` | datetime(3) | NOT NULL | UTC |

No response bodies are stored: a delivery record says whether it arrived, not what came back.

### RESTful API

| method | path | renderer | request | response | caller |
|---|---|---|---|---|---|
| `GET` | `/v1/ai-runs/:runKey` | `AiRunGetRenderer` | path `runKey`, optional `?expand=steps` | `AiRunResponse` — the same body the terminal callback carries, plus the step trace when asked for | the client system that created the run. Another client's run key answers as though it did not exist |

### Background jobs

| Job | Trigger | Queue | Payload | Why not in the request path |
|---|---|---|---|---|
| deliver a run's terminal callback | a run reaching succeeded, failed or canceled | `deliver-run-callback` | `{ aiRunId }` | it posts to somebody else's server, which can be slow or down, and it is retried until it lands |

### Use cases
<!-- usecases -->

- the client system learns a run has finished without polling, because the service posts the result to the URL it registered
- the client system that missed a callback reconciles by reading the run back by its key, and gets the same answer
- the client system satisfies itself that a callback really came from this service before acting on it

### Acceptance criteria
<!-- acceptance -->

- every run reaching succeeded, failed or canceled produces one terminal callback to the client's registered callback URL
- a callback URL that does not match the client's registered prefix is not called at all
- a callback is signed the same way a request is, and additionally carries the run key in a header
- reading a run back by its key returns the same body the terminal callback carried
- asking for the step trace adds it to that response, and a response that did not ask for it carries none
- a failed run's body carries a reason code and its parameters, and no result
- a canceled run's body reports the model calls and tokens spent up to the stop
- a callback that fails to deliver is retried, though a model call in the same run is not
- reading a run that belongs to another client answers as though the run did not exist, and says nothing about whether it does


## 13. Run list
<!-- id: run-list -->
<!-- target: backend -->
<!-- depends: run-delivery -->

No table of its own. Reads the run record and its steps.

### RESTful API

| method | path | renderer | request | response | caller |
|---|---|---|---|---|---|
| `GET` | `/v1/ai-runs` | `AiRunsGetRenderer` | `?statusName=&runCategoryName=&correlationId=&stalledForSeconds=&limit=&cursor=` | `AiRunsResponse` — one row per run with its subject, category, status, decomposed running state, elapsed time and token spend, plus the cursor for the next page | the client system, its own runs only. The scope is bound from the signature; no request parameter widens it |

Pagination is by cursor rather than offset: a list filtered by status is read while runs
are still changing status, and an offset page would skip or repeat rows as they move.

### Use cases
<!-- usecases -->

- the client system asks how far along the AI work is for one business object, and gets every run grouped under that correlation id in one answer
- the client system looks for runs that have stalled past a threshold and gets them in one request, instead of reading back every run key it happens to hold
- the client system reads one row and can say what a run was about, what state it is in, how long it has taken and what it has spent, without joining anything of its own

### Acceptance criteria
<!-- acceptance -->

- the list returns only runs belonging to the calling client, whatever the request asks for
- a run in progress reports which step it is on, and which reading of how many, rather than only that it is running
- one row carries the subject label, the run kind, the status, the elapsed time and the token spend
- runs stalled beyond a given number of seconds are retrievable in one request
- the subject label is returned exactly as the caller supplied it, never reinterpreted
- filtering by correlation id returns every run for that object, whichever service produced it
- the list is paginated, and a page states how to ask for the next one
- a list is scoped to the calling client from its signature, and no request parameter widens it to another client's runs


## 14. Run progress
<!-- id: run-progress -->
<!-- target: backend -->
<!-- depends: run-delivery -->
<!-- kicked: yes -->

### Use cases
<!-- usecases -->

- the client system shows a person "reading 2 of 3" instead of a mute spinner, because progress arrives while the run is still going
- an operator follows one run live from a terminal, with no console built for it
- a client system that received two progress events out of order can tell which is stale, and ignores it

### Acceptance criteria
<!-- acceptance -->

- a progress event fires when a run starts running, at each step boundary, and after each reading
- a progress event carries step names, counts and ratios, and no content of any kind
- a progress event carries an increasing step index, so a receiver can detect reordering and duplicates
- a progress delivery that fails never fails the run: only the terminal callback is guaranteed
- progress emission is rate-limited per run, so a long run cannot flood the callback URL
- a caller that asked for no progress receives none, and still receives its terminal callback
- an operator can follow one run's events live over a stream, authenticated exactly as any other caller is


## 15. Run cancellation
<!-- id: run-cancel -->
<!-- target: backend -->
<!-- depends: run-execution -->

No table of its own. Writes the two cancellation timestamps already on the run record.

### RESTful API

| method | path | renderer | request | response | caller |
|---|---|---|---|---|---|
| `POST` | `/v1/ai-runs/:runKey/cancellations` | `AiRunCancellationPostRenderer` | path `runKey`, empty body | `AiRunCancellationResponse` — the run's status after the request, which is its terminal state when it had already reached one | the client system that created the run. Another client's run answers as though it did not exist |

A cancellation is a resource that is created, not a field that is set, so asking twice
creates nothing the second time and answers with the state that already holds.

### Use cases
<!-- usecases -->

- the client system cancels a run whose result stopped being wanted, and nothing is spent on model calls made after that point
- the client system that cancels a run which has already finished gets that run's real state back, rather than an error it has to handle
- ORT measures how long canceling actually takes, because a run stops at a step boundary rather than instantly

### Acceptance criteria
<!-- acceptance -->

- a queued run that is canceled leaves the queue and ends canceled, having made zero model calls
- a running run stops at the next step boundary, never mid-step
- a provider call in flight is aborted, and the tokens spent up to the abort are still recorded
- cancellation is terminal, and always delivers a terminal callback
- canceling a run that has already reached a terminal state returns that state, not an error
- only the client that created a run may cancel it; any other caller is refused
- a canceled run is distinguishable from a failed run in the list
- canceling another client's run answers as though the run did not exist, and that run is left unchanged


## 16. Operator CLI
<!-- id: operator-cli -->
<!-- target: backend -->
<!-- depends: run-list -->

No table and no route. A standalone script that opens the database directly, so it answers
while the API is not serving.

### Commands

| Command | Answers | Reads |
|---|---|---|
| stalled runs | runs that have been running longer than a given number of seconds | across every client |
| failed runs | runs that failed since a given time | across every client |
| one run | one run with its steps in order | across every client |
| one correlation chain | every run under one correlation id | across every client |

Every command is read-only and prints ids, states, timings, counts and reason codes. It
never prints a request body or a result body, which is stricter than any API caller.

### Use cases
<!-- usecases -->

- an operator finds the run they need without a run key in hand — stalled past a threshold, failed since a given time, or every run under one correlation id
- an operator still reads what the runs are doing when the service will not boot, because the command does not depend on the service answering requests
- an operator pastes a run check into a runbook step or a scheduled task, because it is a command rather than a screen

### Acceptance criteria
<!-- acceptance -->

- the CLI answers without a run key: runs stalled beyond a threshold, runs failed since a given time, one run with its steps, or every run under one correlation id
- the CLI reads across clients, not only one
- the CLI never prints request or result content — ids, states, timings, counts and reason codes only
- no command the CLI offers changes any run's state
- a row the CLI prints carries the same facts a list row carries: subject, kind, status, elapsed time, token spend


## 17. Provider layer
<!-- id: provider-layer -->
<!-- target: backend -->
<!-- depends: run-contract -->

Ported as a set from `annex/reference/leepai/`. The tables below are that store; their
column detail is in the extract, and the port is expected to match it rather than restate it.

### Data model

| Table | Key columns | Why it exists |
|---|---|---|
| `ai_providers` | `name` | one row per vendor |
| `ai_models` | `AiProviderId`, `name`, `target_model_name`, `is_default`, `is_active`, `display_order` | the app-facing model name and the vendor's own model id, as data. Adding a model is a row plus one driver class; nothing that *uses* a model changes |
| `ai_model_calls` | `AiRunId`, `AiModelId`, `action_name`, `reading_index`, `prompt_version`, `latency_milliseconds`, `input_token_count`, `output_token_count`, `response_body` (NULL once purged), `called_at` | one row per call a run made. It sits here rather than with the run record because a call is only meaningful against the model that answered it, and that catalog is this feature's |
| `ai_model_capabilities` | `AiModelId`, `context_window_token`, `max_output_token` | the limits a payload is built against |
| `ai_tools` | `name`, `description`, `payload` (TEXT, a stringified JSON schema), `is_visible`, `display_order` | a tool schema is data: changing what a step may return needs no deployment |
| `ai_agents` | `name`, `description`, `registered_at`, `saved_at` | one agent per AI service |
| `ai_agent_default_instructions` | `AiAgentId`, `instruction` (TEXT), `saved_at` | the agent's own instruction |
| `ai_agent_default_instructions_bk` | identical columns | the write-once history sink |
| `ai_agent_role_instructions` | `AiAgentId`, `role` (TEXT), `saved_at` | the system prompt |
| `ai_agent_role_instructions_bk` | identical columns | the write-once history sink |
| `ai_agent_default_models` | `AiAgentId`, `AiModelId`, `saved_at` | which model an agent uses, as data. Not read this version — `ai_models.is_default` is the authority on which model answers |
| `ai_agent_available_ai_tools` | `AiAgentId`, `AiToolId`, `is_enabled`, `is_default` | which tools an agent may use |

Every editable text is written through the backup mixin, so the live row always holds the
current value and every prior version is retained. There is no path that overwrites one
without recording what it replaced.

The stub is a driver in this set, not a test double: it is what a default installation
runs, so the whole path — the job, the steps, the record, the callback — is exercised on
a machine with no key.

There is no operation for editing a prompt this version. A change is a direct database
write, made by an operator on the machine. That is what "without deploying" means here —
the admin console that would give it a surface is deferred.

### Use cases
<!-- usecases -->

- ORT installs the service on a machine with no API key and no outbound access, and the provider layer answers on the stub: nothing reads a key and nothing opens a connection
- ORT changes the Vietnamese wording a service sends to a model without deploying anything, because prompts are data rather than code
- ORT reproduces a result from months ago, because the prompt version each call used is recorded against it
- ORT adds a model without touching the services that use one
- ORT bills a run by reading the model calls recorded against it, including the calls a canceled run had already spent

### Acceptance criteria
<!-- acceptance -->

- a default installation answers every service on the stub: no key is read and no outbound connection is opened
- the stub returns the same answer every time for the same input
- turning a real provider on is a deliberate change of one setting — `ai_models.is_default` — and any run that used one records which model answered
- prompts, roles, tool schemas and models are read from the database, and changing one needs no deployment; adding a vendor's model still ships a driver class
- every change to a prompt or a role leaves the previous version readable
- every model call records the prompt version it used
- each model call is recorded with its model and its input and output token counts; the outcome is the run step's (`ai_run_steps.outcome_code`), and a recorded call is one that answered
- no code outside the client modules opens an outbound connection


## 18. Media fetching
<!-- id: media-fetch -->
<!-- target: backend -->
<!-- depends: run-execution -->

### Data model

#### `ai_run_media_categories` — master

Same shape as the other masters. Seeds image, video and audio — the kinds a request may
name. Only image is handled this version; the other two exist so a request naming one is
refused by name rather than ignored.

#### `ai_run_media`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `AiRunId` | bigint | NOT NULL, indexed | |
| `media_key` | string | NOT NULL | the caller's own id for this file. Echoed back, never interpreted |
| `AiRunMediaCategoryId` | int | NOT NULL | what the caller said this file is |
| `mime_type` | string | NOT NULL | borrowed verbatim from the standard |
| `byte_size` | bigint | NOT NULL | checked against the cap before anything is sent |
| `is_readable` | boolean | NOT NULL | false when it was fetched but could not be read |
| `fetched_at` | datetime(3) | NULL until it is fetched | UTC |

No file bytes are stored here. The temporary copy lives on the worker's disk for the
length of the run and is deleted when the run ends.

#### `provider_uploaded_files`

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | bigint | PK | |
| `AiRunMediaId` | bigint | NOT NULL, indexed | which file left |
| `AiProviderId` | bigint | NOT NULL | who received it |
| `provider_file_name` | text | NOT NULL | what the provider calls it |
| `uploaded_at` | datetime(3) | NOT NULL | UTC |
| `expires_at` | datetime(3) | NULL when the provider states none | UTC |

This is the egress record: the answer to "which file left this machine, to whom, and
when", kept independently of whether the run's content still exists.

### Use cases
<!-- usecases -->

- ORT fetches the files a run needs from the client's storage, and refuses a URL that points anywhere else
- ORT answers, months later, exactly which file was handed to which provider and when
- a run given a file too large to process fails with a reason the caller can act on, before anything has been sent to a provider

### Acceptance criteria
<!-- acceptance -->

- a file URL whose host is not on the allow-list is refused, and nothing is fetched
- byte size is checked before anything reaches a provider, and a file over the cap fails the run with the limit named in the reason's parameters
- every file handed to a provider is recorded, with which provider received it and when
- a file that could not be fetched at all fails the run with a fetch reason code, distinct from one that was fetched but could not be read
- the temporary copy of a fetched file is deleted when the run ends
- no fetched file is kept in long-term storage


## 19. Retention
<!-- id: retention -->
<!-- target: backend -->
<!-- depends: run-record, provider-layer, media-fetch -->

No table of its own. Clears content columns in place and records when it did.

### Background jobs

| Job | Trigger | Queue | Payload | Why not in the request path |
|---|---|---|---|---|
| purge expired run content | a daily schedule | `purge-expired-run-content` | none | nothing requests it, and it reads far more rows than any request does |
| purge expired run traces | a schedule on the longer horizon | `purge-expired-run-traces` | none | as above |
| purge expired provider uploads | a daily schedule | `purge-expired-provider-uploads` | none | it calls a provider to delete what was uploaded, which is an outbound call nobody is waiting on |

Purging content sets the content columns to null and stamps the run as purged, so a run
whose content is gone stays distinguishable from one that never carried any.

### Use cases
<!-- usecases -->

- ORT deletes the content of a run once it is no longer needed, on a clock of its own
- an operator answering a dispute raised long after the auction closed still reads why a run decided what it did, even though the content itself is long gone
- ORT changes how long content is kept without changing how long the decision trace is kept

### Acceptance criteria
<!-- acceptance -->

- content and the decision trace are purged on two separate settings, and never on one
- after content is purged, the run's outcome, reason codes, model, prompt version, confidence, agreement counts, token counts and step trace all stay readable
- a run whose content has been purged is distinguishable from one that never carried any
- a run past the content horizon but inside the trace horizon still answers why a value was or was not produced
- files uploaded to a provider are expired on a schedule of their own


## 20. Asset media extraction
<!-- id: asset-media-extraction -->
<!-- target: backend -->
<!-- depends: run-delivery, provider-layer, media-fetch -->

No table of its own. The field schema, the asset's category and the media list all travel
with the request and are used only within the run, so a change to the client's own field
schema needs no deployment here.

### The run's steps

| # | Kind | What it does |
|---|---|---|
| 1 | code | keeps only the fields whose kind can be suggested — text, number and select. With nothing left it returns no fields and calls no model |
| 2 | code | fetches the media through the allow-list, checks the size caps, hands the files to the provider and records the egress |
| 3 | ai, once per reading | reads the media, each reading forced through a single tool call. Each item returned carries its field path, its value, its evidence kind, a one-line reason, and the photos it came from |
| 4 | code | drops whatever the schema does not allow: a path outside it, a select value not among the options sent, a number failing the form or the range, a value over the stated length, a photo that was not among those sent |
| 5 | code | settles the readings by absolute majority. Without one the field is not returned, and a required field is reported as missing |
| 6 | code | scores the confidence from the observed agreement and the evidence kind, and sets the field's state |
| 7 | human | the asset owner presses Use or Dismiss in the client system. Not this service's step, and written here so the boundary is on the record |

Only step 3 asks a model anything, and what it may answer is bounded by a tool schema held
as data. Every answer it gives passes step 4 before it can reach step 5.

### RESTful API

| method | path | renderer | request | response | caller |
|---|---|---|---|---|---|
| `POST` | `/v1/asset-media-extractions` | `AssetMediaExtractionPostRenderer` | `AssetMediaExtractionRequest` — the four common fields, plus `asset` (the category slugs and the province), `fieldSchema[]` (`path`, `label`, `valueKind`, `isRequired`, and per kind `unit` / `maxLength` / `options[]`), `media[]` (`mediaKey`, `mediaCategoryName`, `url`, `mimeType`, `byteSize`), and `mediaSignature` | `AiRunAcceptedResponse` — the run key, the run category, a status of queued, and the accepted time | any client whose record is active, with a valid signature |

The result the terminal callback carries, and the same body the run reads back as:

| Field | What it holds |
|---|---|
| `fields[]` | one entry per settled field: `path`, `value`, `fieldStateName`, `suggestionConfidence`, `reason`, `sourceMediaKeys[]`, and `agreement` — how many readings agreed, out of how many |
| `missingFieldPaths[]` | required fields no majority settled. Never a guess, never a zero |
| `unreadableMediaKeys[]` | what was fetched but could not be read |
| `mediaSignature` | echoed back, so a caller can tell which request an answer belongs to |

A request carries two words that look like the same idea and are not. `mediaCategoryName`
names a row in a master table this service keeps, so what it may hold is fixed here and
grows by a row. `valueKind` describes the shape of a value the caller's own schema defines,
has no table behind it, and is the caller's vocabulary rather than this service's.

`path` names the field, matching the `fieldSchema` that was sent — the same word on the way
in and on the way out. `suggestionConfidence` is deliberately not `confidence`: the client's
own interface already carries a `confidenceScore` meaning something else entirely, and the
two will sit on one screen.

Values and reasons are written in the language the asset owner reads. This service returns
no display wording of its own: a failure is a reason code and its parameters, and the client
system builds the sentence people see.

### Background jobs

| Job | Trigger | Queue | Payload | Why not in the request path |
|---|---|---|---|---|
| run an asset media extraction | the POST above, after commit | `run-asset-media-extraction` | `{ aiRunId }` | it fetches up to twelve files from somebody else's storage and reads them three times through a provider. This is the heaviest operation the version has, and it holds a queue of its own so it can be scaled alone |

The job is not retried: a failed model call is reported, and the caller resubmits under a
new idempotency key.

### Use cases
<!-- usecases -->

- the client system asks for field suggestions for one asset from its photos, and gets back a value per field with a confidence, a one-line reason in Vietnamese, and which photos each value came from
- the client system sends an asset type whose fields cannot be suggested from a photo at all, and gets a successful run carrying no suggestions and no model call
- the client system sends a field the photos cannot show, and gets it reported as missing rather than guessed at
- the client system builds and demonstrates its whole suggestion screen before any API key exists, because the stub answers deterministically from the media the request names

### Acceptance criteria
<!-- acceptance -->

- an asset type with no suggestible field returns a successful run with no fields and no model call
- the media is read the configured number of times, and each reading is recorded separately with its own reading index
- no field path outside the schema that was sent is ever returned
- a select value that is not one of the options sent is dropped, never corrected to a nearby one
- a number that does not match the expected form, or falls outside the range sent, is dropped
- a value longer than the stated maximum is dropped rather than truncated
- the source photos returned for a field are always a subset of the media that was sent
- a value without an absolute majority across the readings is not returned, and a required field without one is reported as missing
- confidence is computed from the observed agreement and the evidence kind, and never read from anything the model returned
- the confidence formula carries a version, and every run records which version scored it
- every field returned carries a field state, a confidence, a one-line reason and the photos it came from
- a request whose media cannot be read at all fails with the unreadable reason code
- a video URL among the media is refused with the unsupported reason code, rather than being silently skipped
- audio among the media is ignored
- a request carrying more photos than the limit is refused, with the limit named in the reason's parameters
- the service writes nothing back to the caller's record: the result is a proposal, and the response carries no field by which anything could be approved
- a client that has exceeded its rate limit is refused, and no run is created and no model is called


## 21. Implementation plan

### Milestone 1 (MVP) — one run, end to end, on the stub

1. Accepting a signed, idempotent request (#run-contract)
2. The provider layer, stub by default (#provider-layer)
3. Recording a run, its steps and what it settled (#run-record)
4. Executing a run in a worker (#run-execution)
5. Fetching media through the allow-list (#media-fetch)
6. Delivering and reading back the result (#run-delivery)
7. Field suggestions from an asset's photos (#asset-media-extraction)

Milestone 1 is one vertical slice: the first six features are layers of a single path, and
the seventh is what makes that path answerable from outside. Each of the six is verified at
its own gate at the level it owns — the filter, the record, the worker, the driver, the
fetcher, the delivery — and the whole pass across them is this version's first acceptance
criterion, checked at the sweep rather than at any feature's gate. **No gate in milestone 1
claims to have proved the end-to-end path**, and the order cannot be rearranged to make one
do so: every dependency in it is real.

The provider layer comes second rather than fourth because the model catalog is what a
model call points at: `ai_model_calls.AiModelId` is NOT NULL, so the record of a call
cannot exist before the catalog does.

### Milestone 2 — operating a run

8. Listing runs (#run-list)
9. Canceling a run (#run-cancel)
10. The operator command (#operator-cli)
11. Purging content and the trace on two clocks (#retention)

### Fine to leave for later

- Progress while a run is going, and the operator's live stream (#run-progress) — matching "out of scope for now" above


## 22. Version acceptance criteria

### 1.0.0
<!-- id: version-acceptance-1-0-0 -->

- one whole pass works against the service itself: a signed request arrives, a run is created, a worker executes it, the terminal callback is delivered and signed, and reading the run back by its key returns that same body
  spans: #run-contract, #run-record, #run-execution, #run-delivery
- the whole of that pass is demonstrable with no API key and no provider call, because the stub answers deterministically
  spans: #provider-layer, #asset-media-extraction
- one run can be listed and canceled: it appears in the calling client's filtered list, and canceling it ends it at a step boundary with the tokens already spent still recorded
  spans: #run-list, #run-cancel
- no log written anywhere carries an image, a document or question content — ids, latency, tokens, reason codes and error codes only
  spans: #run-record, #run-delivery, #run-list, #operator-cli, #provider-layer, #media-fetch, #retention, #asset-media-extraction
- the service holds no credential of the client's beyond a read-only one for fetching files, and writes nothing into any system of theirs
  spans: #media-fetch, #run-delivery, #asset-media-extraction
- the AI proposes and never decides: across every operation this version exposes, no response carries a field by which a record could be approved, a clause confirmed, text composed for an outside party, or a recipient chosen
  spans: #run-delivery, #asset-media-extraction


## 23. Key file map

| Path | Role |
|---|---|
|  |  |


## Sources

| Source | Provides |
|---|---|
| — | Nothing is declared as a source for this version. Every requirement is written into this document directly. |


## Annex

| File | Provides |
|---|---|
| [tsdg-ai-backend-build-plan-v0.4.html](./annex/tsdg-ai-backend-build-plan-v0.4.html) | The v0.4 build plan of 18 Sep 2026, bilingual EN/VI — interpretation only. The responsibility boundary against Taisandaugia, invariants DR-01…DR-14, the shared HMAC request contract, run observation, all five AI services, tables and jobs, the directory layout, security, testing, and 20 OPEN items with 12 ADRs |
| [reference/README.md](./annex/reference/README.md) | Extracts of the three services the plan ports from, at the commits it cites — `leepai` `4371ba0` (the multi-provider layer, the `recordFieldValues` agent loop), `rgp-yazaki` `8e94479` (document reading, consensus, the stub driver, the provider-upload record, the job and purge shapes), `linoa` `987e663` (the v1 REST renderer). Interpretation only. The extract's own files are material that README describes, read as a whole rather than linked one by one |

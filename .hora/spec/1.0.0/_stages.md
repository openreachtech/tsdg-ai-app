# Spec — 1.0.0

The first version. `spec.md` was copied from `specs/skeleton/spec.md`; every
value in it arrives through a stage's conversation.

## Stages

0. [x] Assets and sources
1. [x] Use cases and actors
2. [x] The horizon
3. [x] Non-functional requirements
4. [x] Data, API and execution
5. [x] Screens and interaction     <!-- n/a: this version declares no frontend repository. The API's consumer is the client system, another company's backend, reached over REST; the only human surface is the read-only operator command, which is a script rather than a screen -->
6. [x] Security
7. [x] Whole-document review

## Decided in conversation, and not visible in spec.md

| What | Decided | Why the alternative was rejected |
|---|---|---|
| the status of the build plan | `Annex` — interpretation only, never extracted from | Nobody is being held to v0.4 as written. Making it a `Source` would let `/hora-plan` extract tasks straight out of a proposal document, including the four AI services this version does not build |
| the status of `request/foundation-and-w1.md` | this version's agenda, not spec text | A request states what somebody wants worked out; it is never promoted to a `Source` |
| the reference code | copied into `annex/reference/` at the commits the plan cites, rather than designed against the plan's paraphrase | The plan describes two layers as ports. A paraphrase of code that exists is the one input that can be checked, and checking it costs nothing once the extract is in place |
| the language split | documents and records in English; conversation in Vietnamese | Requested. The spec's own `Question language` field is stage 1's to write |
| whether the asset owner is an actor | no — they are named in the terminology and sit outside this service | DR-14 refuses end-user connections and step 7 of W1 belongs to the client system. Making them an actor would put a use case on a person this service never authenticates, and stage 6 would have to invent a permission for them |
| how many actors | two: the client system and the ORT operator, both authenticated by the same machine mechanism | Adding a human identity is what the annex itself calls a separate piece of work (the admin console), and it is not in this version |
| who cancels a run | the client system, over REST | The CLI is stated read-only. Letting it cancel would need an operator permission model nobody has designed, for the benefit of the party that is not billed |
| who consumes the progress stream, and how they authenticate | the ORT operator, with a client id of their own and the same signature | Keeps one authentication mechanism. A second one would be the first human identity in the service, which is the admin console's work |
| feature granularity | 12 features, not fewer | Each one is separately acceptable, so a failure names itself. Merging the run lifecycle into one would make the first three untestable apart |
| more photos than the limit | refused, with the limit reported | Neither document says. Taking the first twelve silently is the same defect the annex refused for video, where it chose to reject rather than skip quietly |
| the 90% High-band target | not a 1.0.0 acceptance criterion; the versioned, checkable formula is | The target needs a gold set drawn from the client's catalogue, and who labels it is unanswered. The request forbids any 1.0.0 criterion that waits on the client |
| the retention numbers, the size caps and the time limit | written as behavior here, with the numbers left to stage 3 | The request lists the retention numbers as still open. Writing behavior rather than figures means settling the figures later changes nothing already approved |
| whether to narrow 1.0.0 | yes — `#run-progress` deferred; 12 features became 11 | It was the one feature no stated use case was impossible without: the client already reads a run back, and the operator has the command. Its real value is on the minute-long document services, which are later versions. `#operator-cli` and `#retention` were examined the same way and kept — the first because the console that would replace it is not in this version, the second because accumulating asset photos with no purge path is a liability from the first day |
| how the deferred feature is withdrawn | `kicked: yes` on its section, body untouched; the reason in the implementation scope | Deleting the section would leave `/hora` unable to tell absent from deleted under the diff scheme, and the use cases and criteria already approved would have to be rewritten on revival |
| video | deferred with a seam, not permanently out of scope | The annex settles Phase 1 as photos only, but also states video can be added later without changing the contract. Read as permanent, the media kind would be hard-wired and adding video later would change the request shape |
| version numbers for the deferred work | none assigned; each entry names the condition that unblocks it | Assigning a number to work waiting on somebody else's decision commits to an order nobody here controls |
| `#run-list` in milestone 2, though the request names listing in its "Done when" | kept in 1.0.0, ordered after the first end-to-end pass | Nothing but `#operator-cli` depends on it, so moving it down shortens milestone 1 without removing anything from the version |
| the scope re-reading condition | milestone 1 closing with more than two features unaccepted, or one feature sent back twice | Both are measurable from what `.hora/` already records — the plan's boxes and the acceptance blocks. The threshold of two is proportionate to 11 features over two milestones |
| the unit volume is measured in | runs a day, not users | The only users are two machine clients. A user count would have read "one" and decided nothing; runs a day is what sizes the run tables, the queue concurrency and the purge jobs |
| the heaviest operation | one asset-media-extraction run — 12 photos fetched and uploaded, then 3 readings | The document-reading services will be heavier, but they are later versions. Naming a future version's operation here would size 1.0.0 against work it does not do |
| availability | working hours; an hour's outage tolerable, a day's inconvenient | The suggestion is a convenience, not the only route to posting an asset: the owner types the fields in by hand instead. This is what makes the missing SLA number survivable for 1.0.0 |
| retention numbers | content 30 days, trace 730 days | Taken as the annex proposes. The trace outlives the window in which a dispute is raised after an auction closes, is paid and is handed over; the content is kept only long enough to reconcile |
| the security level | high — an asset photo is personal data | At the moment the owner presses the button the posting is not yet public, so "the photos are public anyway" does not hold. This is what keeps the stub as the default until the legal conditions for sending real data to a provider are settled |
| object storage | none. The temporary copy sits on the worker's own disk and is deleted when the run ends | Adding one would be a second place personal data could persist, against the rule that no fetched file is kept |
| system-level monitoring | deferred, with the SLA number as its unblock condition | Named in the annex as in scope and ORT's responsibility, but absent from the request, from every feature and from both out-of-scope lists. Raised at stage 3 and routed back to stage 2, which owns the scope section. No alert threshold can be chosen before the SLA number exists |

## Proposals not taken

| Proposed | Answer | Recorded as |
| **roles on one endpoint, or endpoints of their own** | **one endpoint** | Every caller is a machine holding the same kind of identity — a client record and a secret. A second endpoint would duplicate the signature filter while separating nothing, and the run list is already narrowed to the calling client inside the query rather than in any interface, so an operator read across clients is a second query and not a rewrite. The first human identity would arrive with the admin console, which this version defers and which the annex itself calls a separate surface. **Recorded here because stage 6 checks that a reason exists, and because the next version's new role is decided against this reason or against nothing** |
| REST rather than the stack's default style | REST | Two of the reasons that count apply at once: the consumer already exists and already speaks REST (another company's backend, not a frontend built alongside this), and half the contract runs the other way as a webhook this service calls back on |
| master-table naming | `*_categories`, not the annex's `*_kinds` | The database convention sanctions `*_statuses` and `*_categories` and forbids `*_types`; `kinds` is neither. Getting it wrong is a rename across the table, the model and the key column. The JSON field names follow, so the response carries `runCategoryName` |
| the callback delivery kind | a master table, not a column of two values | Adding the deferred progress callback later is then one row rather than a schema change — which is exactly the seam stage 2 promised for `#run-progress` |
| media kinds | all three seeded, only image handled | A request naming video or audio is refused by name rather than ignored, and adding video later is a row. The other half of the seam stage 2 promised |
| dropped from the annex's tables | the auto-send flag, the prohibited-phrase table, the page count | Each belongs to a service this version does not build. Carrying them would be columns nothing writes |
| the prompt store's column detail | written compactly, referring to the extract it is ported from | The eleven tables are ported as a set from the reference extract, which is in the repository at the commit the plan cites. Restating their columns would create a second description to keep in step |
| pagination | by cursor, not offset | A list filtered by status is read while runs are still changing status; an offset page would skip or repeat rows as they move |
| `path` over `key`, `suggestionConfidence` over `confidence` | as written | The value is a dotted path, not a flat key, and the same word is used on the way in and out. The client's interface already carries a `confidenceScore` meaning an organisation match percentage, and the two will sit on one screen. This settles the annex's OPEN-19 |
|---|---|---|
| — | — | — |

Nothing was declined in stage 1. Every proposal put up was taken as drafted.

## Held for stage 2 — behavior that reaches past its own feature

Recorded here by stage 1, which has no order to place it against. Stage 2 decides
where each one is checked (`../../../.claude/skills/hora-spec-usecases/SKILL.md`,
"Acceptance criteria, per feature").

| Drafted for | The behavior | Reaches |
|---|---|---|
| #run-contract | one whole pass: a request arrives, a run is created, the worker executes it, the terminal callback is signed and delivered, and reading the run back returns that same body | #run-contract #run-record #run-execution #run-delivery |
| #provider-layer | the stub answers deterministically, so the whole pass above is demonstrable with no API key and no provider call | #provider-layer, and every service section |
| #run-list | one run can be listed, followed and cancelled | #run-list #run-progress #run-cancel |
| — (question 6) | logs carry no image, document or question content — ids, latency, tokens and error codes only | the whole version |
| — (question 6) | ORT never writes to the client's database, and holds no credential of theirs beyond a read-only one for fetching files | the whole version |
| — (question 6) | the AI proposes and never decides: it approves no record, confirms no clause, composes nothing an outside party reads, and chooses no recipients — the output shape carries no field for it | the whole version |

## Deferred, for stage 2's "out of scope for now" list

| What | What unblocks it |
|---|---|
| the calibration target — a High-band suggestion correct at least 90% of the time, Medium at least 70% | a labelled gold set drawn from the client's asset-type catalogue, and a decision on who labels it (the annex's OPEN-08, unanswered) |

**Settled at stage 2.** Every item stage 1 held back was placed. The six
cross-feature behaviors became the version's own six acceptance criteria; the
calibration target became an "out of scope for now" entry with its seam. Nothing
was dropped.

## The two numbers stage 2 is required to say

**The first — features against use cases.** 12 features drafted; one (`#run-progress`)
had no use case that was impossible without it and was deferred. 11 built this version.

**The second — the version's own criteria against the milestone boundaries.**

| Boundary | Criteria satisfied |
|---|---|
| end of milestone 1 (7 features) | **4 of 6** |
| end of milestone 2 (11 features) | **6 of 6** |

Neither reading that re-opens the narrowing appeared: the criteria do not all wait
for the last milestone, and the plan has more than one milestone. The first
end-to-end pass, its demonstrability on the stub, the credential boundary and the
"proposes, never decides" shape are all checkable once milestone 1 closes.

## Mechanical checks run at stage 2

| Check | Result |
|---|---|
| every feature in the build order comes after every feature it depends on | passes, walked in order |
| "built this time" and the implementation plan name the same features | passes, exactly |
| "fine to leave for later" corresponds to an "out of scope for now" entry | passes — `#run-progress`, in both |
| no version criterion's `spans:` names a feature this version does not build | passes |

## Stage 7 — review

### The mechanical pass

| What | Result |
|---|---|
| required sections | 10 of 10 present, each in `spec.md`'s own text |
| feature sections | 12 — 11 built, 1 kicked |
| both blocks on every feature | present on all 12 |
| `id` / `target` / `depends` | present on all 12; every `target` reads `backend`, which the layout declares |
| duplicate ids | none |
| `--` in a file or folder name | none |
| operations stating a kind and a caller | 4 of 4 |
| an input whose fields are unknown | none |
| version matches the directory | 1.0.0 |
| written into a past version | none — there is no past version |
| `_divergence.md` rows unrouted | the file does not exist: stage 0 found no code, so nothing could diverge from a document |
| version acceptance criteria | 6, every one carrying `spans:`; every id named is a feature the document holds, and none names the kicked feature |
| forward references in a block | none explicit. One implicit, found by reading rather than by the pass — see finding 2 |

**Counts, so the pass is known to have run:** 974 lines, 12 feature sections, 15 tables,
38 use cases, 94 feature acceptance criteria, 6 version acceptance criteria, 0 listed
features, 0 missing blocks.

**Both of stage 2's numbers, recomputed off the resolved document:** 11 features built;
4 of the 6 version criteria satisfiable at milestone 1's boundary, 6 of 6 at milestone 2's.
Unchanged from what stage 2 computed, because nothing was reordered and nothing was added.

### Findings

| # | Finding | Sends back to | Result |
|---|---|---|---|
| 1 | 207 files under `annex/reference/` are linked from nothing | this stage, wording | fixed: the Annex row now says the extract is material its README describes, read whole rather than linked file by file |
| 2 | the first six features' use cases cannot be watched at their own gates — each needs a route built later | **2** | kept deliberately, and the implementation plan now says so: milestone 1 is one vertical slice, no gate in it claims the end-to-end path, and the order cannot be rearranged because every dependency in it is real |
| 3 | the retention promise says confidence and agreement counts survive the content purge, but both lived only in the result body, which is content | **4** | fixed: `ai_run_field_outcomes` plus two masters, on the long clock, holding no value read from a medium |
| 4 | no column held the confidence formula's version, though three statements require every run to record it | **4** | fixed by the same table. It could not have gone on `ai_model_calls`: the confidence is computed in code, by a step that makes no model call |
| 5 | one request body carries two vocabularies — `valueKind` and `mediaCategoryName` | this stage, wording | kept, with the distinction written: one names a row in a master table this service keeps, the other describes a shape the caller's own schema defines |

**Findings 3 and 4 are the same defect as stage 6's, running the other way.** Stage 6 found
the trace keeping too much — a value outliving by two years the purge meant to remove it.
This stage found it keeping too little — the decisions dying with the content they were made
about. Neither was visible in either source document, because in both the retention rule and
the thing it governs are written sections apart.

### The five readings

| Reading | Result |
|---|---|
| can every use case be completed | yes. Stage 4 walked 35 against the backend; this walk added the screens half, which is empty, and found nothing further |
| is every criterion observable, and observable *there* | finding 2 is the whole of what this turned up. Every other criterion names a behavior somebody can stand somewhere and watch |
| do the three scope lists still match the design | yes. Every "for now" entry's seam is present in the design: the step-boundary records for progress, the media-category master for video, the run-category master and shared contract for the other services, the query-level client scoping for the console, and — after finding 3 — the versioned outcome rows for the calibration target. That last seam was named at stage 2 and did not exist until this stage |
| does anything contradict anything | findings 3 and 4 were the contradictions. Nothing else: the retention periods, the volume, the job triggers, the actors and the terms are consistent across sections |
| would somebody not in the room understand it | finding 5. No unexpanded abbreviation, no screen or term named two ways elsewhere |

### What no stage settled

`_assets.md`'s "read but not settled here" list was walked. Every row was settled by the
stage it named. Nothing in `request/` went unplaced: the request's three open items are all
resolved — the file-staging credential in the security rows, the retention numbers at
stage 3, and both naming collisions at stage 4.

## Stage 6 — what the pass turned up

Four operations and no screens, so the pass was short. It still produced the most valuable
finding of the spec.

### The contradiction the retention split was hiding

`ai_run_steps.rejected_items` was drafted at stage 4 to record the value a code step
dropped, which is what the annex's own example shows. But the step trace is in the
730-day group while content is purged at 30 — so a value read out of somebody's photo
would have outlived by two years the purge that exists to remove it.

**Neither document contradicted itself in a way anybody could see.** The annex states the
retention split in one section and the trace's contents in another, and the two are eleven
screens apart. It surfaced only because this stage walks the fields asking which are
personal.

**Settled:** the trace records the path, the reason code and figures — a length, an
agreement count — and never the value. "Why was this field not proposed" is still
answerable years later, and the purge now removes what it claims to.

### The other three

| Question | Settled | Why |
|---|---|---|
| a run key belonging to another client | answered as though the run did not exist | A run key is a UUID, so nothing is lost to guessing, and a refusal that admits existence confirms how much work a competitor is doing |
| anything reachable without authentication | **nothing.** No public route, no health check, no guest allow-list | Asked alone rather than batched, which this stage requires whatever else has been declared. Monitoring is deferred, so nothing needs an unauthenticated probe yet; adding one later is then a recorded decision rather than a habit |
| rate limiting | yes, per client, on the run-creating request | Idempotency stops a repeat of the same request and does nothing about a thousand different ones. A loop on the caller's side would otherwise spend the model budget before anybody looked |

### Written even where the answer was "nothing"

Three lines exist because silence cannot be checked: **no uploads** (media arrives as a URL
this service fetches — there is nothing uploaded to validate), **cross-origin requests
refused entirely** (every caller is a server), and **no health check**. Each is a statement
somebody can hold the code to.

### The endpoint split's reason

Required to exist in writing by this stage's exit condition. It was written at stage 4 and
is in this file, under "Decided in conversation" — one endpoint, because every caller is a
machine holding the same kind of identity, and the first human identity arrives with the
deferred console.

## Stage 5, and why it is not applicable

The repository layout declares one repository and no frontend row, which is this stage's
one stated not-applicable case. The reason and the consumer are recorded here and written
into the spec's own repository-layout section, so a reader meets it there rather than
having to notice an absence.

**Who the API is for instead:** the client system — another company's backend — over REST,
plus a read-only operator command that is a script on the machine, not a screen. Neither
is a frontend repository, and neither is built from a frontend origin.

**The stage's own check still ran, in the form that survives without screens.** Both
directions of "unreachable" were walked over the four routes: every one is reached by the
client system, and no route exists that nothing calls. The screen half of the check has
nothing to read.

**Both delegate rows are frontend skills** — the shared UI/UX project context file, and
what a screen must account for to be correct by construction. Neither applies to a version
with no screen, and no context file is created. A later version that adds the admin console
enters this stage properly and creates it then.

## The use-case walk — stage 4's exit condition

Every use case stage 1 stated, walked step by step against the tables, the operations and
the jobs as drafted. 35 use cases across the eleven features this version builds (the three
belonging to the deferred `#run-progress` were not walked).

**33 walked without a gap.** Two raised something:

| Use case | What the walk found | What was done |
|---|---|---|
| `#provider-layer` — "changes the wording a service sends to a model without deploying anything" | Prompts are database rows, so no deployment is involved — but no operation exists to edit one, and the console that would give it a surface is deferred. The only means this version is a direct database write | The section now says so in as many words, so nobody reads the use case as implying a screen |
| `#run-contract` and `#run-record` — their use cases complete through a route | Neither owns a route. Both complete through routes owned by features built after them: the service's POST, and the run's GET | Deliberate, and now written into `#run-contract`'s body. The shared entry is the engine, the context, the base renderer and the run record; a concrete route belongs to the service that answers it. Their criteria are checked at that layer rather than through an endpoint |

No `unmet-usecase` was raised: every use case is satisfiable by the design as drafted.

## Delegates matched at stage 4

| What was needed | Matched | Invoked |
|---|---|---|
| the logical shape of a table | `hor-database-design` | yes, with its master-table and column-type references |
| a REST renderer's route and version; what an endpoint is and what its filter does | `hor-restfulapi-architecture` | yes |
| whether work belongs in the request, in a post-worker, or in a job | `hor-execution-placement-pattern` | yes |
| a queue, a schedule, a retry, a concurrency limit | `hor-renchan-job-bullmq` | yes |
| the multi-provider layer | `hor-multi-llm-provider` | yes — named by the annex itself |
| prompts and tool schemas as versioned data | `hor-ai-prompt-document-store` | yes — named by the annex itself |
| a fixed-procedure agent loop whose AI steps each make one forced tool call | `hor-ai-agent-structure` | yes |

**One delegate row did not apply.** "A side effect that runs after the response" matches a
post-worker, which is a GraphQL mechanism (`BaseGraphqlPostWorker`). This server is REST, so
the after-the-response work — delivering the terminal callback — is a job instead, which is
also where the annex puts it. Recorded rather than forced.

## Delegates matched at stage 3

**None, by this stage's own rule.** Nothing in the equipped packages states what a
project's volume, availability target or retention period should be. Every number
in section 7 came from the requester.

## Routed back at stage 3

| Found | Routed to | Outcome |
|---|---|---|
| system-level monitoring is named in the annex as in scope, but appears in no feature and in neither out-of-scope list | stage 2 (it owns the scope section) | added as an "out of scope for now" entry, with the SLA number as its unblock condition and the operator command as its seam. Approved as its own edit |

## Delegates matched at stage 2

| What was needed | Matched |
|---|---|
| the out-of-scope list, and what makes a requirement decided rather than assumed | `hoc-requirement-definition`, already invoked at stage 1. Its rule that the out-of-scope list is mandatory and never empty is satisfied by both lists |

## Delegates matched at stage 1

| What was needed | Matched |
|---|---|
| turning a rough request into stated requirements, observable criteria and an out-of-scope list | `hoc-requirement-definition`, invoked |
| the shared UI/UX project context the UI generator and the UI auditor both read | **not applicable.** This version declares no frontend repository and no screen. To be revisited if a later version adds the admin console |

## Handed to a later stage

Everything stage 0 read but must not decide is listed in `_assets.md`, under
"Read but not settled here", each row naming the stage that settles it.

## Stage 2, re-entered — 2026-09-24

Re-entered from checkpoint 1 of #run-record, which found an acceptance criterion that could
not be met at its own gate ([[Q29]]).

**What changed.** `ai_model_calls` moved from `#run-record` to `#provider-layer`, with the use
case and the criterion that read it. `#provider-layer` now declares `depends: run-contract`
(it had declared `run-execution`, which nothing in it needs) and stands second in the build
order. `#retention` now declares `run-record, provider-layer, media-fetch`; the third edge had
been missing since the section was written, and the order happened to satisfy it.

The order was walked end to end afterwards: **zero forward edges.**

### The two numbers

**Features: 11**, unchanged by this re-entry.

**Version criteria satisfied at each milestone boundary — 4 of 6 at milestone 1, 6 of 6 at
milestone 2.** Neither of the two readings that would be findings holds: the criteria do not
all wait for the last milestone, and the plan does not have only one milestone.

Milestone 1 carries the whole end-to-end pass, the no-key demonstration, the credential
boundary, and "the AI proposes and never decides". What waits for milestone 2 is listing and
cancellation, and the logging criterion — which spans eight features including `#operator-cli`
and `#retention`, so it could not land earlier without reordering those two into milestone 1.


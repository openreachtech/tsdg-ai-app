# What version 1.0.0 should build

DRAFT — written from the build plan in `../annex/tsdg-ai-backend-build-plan-v0.4.html`
(phase P0 · Foundation, plus phase P1 · AI-W1). Correct anything here before running
`/hora`; nothing in this directory becomes spec text on its own.

## The product

One backend service, `tsdg-ai-backend`. It is called over REST by Taisandaugia's .NET 10
backend, runs AI work asynchronously, and posts the result back on a signed callback. It
has no screens and no end-user surface: the only caller is another server.

Two processes: the REST API, and a worker that runs the jobs.

## Part one — the foundation

- REST v1 under `/v1`, authenticated by an HMAC signature over `timestamp + "." + rawBody`
  (headers `x-ort-client-id`, `x-ort-timestamp`, `x-ort-signature`), with a required
  `Idempotency-Key` — the same key returns the same run and never calls a model twice.
- The run record: `ai_runs`, `ai_run_steps`, `ai_model_calls`, and the master tables the
  plan lists.
- A job per run, dispatched only after the creating transaction commits.
- The result delivered two ways: a signed callback to the client's registered URL, and
  `GET /v1/ai-runs/:runKey` for reconciliation.
- Run operation: the filtered list endpoint (by `subjectLabel` / `correlationId`),
  progress callbacks, cancellation at step boundaries, an SSE progress stream, and a
  read-only operator CLI.
- The provider layer ported from leepai — `BaseAiModelProcessor`, a Gemini processor, a
  Claude processor and a stub — with prompts, tool schemas and model choice held as DB
  data. **The stub is the default in every environment.**
- `MediaFetchClient`, fetching only from an allow-list of hosts, with size caps checked
  before anything reaches a provider, and an egress record of every file handed to a
  provider.
- Retention split in two: run content is purged on one clock (30 days), the decision
  trace on another (730 days).

## Part two — the first AI service, AI-W1

Field suggestions from an asset's photos, `POST /v1/asset-media-extractions`. The asset
owner presses a button in Taisandaugia's digitisation wizard; each press is one charged
run. Suggestions come back per field with a confidence band and a one-line reason in
Vietnamese, and the owner chooses Use or Dismiss. **This service never writes into their
record.**

The run is a loop of seven steps, six of them code:

1. Keep only the fields whose kind can be suggested — text, number, select. Nothing left
   means no model call at all.
2. Fetch the media through the host allow-list, check sizes, upload to the provider and
   record the egress.
3. Read the media three times, each reading forced through one tool call, every item
   carrying its evidence kind, its reason and which photos it came from.
4. Check every returned value against the schema that was sent in: paths outside it
   dropped, numbers matched and range-checked, a select value that is not one of the
   options dropped, anything over the length dropped rather than truncated.
5. Settle the readings by absolute majority. No majority means the field is not returned,
   and a required field is reported as missing instead.
6. Score the confidence in code, from the observed agreement and the evidence kind —
   never from a number the model declares — and set the field's state.
7. The owner decides. That step is theirs, not ours.

**Photos only.** Up to twelve of them; audio is ignored, and a video URL is rejected
outright rather than silently skipped.

The confidence formula is calibrated against a gold set drawn from their asset-type
catalogue, and the target is that a High-band suggestion is right at least 90% of the
time.

## What this version does not carry

The other four AI services — legal document extraction (W2), case document extraction and
bidder answers (W4a/W4b), the outreach pack (W3). Each is its own later version. The admin
console is a separate line item and is not in this version either.

## Rules this version must not break

- ORT never writes to Taisandaugia's database, and holds no credential of theirs beyond a
  read-only one for fetching files.
- The AI proposes; it never approves a record, confirms a clause, composes what a bidder
  reads, or chooses recipients.
- No evidence, no value: a field without a majority stays empty, never guessed and never
  coerced to zero.
- Every model output passes a code check before it leaves the service.
- Only the client modules open an outbound connection.
- Logs carry no image, document or question content — ids, latency, tokens and error
  codes only.

## Done when

**Everything is built and accepted on our side first. Integration is a later, separate
step.** Nothing in this version waits on Taisandaugia building their screen, and no
acceptance criterion here may be phrased against their button.

- The service runs end to end against itself: a request comes in, a run is created, the
  worker executes it, the callback is delivered and signed, and `GET` returns the same
  body. A run can be listed, followed and cancelled.
- AI-W1 returns field suggestions for a real asset-type schema and a real set of photos,
  with every acceptance criterion in the plan green.
- The stub answers deterministically, so all of the above is demonstrable with no API key
  and no provider call.

Handing it over to Taisandaugia — their Angular suggestion layer, their callback
controller, a staging run through their wizard — comes after this version is finished, and
is not what this version is measured by.

## The plan's schedule is not a requirement

The annex carries a roadmap with phase estimates. **It is context, not a constraint.**
Nothing in this version is scoped, cut, hurried or called finished because of a date in
that document. The criteria above are what "done" means; how long they take is whatever
they take.

## Still open

The build plan lists thirteen questions nobody has settled yet. The ones that touch this
version are the file-staging credential, the retention numbers, and the two naming
collisions on the W1 result (`key` versus `path`, and `confidence` against the match
percentage their frontend already shows). The rest belong to the service versions that
come later.

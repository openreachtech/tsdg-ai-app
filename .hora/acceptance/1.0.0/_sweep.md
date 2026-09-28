# Acceptance - 1.0.0 - whole-version sweep

## Run 1
<!-- reach: full -->
<!-- scope: run-contract, provider-layer, run-record, run-execution, media-fetch, run-delivery, asset-media-extraction, run-list, run-cancel, operator-cli, retention -->
<!-- live: yes. The stack was brought up for this run - Redis in Docker, the API server, the job daemon and a loopback callback receiver - and three whole passes were driven through it. No browser: this product declares no frontend row -->
<!-- reuse: none. Executed in WSL by the repository's own `npm test` at `--maxWorkers=4`, both modes -->
<!-- not-accepted: none -->
<!-- version-criteria: 6 of 6 -->
<!-- environment: docker compose redis 7.4, SQLite development database refreshed from seeders before and after -->

### Verdict

passed over 11 of 11 features, partial on the review step: steps 3 and 4 have no equipped delegate

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | - | brought up by this run: Redis 7.4, API server on 8001, job daemon, loopback callback receiver on 4599 |
| unit (tsdg-ai-backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **4770 passed across 146 suites**, and **511 across 8**, 0 failed. `npx eslint .` clean |
| scenarios | **none equipped** | not run - see finding 1 |
| review | **none equipped** | not run - see finding 1 |
| version criteria | - | **6 of 6 checked**; one was found not held, fixed inside this run, and re-checked |
| UX | - | not in scope; this product declares no frontend row |
| security | `hor-security-audit` (invoked in full, whole repository) | 0 HIGH, 3 MEDIUM, 3 LOW, 5 INFO. Two MEDIUM were new and both are fixed |

### The six version acceptance criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | one whole pass works against the service itself | **held, driven live** |
| 2 | that pass is demonstrable with no API key and no provider call | **held in part** - see finding 3 |
| 3 | one run can be listed and canceled | **held, driven live** |
| 4 | no log written anywhere carries an image, a document or question content | **not held when this run began; held now** - see finding 2 |
| 5 | the service holds no credential of the client's, and writes nothing into any system of theirs | **held** |
| 6 | the AI proposes and never decides | **held** |

**Criterion 1, clause by clause, against the running service.** A signed request arrived and was
accepted `202` with a 64-hex run key; the run was created; the job daemon executed it and recorded
its steps; the terminal callback was delivered to the receiver and **its signature verified**; and
reading the run back by its key returned a body **byte-identical** to the callback's. Three passes
were driven, and a fourth for cancellation.

**Criterion 3, likewise.** The run appeared in the calling client's filtered list with every field;
`POST /v1/ai-runs/:runKey/cancellations` was accepted `202`; the worker settled it to `canceled`
with `modelCallCount: 0`; and the cancellation's own terminal callback arrived signed and verified.

**Criterion 5.** `api_clients` stores the mutual HMAC secret and nothing else that could reach a
client's system - no token, no key, no credential of theirs. Media is fetched from allow-listed
URLs with no credential. The one outbound write is the callback to their own registered URL.

**Criterion 6.** `AssetMediaExtractionResult` carries `fields[]`, `missingFieldPaths[]`,
`unreadableMediaKeys[]` and `mediaSignature`. No approval field, no recipient, no text composed for
an outside party. The type's own docblock states it: *"It is a proposal and carries no field by
which anything could be approved."* A repository-wide search for an approval, recipient or send
field across every response type returns nothing.

### Findings

1. **Steps 3 and 4 had no equipped delegate**, as at every gate of this version. Both candidates are
   frontend-shaped, and this product declares no frontend row.

2. **Criterion 4 was not held, and the route was one no per-feature audit could have seen.** The
   `mariadb` driver appends a statement's bound parameters to the message of any error it raises,
   truncating only when the SQL alone exceeds 256 characters. The terminal write that stores a run's
   result body is 135 characters - so about a hundred characters of **the result body**, §7's
   personal data at its highest classification, travelled inside a `DatabaseError`, which the job
   does not swallow and which BullMQ persists as a failed job's `failedReason`. **And that record
   was permanent**, because only retention's queues bounded their job records; the run and callback
   queues, written earlier, never got the convention.

   Every link belongs to a different feature, which is exactly why eleven feature audits passed it
   and the whole-repository pass did not. Closed twice over: `logParam: false` on every non-SQLite
   environment stops the driver appending at all, and both dispatchers now bound their finished
   records at 90, the figure retention already chose. The gating branch was verified in the
   driver's own source (`lib/cmd/command.js:44`), not inferred. Recorded as [[Q155]] so the fix is
   not undone by someone who does not know what it holds shut.

3. **Criterion 2 is held in the half that was demonstrable and is recorded short in the other.**
   Three runs executed with **no API key anywhere and zero model calls**, so "no API key and no
   provider call" is measured rather than argued. But no run reached the stub's answer: the media
   payloads this run constructed were refused, the last of them under a correctly classified
   `MEDIA_UNREADABLE`. **That is most likely this run's payload rather than the product** - the
   stub's deterministic answer is exercised for real against seeded rows in the `_orders` suites -
   but it was not demonstrated end to end here, and "demonstrable" is what the criterion claims.
   A later sweep should drive a run to `succeeded` through HTTP.

4. **Two LOW findings are left open rather than fixed**, both recorded: outside production the
   framework returns a raw error message to the caller, compounded by the environment named `live`
   being the least safe one to run live on ([[Q156]]); and a `healthCheck` guest allow-list exists
   in both GraphQL engines where §7 says none does ([[Q157]]).

5. **The known findings were re-confirmed, now across the whole repository rather than one file**:
   `cors({ origin: '*' })` on all three engines against §7's "refused entirely"; hard-coded
   credentials in the `live` and `staging` database blocks with no TLS option on any SQL connection
   ([[Q24]]).

6. **What the audit confirmed rather than found**, each verified in source: the four REST routes
   agree - every one takes the client into the `where` of the read itself, none reads a client
   identifier from a request parameter, and the two "as though it did not exist" routes both answer
   `404` and declare no `403`, so they cannot tell the two cases apart even by accident. One
   signature verifier serves every route with no bypass, comparing in constant time, digesting both
   secrets always so nothing leaks which one matched, and requiring the timestamp to be digits
   before the payload is built. The client secret and the encryption key cannot be printed by any
   path. Rate limiting counts against the client the **signature** resolved, never a header.

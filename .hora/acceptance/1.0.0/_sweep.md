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

## Run 2
<!-- reach: full -->
<!-- scope: run-contract, run-record, run-execution, run-delivery, run-list, run-progress, run-cancel, operator-cli, provider-layer, media-fetch, retention, asset-media-extraction -->
<!-- live: yes -->
<!-- reuse: none -->
<!-- not-accepted: none -->
<!-- version-criteria: 6 of 6 checked; 5 held, 1 recorded short -->
<!-- environment: local stack on WSL, SQLite, seeded 2026-09-28 11:39 -->

### Verdict

failed

**Run 1's verdict predates the vendor driver, the two deferred items it unblocked, and the §22
fix, so it no longer covers what exists.** This run does. It closes the shortfall Run 1 recorded
against criterion 2, and it fails on one new blocking contradiction.

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | `hor-build-e2e-test-environment` — not invoked; the stack was brought up directly | ready: API on 8001, job daemon, Redis, a local receiver serving the media and catching the callback |
| unit (backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **163 suites / 5274 tests** and **8 / 531**, executed for real, all passing |
| scenarios | — | **no equipped delegate.** The only candidate is frontend-shaped and this product declares no frontend row |
| review | — | **no equipped delegate**, same reason. The version's six criteria were driven directly instead, below |
| version criteria | — | 6 of 6 checked; 5 held, criterion 4 recorded short |
| UX | — | not in scope: no frontend row |
| security | `hor-security-audit`, whole repository | 0 HIGH · 5 MEDIUM · 5 LOW · 6 INFO, of which 5 were already recorded. **One MEDIUM did not survive being run** — see the findings |

### The version's own criteria

**Criterion 1 — held, and measured end to end.** A signed request created a run, the worker
executed it, the terminal callback was delivered on the first attempt with HTTP 200, and its
signature verifies against the client's secret. Reading the run back by its key returned a body
with **no field only in one, no field only in the other, and no shared field differing** —
`statusName`, `usage` and `result` identical. *Qualified by [[Q159]]:* the read-back was performed
with a client that can frame a body on a `GET`, which is not every client.

**Criterion 2 — held. This is what Run 1 could not demonstrate and recorded as owed.** The stack
was restarted with **no vendor key in the environment at all**, the binding and `is_default` both
on the stub. A run driven through HTTP came back `succeeded`, its three model calls all against
the stub model row, and its result body carries the stub's own sentence: *"supplied without a
model call."* No provider was called and none could have been.

Along the way the same pass demonstrated two controls the criteria do not name. A run whose media
host was not on the fetch allow-list failed cleanly as `MEDIA_UNREADABLE` with zero model calls —
the refusal Run 1 mistook for a payload problem, correctly classified. And a callback to a URL
outside the client's registered prefix was refused as `unregistered-callback-url` with no request
made.

**Criterion 3 — held.** The run appears in its own client's list (`200`, 20 runs). A cancellation
of a run in flight was accepted while it was `running`; a cancellation of a run already terminal
returned that state (`202`, `succeeded`) rather than an error. The tokens spent before a run
stopped are recorded on `ai_model_calls` in every case. The queued-cancel case rests on Run 1,
which drove it to a terminal callback with `modelCallCount: 0`; it could not be met again here,
because the stub settles in about 300 ms and there is no step boundary left to stop at.

**Criterion 4 — checked, and recorded short. The environment cannot demonstrate it.** Every log
file under `logs/` is **0 bytes** after a full day of runs, because `@openreachtech/mentsu-logger`
writes only under `NODE_ENV=production` ([[Q149]]). **An empty log file is not evidence that no
log carries content; it is evidence that no log was written.** So the criterion was checked by
reading instead: the audit read every `mentsuLogger` call site in the repository and found all but
one carry the error's class name and never its message, which is what makes the rule hold
structurally rather than by inspection. The exception is recorded as [[Q162]]; a second one, in
the provider purge, was corrected earlier in this session. [[Q155]]'s fix was verified **still shut
in both halves** — `logParam: false` reaches `live`, `staging` and `production`, and all seven
dispatchers plus the cron schedule template bound their finished records at 90, with none missed.

**Criterion 5 — held.** Confirmed in source across all four REST routes: `apiClientId` is read
only from the signature-resolved context, never from a body, query or path parameter. The service
holds no credential of a client's beyond what it needs to fetch their files, and its one outbound
write is the callback to their own registered URL.

**Criterion 6 — held, unchanged from Run 1.** No response type this version exposes carries an
approval, a recipient, or text composed for an outside party. The vendor driver added no response
shape to the API surface.

### Findings

1. **[[Q159]] — blocking. Neither read-back route can be called by a conforming client.**
   `GET /v1/ai-runs/:runKey` and `GET /v1/ai-runs` answer `401` to a request sent the way every
   HTTP client sends a `GET`, because the signature verifier requires a raw body and the body
   parser never runs without one. §16 declares both as client operations. **The workaround is not
   available either:** framing a zero-length body on a `GET` is refused by the Fetch specification
   itself, so no browser or Fetch-based library can reach these routes at all. Found by running a
   Fetch client against criterion 3; no suite could have caught it, because **no test in either
   suite drives HTTP against this service's own routes.** Sends back to: #run-delivery
   checkpoint 1.

2. **A whole-repository audit found five items already recorded and three new ones**, none HIGH.
   New: [[Q160]] `public/` served unsigned on all three ports, [[Q161]] the GraphiQL console
   mounted outside `NODE_ENV=production`, [[Q162]] the last raw `error.message` in a log line.
   Re-confirmed unchanged: wildcard CORS and the hard-coded `live`/`staging` database credentials
   with no TLS option on any SQL connection ([[Q24]]), the framework returning a raw error message
   outside production ([[Q156]]), the `healthCheck` guest allow-list ([[Q157]]), and Sequelize
   query logging left at its library default outside development ([[Q154]], which already carries
   a measurement this audit did not have — the logged line binds its parameters rather than
   inlining values).

3. **One of the audit's MEDIUM findings did not survive being run, and that is recorded so it is
   not raised again.** The GraphQL engines' upload middleware was reported as buffering up to ten
   files of ten megabytes to the temporary directory ahead of authentication. An unsigned
   GraphQL-multipart POST carrying a 200 KB part was answered `200` with `Unknown type "Upload"`,
   and the temporary directory held **0 `upload_*` entries before and 0 after**. Neither schema
   declares an `Upload` scalar, so no resolver reads the stream and nothing reaches disk. It is
   unnecessary surface ([[Q163]]), not a disk-consumption route.

4. **The audit ran on the wrong platform, and its report says so.** It could not reach WSL and
   worked from Git Bash on Windows, read-only. Nothing it did could manufacture a platform finding
   — it read files, used `git grep` and `git log -p`, and ran one `npm audit` — but **none of its
   findings was an observed runtime behaviour.** The three it named as needing a running stack
   were therefore run here, in WSL, before any of them was recorded: two confirmed, one refuted
   (above). This is the reason the platform rule exists, and it earned its keep in this run.

5. **[[Q163]] — the largest single improvement available, and it is a deletion.** Two entire
   GraphQL servers expose one operation between them, which is on the guest allow-list, while the
   whole of this product's API is the four REST routes. Five of this sweep's findings live only on
   surface the product has no use for.

6. **Still owed from [[Q158]], and not closed by this run:** the deployment runbook has to name
   `ai_agent_default_models` as the switch that turns a real provider on, and say to run one
   request afterwards and read `ai_model_calls` to see which model answered — because nothing in
   the running service says a switch was set wrongly. No runbook exists under `docs/` yet.

## Run 3
<!-- reach: full -->
<!-- scope: run-contract, run-record, run-execution, run-delivery, run-list, run-progress, run-cancel, operator-cli, provider-layer, media-fetch, retention, asset-media-extraction -->
<!-- live: yes -->
<!-- reuse: none -->
<!-- not-accepted: none -->
<!-- version-criteria: 6 of 6 checked; 5 held, 1 recorded short -->
<!-- environment: local stack on WSL, SQLite, seeded 2026-09-28 -->

### Verdict

passed

The retake of Run 2, after its one blocking finding was corrected. Nothing else in the tree
changed between the two runs but the one method that finding named and the tests that now hold it.

### What ran

| Step | Delegate | Result |
|---|---|---|
| environment | brought up directly | ready |
| unit (backend) | `hor-backend-testing`, `hoc-jest`, `hoc-test-execution` | **163 suites / 5287 tests** and **8 / 531**, executed for real, all passing. Thirteen more than Run 2: the six that drive HTTP, and seven pinning the two cases the corrected method now tells apart |
| scenarios | — | no equipped delegate; unchanged from Run 2 |
| review | — | no equipped delegate; the version's criteria were driven directly |
| version criteria | — | 6 of 6 checked; 5 held, criterion 4 recorded short for the same reason as in Run 2 |
| UX | — | not in scope: no frontend row |
| security | — | not re-run. Run 2's whole-repository audit stands, and the change since it is one method whose security property was tested directly (below) |

### What changed since Run 2

**[[Q159]] is closed, and criterion 1 is now held with no qualification.** Run 2 recorded that the
whole pass was demonstrated only with a client able to frame a body on a `GET`. The script that had
answered `401` twelve times running now returns `200 succeeded` on its first attempt, and the
read-back body matches the terminal callback field for field.

**The guard the correction had to preserve was tested, not argued.** A `POST` carrying bytes no
parser claims, signed as though it carried none, is still answered `401`; a `POST` genuinely
carrying no body, signed the same way, is still answered `202`. The signature verifier was not
modified, so its rule and its stated reasoning stand exactly as written.

**The test gap Run 2 named as the reason nothing caught this is paid.** Six tests now drive HTTP
against a real server on an operating-system-assigned port. Reverting the one-method correction
turns **four of the six red**, which is what says they hold anything; the two that stay green are
the unsigned cases, which must pass either way.

### Findings

1. **Criterion 4 is recorded short again, for the reason Run 2 gave and this run did not change.**
   The logger writes only under `NODE_ENV=production`, so no environment available here can
   demonstrate what a log carries. The criterion was checked by reading every call site instead;
   [[Q162]] is the one exception, and it has no path to content today.

2. **Run 2's open items stand, none of them blocking**: [[Q160]] `public/` served unsigned on all
   three ports, [[Q161]] the GraphiQL console mounted outside `NODE_ENV=production`, [[Q162]] the
   last raw `error.message` in a log line, [[Q163]] two GraphQL servers the product does not use —
   removing which would close five findings at once. The long-standing [[Q24]], [[Q154]], [[Q156]]
   and [[Q157]] are unchanged.

3. **Still owed from [[Q158]]:** no deployment runbook exists under `docs/`. It has to name
   `ai_agent_default_models` as the switch that turns a real provider on, and say to run one
   request afterwards and read `ai_model_calls` to see which model answered.

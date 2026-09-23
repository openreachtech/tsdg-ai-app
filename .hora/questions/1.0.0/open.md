# Open questions — 1.0.0

Append-only. Answered by editing `specs/1.0.0/`, not by editing this file.

---

## Q1 · undefined-detail · blocking: no

**Raised at** stage 1, 2026-09-22.

The annex records a "Phase 1 build brief" (its OPEN-01) as the document that fixes the
scope of the asset-media-extraction feature, and records it as missing. It was confirmed
at stage 0 as not available to this project.

W1's scope for 1.0.0 was therefore settled in conversation and approved section by
section, rather than read from that brief.

**What to do if the brief arrives:** read it against `#asset-media-extraction`'s use cases
and acceptance criteria. Where it contradicts what was approved, the contradiction is a
finding for `/hora-spec` at stage 1, not a silent correction.

**Not blocking** — the feature is fully specified without it.

---

## Q2 · orphan · blocking: no

**Raised at** planning, 2026-09-22.
<!-- spec: — -->

`specs/1.0.0/annex/reference/` holds 207 files that nothing links to from `spec.md`. Only
its `README.md` is linked.

- [x] resolved
      They are a code extract, read as a whole rather than as documents of their own, and
      the `Annex` table says so in as many words. Linking 207 source files individually
      would describe them as things somebody is meant to open one at a time. Nothing is
      extracted from them: the row is `Annex`, so they produce no feature and no task.

## Q3 · undefined-detail · blocking: no

**Raised at** planning, 2026-09-22.
<!-- spec: — -->

The spec did not say which database engine the automated suite runs on. The boilerplate
fixes `development` to SQLite while the spec's manual verification declares MariaDB, and
nothing in `specs/` recorded that the two cover different runs.

- [x] resolved
      A `Test engine` row was added to the non-functional requirements in this session,
      stating both engines, that the split is deliberate, and the risk it leaves open:
      `text('medium')`, `json` and `datetime(3)` behave differently on the two, so a type
      error can pass the suite and appear only on the engine that runs live.

---

## Q4 · undefined-detail · blocking: no

**Raised at** checkpoint 1 of #run-contract, 2026-09-22.
<!-- spec: run-contract -->

Of `#run-contract`'s ten acceptance criteria, only one named an HTTP status — `409`, for a
repeated idempotency key carrying a different body. The other nine said "refused" and no
more, so the contract the client system implements against did not say which status any
refusal carries, and that side has to branch on it.

- [x] resolved
      A `How a request is refused` table was added to `.hora/contracts/1.0.0/client-api.md`
      in this session, deriving one status per refusal from the criteria that state it:
      401, 403, 404, 409 and 422. It also states that every one of them happens before a run
      is created, so a run that was accepted and later failed is not among them. Nothing in
      `specs/` changed — the statuses follow from criteria already approved.

---

## Q5 · spec-assumption · blocking: no

**Raised at** checkpoint 3 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

`#run-contract` declares no route of its own, so "the API surface" half of checkpoint 3's
exit condition was judged vacuous for this feature and only the data model was verified.

The other reading is that the shared engine, the per-request context that resolves a client
from its signature, and the base renderer a service's POST extends **are** this checkpoint's
API surface — and none of the three is in the change set. Under that reading the checkpoint
would not be met.

The assumption taken is the first: those three are implementation rather than schema, and
belong to checkpoints 5 and 6. **What it costs if wrong:** checkpoint 6 must not be scoped
as though the engine's signature filter were already done. It is not — the engine's visas
still resolve on a user entity rather than on a client id and a signature.

## Q6 · spec-assumption · blocking: no

**Raised at** checkpoint 3 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

The run category's system key was written as `asset-media-extraction`. Neither the spec nor
the contract fixes that literal: the contract pins the five `statusName` values explicitly
but gives `runCategoryName` no such list, while echoing it back to the client and accepting
it as a `GET /v1/ai-runs?runCategoryName=` filter.

The value was derived from the feature's own id, the route `/v1/asset-media-extractions`
and the queue name, so it is consistent with everything already approved — but it is a
value the client system will compare strings against, and nothing states it.

**Cheap to change now, expensive once a seeder has shipped it.**


---

## Q7 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

The checkpoint 3 verifier reported that it had left the working tree "byte-for-byte
unchanged". It had not: it left `undefined/nonexistent-dir/x.sqlite3` in the backend
repository, a stray from a side probe into whether the sqlite dialect creates a missing
storage directory. The path's leading segment came out `undefined`, so the probe wrote
outside where it meant to.

It was untracked junk and has been removed. Nothing was lost.

- [x] resolved
      What is worth keeping is the lesson rather than the file: **a read-only agent's own
      claim that it changed nothing is not evidence.** A sibling unit noticed this
      directory in `git status` several steps later; nothing in the verification loop
      checked. Before a gate commits, `git status` is read for what is actually there,
      not for what an agent said would be there.


---

## Q8 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

`ApiClientSecretCipher#decryptSecret()` returns `null` for any envelope it cannot open —
tampered, malformed, or encrypted under a different key — rather than throwing. The request
path therefore stays clean: a client row whose ciphertext is corrupt degrades to "this
secret verifies nothing", which the signature verifier reports as a failed verification.

**What that costs, stated plainly:** the caller is told its signature is wrong when in fact
this service's own stored data is unreadable. A client would go and audit their signing
code over a fault on our side.

Neither the spec nor the contract distinguishes the two. The contract's `401` row covers
"a signature that does not verify", which is what the caller would see either way.

**For checkpoint 6, which wires the context, to settle.** The two readings:

- **refuse quietly, log loudly** — keep `null`, and have the layer that loads a client log
  a decryption failure as an operator-visible event. The refusal the caller sees is
  unchanged; the operator gets the truth. This fits the logging row of the non-functional
  requirements, which allows ids and reason codes
- **fail loudly** — a corrupt row becomes an error rather than a refusal. Honest to the
  operator at the cost of a second failure shape on a surface the contract describes as
  having one

Changing it is a change to the cipher's own contract and belongs in that file, not at the
call site.


---

## Q9 · reinvention · blocking: no

**Raised at** checkpoint 5 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

`RunKeyGenerator` mints its key with `crypto.randomBytes(32).toString('hex')` rather than
with `@openreachtech/mentsu-random-text-generator`, which **is** tracked by the catalog,
draws each character with `crypto.randomInt()`, and is already pinned in this repository's
`overrides`. The catalog rule says to record the near-miss rather than leave the reasoning
in a code comment, and no such record was made until now.

- [x] resolved — the decision stands, the record was what was missing
      The run key is specified as an opaque unguessable string and nothing more. The direct
      expression of that is one call into the standard library, and `.hora/tree/` already
      instructs that new cryptography here should read like `SessionCredentialGenerator`,
      which uses exactly this idiom. Taking the package would add a declared dependency to
      reach the same primitive.

      **What was wrong was the silence, not the choice.** A reader who later wonders why a
      catalogued package was passed over would have found only a prose argument inside a
      docblock, which is the thing the catalog rule exists to replace.

## Q10 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

The verifier of this checkpoint found that a signature validated more than one body.

The signed payload is `timestamp + "." + rawBody`, and the signature verifier accepted any
non-empty string as the timestamp. Because the delimiter also occurs inside a body, a caller
could move the boundary — claiming a longer timestamp and a shorter body — and present the
**same** signature over a **different** body. The verifier, read alone, accepted it.

What prevented it was a digits-only test living in a different class, which nothing obliged
a caller to run first, and which that class documented as a freshness concern rather than an
authentication one. **The safety of the whole scheme rested on a composition order nobody had
written down**, and checkpoint 6 is where that order would have been decided.

- [x] resolved
      The digits-only requirement now lives in the signature verifier itself, so the binding
      between one signature and one body holds whether or not anything else ran. The window
      inspector keeps its own check; the two no longer depend on each other.

      **Worth keeping as a lesson rather than a fix:** every individual guard here was
      correct, and the gap was between two correct classes written by two agents that each
      saw only its own file. A reading of either file alone finds nothing.

## Q11 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-contract, 2026-09-23. **Owed to checkpoint 6.**
<!-- spec: run-contract -->

Checkpoint 5's exit condition is that every module checkpoint 6 imports exists and works on
its own; it does not name tests, and none were written. So the signature-splitting property
closed as Q10 is **demonstrated but not guarded** — deleting the digits-only line makes no
suite go red.

Checkpoint 6 is where the tests for this feature's operations are written, so the guard is
owed there rather than late. What it has to cover, at a minimum:

| | |
|---|---|
| `ApiClientSignatureVerifier` | the honest pair accepted, and the re-split pair of Q10 refused — the second is the whole point, and it passes trivially against a verifier that never had the bug, so it must be written from the attack rather than from the fix |
| `RequestBodyDigester` | `undefined`, `null`, a number, an object and a `Buffer` each refused with `null`, and `''` digested normally. An empty body is a body |
| `ApiClientSecretCipher` | a round trip, and a tampered envelope refused rather than returning a wrong plaintext |
| `RequestTimestampWindowInspector` | both edges of the 300-second window, and the clock passed in rather than read |

**Why this is written down rather than carried in the head.** The property Q10 closed is
invisible in the file it lives in — one regular expression that reads like input hygiene. A
later reader tidying the class has nothing telling them it is load-bearing, and with no test
behind it, nothing stops them.

## Q12 · undefined-detail · blocking: no

**Raised at** the close of checkpoint 5 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

Checkpoints 4 and 6 carry the **same** not-applicable clause — "this feature adds no API
operation" — and #run-contract declares no route. Read flatly, both are n/a, and checkpoint 4
was already marked so.

That reading is wrong for 6, and the spec is what settles it. The section's own first sentence
says the feature delivers **the REST engine, the per-request context that resolves a client
from its signature, and the base renderer a service's POST extends**. None of the three exists
yet: checkpoint 3 built the data layer and checkpoint 5 built five helper modules. Marking 6
n/a would close the feature without the substance it names.

- [x] resolved — the two checkpoints split on the clause, and here is the line

      **4 is n/a and 6 is not.** A stub stands in for one concrete operation, and there is no
      operation to stand in for — so 4 has nothing to do. Checkpoint 6 is where the request
      path is actually implemented, and a base renderer is request-path work whether or not a
      route names it. **The clause asks whether the feature adds an operation; it does not ask
      whether the feature touches the request path.**

      This also keeps the six acceptance criteria where they can be met. Every one of them
      describes a request being accepted or refused, and 6 is the checkpoint whose exit
      condition requires a test per criterion. Sent to 18 instead, they would be the version's
      only unbacked criteria, at the one gate with no implementer to fix them.

      **Consequence for checkpoint 6's exit condition:** "under the same class name and
      interface as its stub" is read as satisfied where no stub was owed. The rest of the
      condition — the input validated, a test per acceptance criterion passing — stands whole,
      and it is the part that carries the gate.

      [[Q11]] is the regression guard owed to that same checkpoint, and it stands as written.

## Q13 · contradiction · blocking: no

**Raised at** checkpoint 6 of #run-contract, 2026-09-23. **Not this checkpoint's to settle.**
<!-- spec: run-contract -->

A baseline run of the suite, taken before checkpoint 6 wrote anything, is **red**: 3 suites
and 7 tests fail out of 139. All three are the boilerplate's GraphQL engine tests, and the
cause is not a defect:

| | |
|---|---|
| the tests assert | `lifetimeDays: 14`, `secure: true` — the boilerplate's own defaults |
| the project set | `AUTH_REFRESH_TOKEN_TTL_DAYS=30`, `AUTH_COOKIE_SECURE=false`, at `/hora-setup` |

The boilerplate ships tests that hard-code its default environment values, so **any project
that fills those values in turns them red**. The values here are deliberate and carry their
reason in `.env.development`: this service authenticates machines by signature and issues no
cookie, and an empty value would resolve `secure` to `true`.

**The larger finding underneath it.** `server/index.js` still starts three listeners —
Customer GraphQL on 3900, Admin GraphQL on 5800, and the REST engine on 8001. The spec's
§2.1 declares **two** servers, `client-api` and `worker`. The two GraphQL engines are
boilerplate this project never declared, and the red tests are theirs.

So the choice is not "fix seven assertions":

- **remove the undeclared surface** — the two GraphQL engines, their tests, and their
  listeners go, leaving the repository matching what the spec declares. The red goes with
  them. This is a deletion of a whole surface, so it is a person's call, not a checkpoint's
- **keep them and correct the assertions** — cheaper now, and it keeps a GraphQL surface
  nothing has specified, with cookie settings nothing reads

**Why this does not block checkpoint 6.** Its step 8 runs the suite over exactly the files
the checkpoint wrote, so a failure in a surface this feature does not touch is outside its
signal. It is recorded here so the gate is not later read as having passed a green suite.

- [x] the seven failing tests are closed — checkpoint 18, run 1 finding 1
      Not by correcting the assertions, which was the cheaper of the two options offered above
      and would have left three tests whose titles describe a precondition they never establish.
      The root cause was a missing seam: both cookie getters read `renchan-env`'s facade inline,
      and that facade refuses every write by design, so the fallback branch each getter declares
      could not be reached from a test on any machine. A `static get env ()` now stands between
      them, and the suite is green at 524.

      **The question underneath is still open, and it is still a person's.** `server/index.js`
      starts Customer GraphQL and Admin GraphQL, two servers the spec's §2.1 does not declare.
      Fixing their tests made them correct; it did not make them declared. Removing that surface
      is a deletion nobody has authorised, and keeping it means carrying a GraphQL API with
      cookie settings nothing in this product reads.

## Q14 · lacked-environment · blocking: no

**Raised at** checkpoint 6 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

`npm run test` cannot run on this machine, and the cause is narrower than the one already
recorded in `.hora/tree/tsdg-ai-backend.md`.

```
db:setup = sequelize-cli db:migrate;
```

npm runs a script through `cmd.exe` on Windows, where `;` does not separate commands, so the
CLI receives the command `db:migrate;` and rejects it with `Did you mean db:migrate?`.
`test.sh` runs under `set -e`, so the whole suite aborts **before any test runs** — a run
that looks like a test failure and is not one.

- [x] resolved — worked around, not fixed
      The suite is run by calling the steps directly under bash: `npx sequelize-cli
      db:migrate`, then the two `db:seed:all` calls, then `npx jest` per tree. The boilerplate
      script is left as it is; changing it is the boilerplate's decision, and the earlier
      record of the `export NODE_ENV=…` form belongs to the same root cause.

      **Worth keeping:** the failure mode is the dangerous kind. It exits non-zero from a
      test command having run no tests, so a reader who does not open the log concludes the
      tests failed.

## Q15 · upstream-defect · blocking: no

**Raised at** checkpoint 6 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

In the installed `hora-skills-ort-renchan 0.2.1`, the Jest example at the end of
`hor-resolver-validator/references/validator-pattern.md` is **textually scrambled** — the
`cases` array has its object literals interleaved, so the block is not valid JavaScript.

Found by the agent digesting that skill, which reconstructed the intent rather than copying
broken code, and said so. No project file is affected; the report is owed upstream against
that package version.

## Q16 · undefined-detail · blocking: no

**Raised at** checkpoint 6 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

The test files the boilerplate shipped use **two vocabularies at once**. Counted across
`tests/__tests__/app/session/`:

| | |
|---|---|
| `input:` | 16 |
| `params:` | 4 |
| `const received` | 10 |
| `const actual` | 8 |

`hoc-jest` fixes one of them — case fields `input` / `expected` / `override` / `tally`, and
the Act value named `received`. The other set is what a different ORT project family uses.

- [x] resolved for this project — `hoc-jest` is the standard, and it is also the majority here
      Checkpoint 6's implementer flagged the split and reported the repository as using
      `params` / `actual`. That reading was checked and is wrong: the repository leans the
      other way, and the equipped skill agrees with the majority. New tests follow `hoc-jest`.

      **What is left is the minority, not a decision.** A handful of shipped files still read
      the other way, and nothing marks them as the odd ones. Bringing them across is a tidy-up
      nobody has scheduled, and it is not checkpoint 6's to do — it would rewrite tests of a
      surface this feature does not touch.

## Q17 · undefined-detail · blocking: no

**Raised at** checkpoint 6 of #run-contract, 2026-09-23. **Needs a criterion, so it is /hora-spec's.**
<!-- spec: run-contract -->

Neither the spec nor the contract says what **two simultaneous requests carrying one
idempotency key** do.

Both miss the lookup, both insert, and the unique pair `(ApiClientId, requestKey)` makes the
loser raise — which the framework turns into a `500`. So the invariant the spec states holds:
a second run cannot exist. **What breaks is the answer, not the data** — the loser is told the
service failed, when in truth its run was created and is waiting for it.

The implementer deliberately did not build the catch-and-re-read, and said why: it is a branch
reachable only by mocking the lookup away, and every stated criterion is sequential. That is
the right call for a checkpoint whose gate is the criteria.

The fix is one criterion — *a request that loses the race for an idempotency key answers with
the run that won it* — and then a catch around the insert that re-reads on a unique violation.

## Q18 · undefined-detail · blocking: no

**Raised at** checkpoint 6 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

The contract says **"a callback URL that does not match the client's registered prefix is not
called at all"** — enforced at delivery time. `#run-contract` carries no acceptance criterion
about the prefix, so the validator built here checks only that `callbackUrl` was **sent**, and
never compares it to `ApiClient.callbackUrlPrefix`.

That is faithful to what is written, and it may not be what is wanted: a caller that registers
one prefix and sends another is accepted, charged a run, and then silently never called back.
Refusing it at acceptance would tell them immediately.

Both readings are defensible — delivery-time enforcement is the security boundary and must
stay either way; the question is only whether acceptance should also refuse early. It needs a
criterion before it can be built.

## Q19 · undefined-detail · blocking: no

**Raised at** checkpoint 7 of #run-contract, 2026-09-23. **Owed to #run-execution.**
<!-- spec: run-execution -->

`AiRunAcceptor#saveAiRun()` takes no `transaction` and passes none to `AiRun.create()`.

Nothing is wrong today — a single-row insert is atomic on its own, and #run-contract dispatches
nothing. But #run-execution carries the criterion **"the job for a run is dispatched only after
the transaction that created the run has committed; a transaction that rolls back dispatches
nothing"**, and that criterion needs a transaction to exist around the insert it is talking
about.

So #run-execution will arrive at a method with no seam for it. The cheap route is an optional
`transaction` parameter threaded into the `create()` call — additive, and it leaves every
current caller untouched. The expensive route is discovering this while writing the dispatch
and reshaping the acceptor under a feature that was supposed to only add a worker.

**Recorded now rather than fixed now** because #run-contract has no transaction to open: adding
a parameter nothing passes would be building for a requirement this feature does not carry.

## Q20 · missing-skill · blocking: no

**Raised at** checkpoint 7 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

The placement skill offers three ways to trigger a worker: request-based (the handler enqueues),
schedule-based, and **post-worker** — a side effect run after the response.

**The third one has no REST form.** Every statement the skill makes about post-workers is bound
to GraphQL: the base class is `BaseGraphqlPostWorker`, the hook fires as `onResolved` per
GraphQL operation, and it is enabled by setting `postWorkersPath` on the **GraphQL** engine. It
names no equivalent hook or base class for a `server/restfulapi/renderers/**` renderer, and does
not say whether that placement is reachable from REST at all. The source repository it was
written from has `postWorkersPath: null`, so there is no precedent to read the answer off.

This cost #run-contract nothing — it has no side effect to defer. It is recorded because this
project's only API surface is REST, so the first feature that wants "do this after the response
has gone out" has two of the three triggers available and no documented route to the third.

The request-based trigger **is** documented for REST, and is the likely answer in most cases:
the renderer enqueues, the worker does the work. A feature should reach for a post-worker only
when the work must not be part of what the caller waited for, and should expect to settle the
mechanism itself.

## Q21 · undefined-detail · blocking: no

**Raised at** checkpoint 8 of #run-contract, 2026-09-23. **MEDIUM. Needs a person, and a contract change.**
<!-- spec: run-contract -->

The security audit found that **one captured signature can create more than one run.**

The signed payload is `timestamp + "." + rawBody`. It does not cover the `Idempotency-Key`
header, nor the HTTP method, nor the path. So a signature captured within the 300-second
window can be replayed with a **different** idempotency key: the lookup on
`(ApiClientId, requestKey)` finds nothing, and a second run is created from one signature.

**Idempotency is what the design leans on to stop a replay, and the key that enforces it is
the one thing not signed.** The same gap lets a body signed for one service's route be
replayed against another's once a second AI service exists, since the run category comes from
the route's renderer rather than from the signed bytes.

Severity is MEDIUM, not HIGH: TLS covers the wire, and the harm is a duplicate run that gets
charged rather than any disclosure. But it is a hole in the mechanism that was supposed to
close it.

**Recommendation: sign more.** Put the method, the path and the idempotency key into the
payload — `method + "." + path + "." + timestamp + "." + idempotencyKey + "." + rawBody` or a
shape of your choosing. The alternative, a nonce store in Redis rejecting any signature seen
twice inside the window, keeps the contract still but adds a piece of infrastructure and a
piece of state to operate.

**Why the timing matters more than the fix does.** 1.0.0 is unreleased and no client has
integrated, so today this is an edit to a contract nobody implements yet. After a client has
built against it, changing how a request is signed is a coordinated release across two
companies.

## Q22 · contradiction · blocking: no

**Raised at** checkpoint 8 of #run-contract, 2026-09-23. **MEDIUM.**
<!-- spec: run-contract -->

`specs/1.0.0/spec.md` §7 carries a non-functional requirement:

> | Rate limiting | the run-creating request is limited per client. The idempotency key stops a
> repeat of the same request; it does nothing about a thousand different ones, and each run
> costs three model readings |

**Nothing implements it, and no feature owns it.** The audit confirmed there is no limiter
anywhere: every unauthenticated request costs a database query on `api_clients`, and a request
naming a real client costs two AES-256-GCM decryptions plus up to two HMAC computations before
being refused. Nothing bounds the rate.

The requirement is written, so this is not a scope question about whether to do it — it is a
question of **who**, and of what criterion it is tested against. No feature in `_plan.md`
carries an acceptance criterion about it.

Three ways out, and it needs one:

- **#run-contract builds it.** Architecturally the right home — this feature owns the shared
  entry, and a limiter belongs in front of the filter. It needs an acceptance criterion added
  to the spec first, so there is something to test against
- **a later feature owns it**, named explicitly, so it stops being nobody's
- **it is infrastructure**, enforced at the reverse proxy rather than in the application. Then
  the spec should say which layer enforces it, or both layers will assume the other did

## Q23 · undefined-detail · blocking: no

**Raised at** checkpoint 8 of #run-contract, 2026-09-23. **Findings accepted rather than fixed.**
<!-- spec: run-contract -->

The audit's other findings against this feature, each accepted deliberately.

**[LOW] Whether a client key exists is observable from how much work a refusal costs.** An
unknown client key returns straight after the lookup; a real one always runs two decryptions
and a full HMAC sweep. Both answer the same `401`, so nothing in the *content* leaks — the
*work* does.

- [x] accepted
      The mitigation is a dummy verification against a throwaway secret, whose only purpose is
      to burn the same time. The database query dominates the cost of both paths, so the delta
      is small, and the auditor listed measuring it as something a read-only audit could not
      do. **Adding a code path that exists to waste time, against an unmeasured signal, is not
      a trade worth making blind.** Revisit if the timing is ever measured.

**[LOW] `ai_runs.callback_url` stores unvalidated caller text — an SSRF sink whose guard does
not exist yet.** Nothing restricts the scheme, so `file://`, an internal address or a cloud
metadata endpoint is accepted and stored.

- [x] accepted here, and it becomes an obligation elsewhere
      The contract enforces the registered prefix **at delivery time**, and this feature has no
      criterion about it — see [[Q18]], which is the same gap read from the spec's side. What
      the audit adds is the sink's name: the row is written now and read by a feature that does
      not exist, so the guard must be treated as that feature's obligation rather than as
      something it may choose.

**[INFO] Development seeders carry guessable run keys** (`run-key-10010001`). A run key is a
bearer credential for reading one run.

- [x] accepted
      `seeders/development/` never runs live, and the `master/` seeders in the change set hold
      only reference rows. Recorded because copying this pattern into a live seeder would be a
      HIGH finding.

## Q24 · undefined-detail · blocking: no

**Raised at** checkpoint 8 of #run-contract, 2026-09-23. **Boilerplate, not this feature's.**
<!-- spec: run-contract -->

The audit found four things outside this feature's change set. Each was checked against the
diff to confirm the feature did not touch it. They are recorded here because nobody else is
going to write them down.

| | |
|---|---|
| **[MEDIUM]** `cors({ origin: '*' })` in the REST engine | no `credentials: true`, and the API is machine-to-machine with no cookie, so it buys an attacker little today — and becomes a real problem the moment a browser surface reaches it |
| **[MEDIUM]** `sequelize/config.cjs` | credentials hard-coded in the `live` and `staging` blocks, and **no TLS option on any non-local connection** |
| **[LOW]** `express.static('public/')` is mounted **before** the auth filter | anything under `public/` is served unauthenticated, which contradicts the contract's own sentence that nothing is reachable without the signature headers. `public/` currently holds one placeholder file |
| **[LOW]** `.env.development` and `.env.live` are tracked, while `.gitignore` lists only bare `.env` | no real secret is in either today, but a credential written into `.env.live` would be committed by default |

None is this feature's to fix, and fixing them here would put boilerplate changes inside a
feature's gate. They belong to whoever owns the boilerplate.

## Q25 · upstream-defect · blocking: no

**Raised at** checkpoint 8 of #run-contract, 2026-09-23.
<!-- spec: run-contract -->

**`@openreachtech/mentsu-logger@2.0.3` never prunes a rotated log file.**

`WinstonLoggerClient.generateTransports({ filePath, maxFileSize })` builds two
`DailyRotateFile` transports with `datePattern` and `maxSize`, and **neither with `maxFiles`**.
`winston-daily-rotate-file` deletes a rotated file only when `maxFiles` is set, so `maxSize`
splits the log into more files rather than bounding the total. Nothing reaches those options:
`createLoggerClient({ filePath, maxFileSize })` takes no `maxFiles` and passes none, and
`MentsuLogger.create({ filePath, env })` sits further upstream still. There is no option, env
var or subclass hook that gets there.

**How this surfaced.** Checkpoint 8's first audit asked for authentication failures to be
logged, which was right — key probing left no trace at all. The re-audit then found that the
fix had turned an unbounded stream of credential-free requests into an unbounded stream of disk
writes, on a path needing no client id whatsoever.

- [x] mitigated in rate, not in retention
      The one log line an unauthenticated caller could drive at will — a request naming no
      client key — was removed. It carried nothing attributable anyway: no id to record, and
      one fixed reason code. What remains on disk is driven only by refusals that require
      **knowing a valid client key** first, which is a far higher bar and is exactly the signal
      worth keeping.

      **That is a reduction in rate, not a bound on retention.** Until the package threads
      `maxFiles` through, log-volume retention is an operational concern outside this
      repository, and a deployment needs logrotate or an equivalent at the infrastructure
      layer. **Removal condition:** a `mentsu-logger` release that accepts a retention value;
      then `ApiClientAuthenticationLogger` passes one and the rate-based mitigation stops being
      load-bearing.

## Q26 · lacked-environment · blocking: no

**Raised at** checkpoint 9 of #run-contract, 2026-09-23. **Owed to checkpoint 17 and to acceptance.**
<!-- spec: run-contract -->

**The backend cannot start on Windows.**

```
$ NODE_ENV=development node server/index.js
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node
are supported by the default ESM loader. On Windows, absolute paths must be valid file://
URLs. Received protocol 'd:'
```

`sequelize/_.js` hands `SequelizeActivator` a path built by `rootPath.to(...)`, which returns
a bare Windows path (`D:\ORT\...`). The activator dynamic-imports it, and an ESM dynamic
import of a bare absolute path is refused on Windows — it needs a `file://` URL. The same
failure stops any standalone script that activates Sequelize.

**Jest is unaffected**, because it resolves modules through its own resolver rather than the
ESM loader. That is why the whole suite runs green on a machine where the server will not boot.

- [x] worked around for checkpoint 9, not fixed
      This checkpoint's walk was driven through Jest instead of over HTTP, which exercised the
      same classes with the same database and the same cryptography. What it could not exercise
      is the framework's own routing — that a refused request never reaches a renderer rests on
      framework behavior read rather than run (see [[Q27]]).

      **What it blocks is later, and it is real.** Checkpoint 17 builds a local end-to-end
      environment and `/hora-accept` stops without one, so this has to be settled before either.
      It is a boilerplate defect, not this feature's: the fix is `pathToFileURL()` around the
      paths `rootPath.to()` produces, inside `renchan-sequelize` or in whatever hands them over.

## Q27 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #run-contract, 2026-09-23. **Owed to checkpoint 18.**
<!-- spec: run-contract -->

Checkpoint 9's walk drove all three use cases end to end and they pass — a signed request
answers `202` with the four fields the contract names, a repeat under the same idempotency key
answers **the identical run key and accepted time**, and both secrets are accepted during a
rotation. Two refusals were walked too: a switched-off client answers `403`, and a body altered
by one byte is stopped at the filter.

**That walk was a throwaway harness and was deleted.** It was written to verify, not to
convention: it logged to the console, asserted on bare booleans, and sat in `tests/_orders/` under
a name Jest matches directly, which the run-order barrel exists to prevent.

What it proved is worth keeping, and checkpoint 18 is where it belongs — its own gate is
"Acceptance (E2E and unit both)". Written there, to `hoc-jest`, it is the only thing that pins
the **composition**: that the context resolves a caller, the engine's filter admits or refuses on
that result, and the renderer is reached only when it admitted. Every current test exercises one
of those links alone.

Two harness facts worth carrying over so it does not have to be rediscovered:

- a renderer must be handed the framework's `RestfulApiRequest`, not a bare express request —
  the adapter reads the idempotency key through `request.expressRequest.headers`, so a plain
  object makes every request answer `422`
- `RestfulApiRequest.create()` proxies `expressRequest.params`, so the fake request needs one


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

- [x] resolved at checkpoint 18, which reopened checkpoint 6 to do it
      The debt was nearly closed on the strength of a green suite. It was not: four classes
      built at checkpoint 5 had **no test file at all**, and deleting the digits-only line from
      `#hasSignatureMaterial()` left all 504 tests passing. The paragraph above turned out to be
      exactly right about its own fate.

      All four now have one, and the re-split case is written from the attack rather than from
      the fix — the same signature literal presented once honestly and once with the boundary
      moved, so it can fail for that and nothing else. Verified by deleting the line again: the
      case goes red by name. The suite stands at 759.

      **The lesson is about the check, not the code.** "Is this guarded?" cannot be answered by
      reading a test list or by a passing run. It is answered by breaking the thing and watching
      something go red.

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

## Q28 · undefined-detail · blocking: no

**Raised at** the /hora-plan re-entry after #run-contract was accepted, 2026-09-23.
<!-- spec: run-contract -->

Four sections drifted from the digests their feature files recorded: `run-cancel`,
`run-contract`, `run-delivery` and `run-record`.

The cause is one commit, `b4fca89`: the British `cancelled` corrected to `canceled` throughout
the spec, in fifteen places — including the `canceled_at` column of `ai_runs` and the seeded
value of `ai_run_statuses`.

**A column name and a master-row value are data model, and the reconciliation table says a
data-model change clears from checkpoint 3.** Nothing was cleared, deliberately.

- [x] resolved — no checkpoint cleared, and here is why that is not an oversight
      **The spec was corrected toward the code, not away from it.** `no-restricted-syntax`
      refuses the British spelling by identifier, so the implementation was `canceled` from the
      first line written; the document was the thing that was wrong. Verified rather than
      assumed: the migration declares `CANCELED_AT: 'canceled_at'`, the master seeder seeds
      `canceled`, and a grep across `app/`, `server/`, `sequelize/`, `constants/` and `tests/`
      finds no surviving British form.

      So nothing built against the old text exists to be stale. Clearing checkpoint 3 of
      #run-contract would rebuild a migration into exactly itself, and the other three features
      have not been built at all — every one of their checkpoints is already `[ ]`.

      **Recorded because a digest that moved with no checkpoint cleared is indistinguishable
      from a reconciliation nobody ran.** The digests are now updated to the corrected text.

## Q29 · forward-reference · blocking: yes

**Raised at** checkpoint 1 of #run-record, 2026-09-24. **Routed to /hora-spec, stage 2.**
<!-- spec: run-record -->

`#run-record`'s fourth acceptance criterion cannot be met at its own gate.

> each model call is recorded with its model, its input and output token counts, and its outcome

`ai_model_calls.AiModelId` is `bigint NOT NULL`, and it points at `ai_models` — a table declared
in **§17 Provider layer**. The build order puts `#provider-layer` fourth and `#run-record`
second, so at `#run-record`'s gate that table does not exist and there is no row to reference.
A model call cannot be written at all, let alone checked.

Checkpoint 1's exit condition is that every criterion be checkable **against a product in which
this feature and its `depends` are built and nothing later is**. `#run-record` declares
`depends: run-contract` and nothing else, so `#provider-layer` is strictly later.

**This is a data dependency the annotations do not carry, not only a criterion that reaches
forward** — the `NOT NULL` column is what makes it real rather than a matter of wording.

- [x] resolved — but **not by the reorder that was first agreed**, which turned out to be
      impossible

      Checking `#provider-layer`'s own `depends` before writing the edit showed a **cycle**:
      `run-record → provider-layer → run-execution → run-record`. The first framing put to the
      author was incomplete — it named the missing edge without checking what the other feature
      already declared — so the choice was put again with the real shape.

      The two features depend on each other **as specified**: `ai_model_calls` sat in
      `#run-record` while `ai_models` sits in `#provider-layer`, and each one's criteria read the
      other's table. `#provider-layer`'s criteria 3 and 6 name what a model call records;
      `#run-record`'s criterion 4 names the model it points at.

      **The cut: `ai_model_calls` moves to `#provider-layer`**, with the use case and the
      criterion that read it. A call is only meaningful against the model that answered it, and
      that catalog is provider-layer's. The table's only outward edge is then `AiRunId` into
      `ai_runs`, which `#run-contract` already builds — so provider-layer depends on
      `#run-contract` alone and stands second.

      Two further corrections fell out of the same walk. `#provider-layer` declared
      `depends: run-execution`, which nothing in it needs — not one of its tables reaches the
      worker. And `#retention` declared `depends: run-record` while its criteria read
      `ai_model_calls` (now provider-layer's) and `provider_uploaded_files` (§18's); that second
      edge had been missing all along, and the order happened to satisfy it, which is why nobody
      had seen it.

      The new order was walked end to end: **zero forward edges**.

      **The cheaper-looking option was the wrong one, twice over.** Declining this cut the first
      time was reasonable on the framing given — it was only after reading §17 that "split
      recording a run in half" turned out to mean "put the record of a call next to the catalog
      it points at".

      **What was decided first, and why it is recorded rather than erased.** The original answer
      was "reorder — `#provider-layer` moves ahead of `#run-record`", chosen over this cut and
      over relaxing the column to `NULL`. It is kept here because the reasoning against this cut
      was sound on the information given, and because the correction came from checking one more
      annotation rather than from anybody changing their mind.

## Q30 · spec-assumption · blocking: no

**Raised at** checkpoint 1 of #run-record, 2026-09-24.
<!-- spec: run-record -->

`#run-record`'s seventh acceptance criterion ends:

> …and none of that is content, so none of it is removed by the content purge

Read as a behavior, that reaches `#retention` — feature eleven, built last — and would be a
second forward reference. Read as a structural property, it says these columns are not content
columns, which the schema answers on its own.

- [x] resolved — the structural reading, confirmed rather than assumed
      Checked with the author rather than decided here, because half of what looks like a hole
      in a spec is a hole in the reading of it. The criterion is checkable at this feature's own
      gate by inspecting the columns, and no spec change is owed.

      What `#retention` still owes is its own criterion about what the purge removes. That is
      its gate's, not this one's.

## Q31 · forward-reference · blocking: no

**Raised and resolved at** checkpoint 1 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

The feature's first use case read:

> ORT runs the whole service — the job, the steps, the result — on a machine with no API key
> and no outbound access, because a default installation answers on the stub

**The job, the steps and the result belong to `#run-execution`, `#run-record` and
`#run-delivery`**, all built after this feature. Checkpoints 2 and 9 verify use cases, and
neither could verify this one where it stands. Verified rather than assumed: none of
`#provider-layer`'s eleven tables is a job, a step or a result — they are providers, models,
capabilities, tools, agents and instructions.

- [x] resolved — narrowed to what this feature does
      > ORT installs the service on a machine with no API key and no outbound access, and the
      > provider layer answers on the stub: nothing reads a key and nothing opens a connection

      **Nothing was lost by narrowing it.** The end-to-end reading is already the version's own
      second criterion — "the whole of that pass is demonstrable with no API key and no provider
      call, because the stub answers deterministically", `spans: #provider-layer,
      #asset-media-extraction` — checked at the sweep, which is the one run that can check it.
      What the feature said twice, in one place where it could not be checked, it now says once
      where it can.

## Q32 · spec-assumption · blocking: no

**Raised at** checkpoint 1 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

The first acceptance criterion reads "a default installation answers **every service** on the
stub: no key is read and no outbound connection is opened". No service exists at this feature's
gate, so read as a claim about services it is vacuous, and read as a property of the
installation it is checkable now.

- [x] resolved — the structural reading, by the precedent set at [[Q30]]
      The substance is the installation's default state: the stub is what a fresh install runs,
      no key is read, no connection is opened. All three are checkable against this feature
      alone. The quantifier over services is what the version's own second criterion carries.

      Decided by precedent rather than asked again, because the same question about the same
      shape was settled one feature earlier.

## Q33 · spec-assumption · blocking: no

**Raised at** checkpoint 2 of #provider-layer, 2026-09-24. **Binds checkpoint 3.**
<!-- spec: provider-layer -->

Use case 3 — "ORT reproduces a result from months ago, because the prompt version each call
used is recorded against it" — walks only if the recorded version can be resolved back to the
text that was sent.

`ai_model_calls.prompt_version` records it. The history sinks it would resolve against,
`ai_agent_default_instructions_bk` and `ai_agent_role_instructions_bk`, carry "identical
columns" to the live rows: `AiAgentId`, `instruction`, `saved_at`. **None of them is a version
identifier**, so a call recording `prompt_version = X` has nothing to join X to. Matching by
`saved_at` earlier than the call time reconstructs a guess; it does not read a record.

- [x] resolved — achievable as written, under a stated assumption
      The use case is met provided `prompt_version` is **chosen to identify a history row**
      rather than to describe one — the `saved_at` of the instruction in force, or a value
      carried on the sink row itself. The spec constrains the value nowhere, so this is a
      design decision checkpoint 3 makes, not a hole checkpoint 2 must send back.

      **Recorded because the assumption is invisible at the point it gets broken.** A
      `prompt_version` written as "v3" or as a model name satisfies every column constraint,
      passes every test that checks a call records one, and quietly makes use case 3
      unachievable — which nothing would discover until somebody actually tried to reproduce a
      months-old result.

      **Settled at checkpoint 3, by reading the code rather than the conventions.** Two equipped
      skills disagreed on what the backup mixin writes: `hor-ai-prompt-document-store` says
      `.save()` copies the **pre-change** row into the sink, `hor-sequelize-model` says it is an
      `afterSave` clone of the **new** values. The two imply different `savedAt` values in the
      sink, and therefore different answers to whether a version can be addressed at all.

      `BackupMixinModel.setupHooks()` settles it: an `afterSave` hook building the sink row from
      `entity.get(key)`. **The newly saved values.** So the sink holds every version an
      instruction has ever had, each with its own `savedAt`.

      **`prompt_version` is therefore the `savedAt` of the instruction in force**, which
      addresses exactly one sink row and resolves a months-old call back to the text that was
      sent. Checkpoint 3 builds it that way.

## Q34 · upstream-defect · blocking: no

**Raised at** checkpoint 3 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

In `hora-skills-ort-renchan 0.2.1`, `hor-ai-prompt-document-store` states that the backup mixin
**"copies the pre-change row"** into the `*Bk` sink on `.save()`. The sibling
`hor-sequelize-model` in the same package describes the opposite: an `afterSave` clone of the
newly saved attributes.

The installed code settles it —
`node_modules/@openreachtech/renchan-sequelize/lib/models/mixins/BackupMixinModel.js`:

```js
this.afterSave(async (entity, options) => {
  const values = Object.fromEntries(
    Object.keys(this.getAttributes())
      .filter(key => !accessoryKeys.includes(key))
      .map(key => [key, entity.get(key)])
  )
  await this.BackupModel.build(values).save({ transaction: options.transaction })
})
```

`entity.get(key)` after the save is the **new** value. `hor-sequelize-model` is right;
`hor-ai-prompt-document-store` is wrong, and the two skills ship in one package.

- [x] worked around — the digest is corrected, the skill is not
      `.hora/digests/hor-ai-prompt-document-store.md` now states the verified behaviour and marks
      the skill's sentence as wrong, so no implementer reads the false version. The skill itself
      is the package's to fix.

      **It is not a wording slip.** Which row lands in the sink decides whether a stored version
      identifier can address one — [[Q33]] turned on exactly this, and the wrong reading would
      have made a recorded `prompt_version` point at the version *before* the one that was used.

## Q35 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

§17 opens with a provenance claim that is **wrong for three of its eleven tables**:

> Ported as a set from `annex/reference/leepai/`. The tables below are that store; their column
> detail is in the extract, and the port is expected to match it rather than restate it.

`specs/1.0.0/annex/reference/leepai/sequelize/models/` holds exactly 20 files, every one of them
`AiAgent*` or `AiTool`. **There is no `AiProvider.js`, no `AiModel.js` and no capability model**
— and none in `rgp-yazaki/` or `linoa/` either. Two units found the absence independently, from
opposite ends, before it was checked centrally.

So the catalog the whole feature pivots on — the provider, the model, and the model's limits —
has no extract to be matched against, while the sentence says it does.

- [x] resolved — nothing was blocked, because the spec states those columns itself
      §17's own row names them: `ai_providers` (`name`), `ai_models` (`AiProviderId`, `name`,
      `target_model_name`, `is_default`, `is_active`, `display_order`), `ai_model_capabilities`
      (`AiModelId`, `context_window_token`, `max_output_token`). That list is the authority for
      these three, and the units were told so.

      **What is wrong is the claim, not the content.** "Match the extract rather than restate it"
      reads as an instruction to go and find something, and an implementer who takes it at its
      word either stalls or — worse — fills the gap from the nearest thing that looks similar.
      The sentence holds for the agent and tool tables; it should say so rather than covering the
      whole set.

## Q36 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #provider-layer, 2026-09-24. **A defect in a brief, not in the product.**
<!-- spec: provider-layer -->

Two instructions in this checkpoint's unit briefs were wrong, and both were caught by an
implementer checking the repository instead of trusting what it was handed.

| What the brief said | What the tree says |
|---|---|
| "index names come from a `SHORT_COLUMN_NAME` map" | **no migration in this repository defines one.** `.hora/digests/hor-sequelize-migration.md` says to shorten only when a name runs long, and not to shorten when it fits |
| — | `ai_models` must be `BIGINT`, because `ai_model_calls.AiModelId` is. Had one unit typed the catalog `ID_INTEGER` to match the sibling masters, **SQLite would have accepted the mismatch silently** and it would have surfaced on MariaDB |

- [x] resolved — the briefs were corrected mid-run and the second risk was closed before it landed
      The `SHORT_COLUMN_NAME` instruction came from the always-on ORT rules, which describe a
      different repository's migrations. It was carried into the brief as though it were this
      repository's convention.

      **Worth keeping because of how it was caught.** Nothing in the process would have flagged
      either one: a wrong index-naming instruction produces working code, and the integer/bigint
      mismatch produces a green suite on the test engine and a failure on the one that runs live
      — which the non-functional requirements already name as this project's known engine gap.
      Both were found because an implementer treated its brief as a claim to check rather than an
      order to follow.

## Q37 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

§17's table list carries `ai_agent_available_ai_tools` — which agent may use which tool — and
**no `ai_model_tool_assignments`**, which is the other half of the same subject: which tool a
given vendor's model can actually serve.

The two are genuinely different relations and the unit that built the first one settled that
rather than merging them:

| | Binds | Says |
|---|---|---|
| `ai_agent_available_ai_tools` | tool ↔ **agent** | this service is permitted to use this tool, whether it is on, whether it is offered unasked. A product decision |
| `ai_model_tool_assignments` | tool ↔ **model** | this vendor's model supports this tool. A capability fact |

**They are allowed to disagree** — a model may support web search while a given agent is not
permitted to use it — which is exactly why one cannot stand in for the other.

The extract carries both as separate models, and its agent-update path uses the second to
**refuse a tool the model cannot serve**. This version has no such table, so that check cannot
be written here.

- [x] resolved — read as deliberate, and consistent with the rest of §17
      §17 states plainly that there is **no operation for editing a prompt this version**: a
      change is a direct database write by an operator on the machine. The refusal the extract
      performs happens at exactly that write, in a mutation this version does not build — so the
      table whose only stated use is backing that refusal has nothing to back.

      **Recorded rather than passed over, because the absence is load-bearing the moment an admin
      console arrives.** §4 already defers that console; when it lands, the tool-choice it offers
      an operator has no capability table to validate against, and the missing check is a data
      integrity hole rather than a missing convenience. The feature that builds the console owes
      this table, or owes a stated reason not to.

## Q38 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

Three gaps in §17's catalog, found while building it. None blocked the work; each was decided
and the decision is recorded here rather than left in a migration comment.

**1. `ai_providers` is given one column, and one column is not a reference master.** §17 names
`name` alone. Every reference master in this repository and in `hor-database-design`'s own
standard set carries `name` / `display_name` / `display_order` / `is_active`, and the two this
project already built (`ai_run_categories`, `ai_run_statuses`) carry exactly those. The table was
built with all four. **`is_active` in particular is the only honest way to retire a vendor**
without deleting a row that recorded history points at.

**2. `is_default` has no stated scope.** The criterion "turning a real provider on is a
deliberate change of one setting" implies exactly one default — but the spec never says whether
that is one default model per installation or one per provider, and the two need different
constraints. **No constraint was built**, deliberately: a UNIQUE index on a boolean would forbid
a second *non*-default row, so there is no correct column-level expression of either reading. It
is a rule the selection code enforces, and it needs a spec line before that code is written.

**3. The stub's own capability figures are unstated.** The spec requires the stub path to be the
real path, so it needs a capability row — but nothing says what a stub's context window and
output ceiling are. Seeded as `200000` / `8192`, chosen so the payload gets **built against
real-sized numbers** rather than skipped; a default installation has to exercise that building.
A spec line would be better than an implementer's judgment.

- [x] recorded — the work proceeded on the readings above, all three stated
      Each is a decision somebody can overturn cheaply now and expensively later. The first two
      are schema; the third is a seeded figure.

## Q39 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #provider-layer, 2026-09-24. **A defect in the briefs, again mine.**
<!-- spec: provider-layer -->

`.hora/digests/hor-sequelize-migration.md` states the filename rule plainly: `{seq}` is a
**"6-digit zero-padded running number"**. The unit briefs did not say so, and four of the five
units derived the number from their assigned timestamp slot instead — producing two `000004`
files, two `000005` files and so on across different timestamps.

**Nothing breaks**: sequelize-cli orders on the timestamp, which is unique per file. What breaks
is the number's meaning — a running number that does not run tells a later reader nothing.

- [x] resolved — renumbered at the gather to one running sequence
      One unit followed the rule from the digest without being told, and its numbering is the one
      the others were brought into line with.

      **The pattern is the same as [[Q36]]**: the brief asserted a convention it had not checked,
      and the unit that checked was right. Two for two in one checkpoint is worth noticing — a
      brief is a claim, and a unit that treats it as an order inherits its author's mistakes.

## Q40 · reinvention · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24. **The catalog check, on the record.**
<!-- spec: provider-layer -->

`@openreachtech/hora-ecosystem` **v0.1.0**, 33 tracked packages of 46 listed. Searched once for
the whole checkpoint, before anything was written.

**The catalog contains no AI or LLM content at all** — a grep of all 66 doc files for
`anthropic|openai|gemini|claude|LLM|agent loop|prompt|token count` returns nothing in the
domain. So the five pieces this checkpoint builds are judged against transport, loading and
persistence packages, not against anything that knows what a model is.

| Piece | Verdict |
|---|---|
| model-processor abstraction | **part** — `mentsu-rocket-client` gives the Payload/Launcher/Capsule triad, auth builders and an overridable `.get:fetch`; `mentsu-schema` gives the canonical shape. Every LLM semantic is unwritten |
| deterministic stub driver | **nothing tracked** |
| run-time processor loader | **part** — `mentsu-deep-loader`'s `DeepCtorsLoader` does discovery and constructor filtering; it returns an array with no lookup key, so name→class is unwritten |
| prompt composer | **nothing tracked** |
| model-call recorder | **part** — `renchan-sequelize` for the row; timing, token extraction and raw-body handling unwritten |

**`mentsu-agent-loop-core` is not in the search space, and that is a decision rather than a
gap.** `config/lookup.js` marks it `false` and `config/rulesets.js` turns off `mentsu-agent-*`
wholesale, so the catalog ships no specification of its classes. The reference extract this
feature ports from *does* use it, and this repository's own skills name it — but the catalog
cannot say anything about it, so nothing here leans on it. **It belongs to
`#asset-media-extraction`**, which builds the agent loop; this feature builds the layer under it.

**A trap worth naming, because it nearly matches.** `mentsu-random-text-generator` looks like
the answer to "a deterministic stub", and is not: its `seedString` is the **character set** to
draw from, not a random seed, and its output is non-reproducible by design. [[Q9]] already
recorded a near-miss with the same package from the other direction.

- [x] recorded — three pieces reuse a tracked package, two are written fresh
      The two written fresh are the stub driver and the prompt composer, and the catalog was
      searched for both by description rather than by name before that was concluded.

## Q41 · reinvention · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

The catalog's answer for the loader's discovery half was `@openreachtech/mentsu-deep-loader`'s
`DeepCtorsLoader`. **That package is not installed** — the backend's `node_modules/@openreachtech/`
holds eleven packages and it is not among them.

- [x] resolved — `DeepBulkClassLoader` from `@openreachtech/renchan`, which is installed
      It covers the same need through `loadClasses({ filterFunc })`, it is what the
      `hor-multi-llm-provider` skill itself names, and it is what **both** reference extracts use.
      The only thing `DeepCtorsLoader` adds is a predicate expressible in one line. Taking a new
      declared dependency for that was the worse trade.

      The implementer isolated discovery into three methods so the swap stays a two-method change
      if the catalog's pick is ever preferred, and flagged the policy call rather than burying it.

**The general point is worth more than this instance: the catalog says what is *tracked*, not
what is *installed*.** A "a tracked package does this" verdict is a lead, not an instruction, and
it needs an install check before an implementer acts on it. Two of the five briefs at this
checkpoint said "check it is actually installed before importing it" and the units that hit the
gap did exactly that. **The catalog-check step should produce the install status alongside each
verdict**, or every checkpoint pays this twice.

## Q42 · missing-acceptance · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

§17's acceptance criteria cover the default installation answering on the stub, the stub being
deterministic, turning a real provider on, prompts being data, history staying readable, and what
a model call records. **None of them says what happens when a model name resolves to no
processor** — a row pointing at a driver nobody wrote, or a misspelling.

The loader answers `null` and leaves the decision to its caller, deliberately: falling back to the
seeded default would let a run be **answered by a model nobody asked for**, with the record saying
so only in hindsight.

- [x] recorded — the behaviour is decided and tested; the criterion is still missing
      A criterion along the lines of *"a run naming a model no processor serves fails with a reason
      code, and no other model answers it"* would pin it and give `#run-execution` — which maps
      failures to reason codes — something to test against. As it stands the safe behaviour rests
      on an implementer's judgment rather than on anything stated.

## Q43 · contradiction · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24. **A design decision, not an implementation one.**
<!-- spec: provider-layer -->

§17 asks for something the table in the same section has no column for.

> **line 701, the criterion:** each model call is recorded with its model, its input and output
> token counts, and **its outcome**
>
> **line 660, the table:** `AiRunId`, `AiModelId`, `action_name`, `reading_index`,
> `prompt_version`, `latency_milliseconds`, `input_token_count`, `output_token_count`,
> `response_body` (NULL once purged), `called_at`

**There is no outcome, status or succeeded field.** So a call's outcome is readable only from
`response_body` — and that is the one column the 30-day content purge empties, while the row
itself is kept for 730 days.

**After the purge, a failed call and a purged successful call are indistinguishable.** The model,
the version, the token counts and the latency all still answer; whether the call worked does not.
That weakens both use cases the row exists for: billing reads calls a run spent, and reproduction
reads which of them produced the result.

**This is the third time this exact shape has been found in this product**, and the first two were
caught before any code existed — stage 6 of the spec found `rejected_items` storing dropped values
on the long clock, and stage 7 found the confidence figures living only in `result_body`. Same
defect each time: **something the decision trace needs, held only in a column the content purge
empties.**

- [x] recorded — not fixed, and deliberately not guessed at
      Two ways out, and they lead to different features:

      - **the row gains an outcome field** — a `succeeded` boolean or an `AiModelCallStatus`
        master. That is a column, so a migration against checkpoint 3's work, in this feature
      - **the spec states that a call's outcome lives in the step trace** (`ai_run_steps`, whose
        `outcome_code` already exists), and this criterion is checked at that feature's gate
        instead

      The implementer closed the criterion as far as the schema allows — model, both token counts,
      and the body — and wrote a test describe for the purged shape (`when the call produced no
      body`) that documents the gap honestly rather than papering over it. **A recorder that had
      quietly copied an outcome out of the body would pass the first describe and fail that one.**

## Q44 · contradiction · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24. **It reopens [[Q33]]'s answer.**
<!-- spec: provider-layer -->

`ai_model_calls.prompt_version` is **one** column, and this version versions **two** texts.

Both `ai_agent_default_instructions` and `ai_agent_role_instructions` carry their own `saved_at`,
and each writes to a sink of its own — confirmed in the built schema: two live tables, two `*Bk`
tables, one `prompt_version` column. **One `STRING(32)` cannot address a row in two sinks.**

Q33 settled that `prompt_version` is "the `saved_at` of the instruction in force". That reading
assumed one instruction. There are two, and the role instruction is the provider's system prompt —
the text that most changes what a model answers.

The implementer took the **default instruction's** `saved_at`, on the reading that
`ai_agent_default_instructions` is "the agent's own instruction" and `prompt_version` names the
prompt. The consequence, which nobody had written down:

> **Reword only the role, and `prompt_version` does not change.** A months-old result reproduced
> from it comes back with the wrong system prompt.

That is exactly the failure §17's third use case — "ORT reproduces a result from months ago,
because the prompt version each call used is recorded against it" — exists to prevent. The
identifier would be recorded, resolvable, and pointing at the wrong pair.

- [x] recorded, not fixed — and the implementation is the safest reading available
      Two ways out, and neither is an implementer's to pick:

      - **a second column** — the role's `saved_at` recorded beside the instruction's, so the pair
        addresses both sinks. A migration against checkpoint 3's table, in this feature
      - **one identifier covering both** — a value derived from the two `saved_at`s together, or a
        generation marker the agent itself carries and both texts write to. A design decision and
        a spec line

      Until then the recorded version addresses the instruction and says nothing about the role,
      and that limitation is now written down rather than latent.

      **The same shape as [[Q43]] one unit over**: a value the long-lived trace is supposed to
      answer with, which the schema cannot actually hold.

**Checkpoint 8's audit found it is worse than two texts — it is three.** Three things decide what a
model is sent and what it may answer with: the instruction, the role, and the **tool schemas**. Only
the first is versioned in a call record.

And the tool schemas are further behind than the role: `ai_tools` carries a `saved_at` column but
**no `ai_tools_bk` table and no `BackupMixinModel`** — verified against the twelve new migrations,
none of which creates one. So a tool schema has no history at all, not merely no marker in the call
record.

Since a tool schema decides **what a step is allowed to hand back**, a dispute about an old run
cannot be settled from the record: reproduction takes the right instruction and then silently the
current role and the current tool schemas. The two ways out named above now have a third piece —
`ai_tools` needs the same write-once sink its sibling instruction tables already have.

## Q45 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24. **The third brief defect this feature.**
<!-- spec: provider-layer -->

The unit brief for the prompt composer stated that `ai_tools` and `ai_agent_available_ai_tools`
"exist and are seeded". **They exist and nothing seeds them** — no row, in any tier. The master
agent seeder writes the agent and its two instruction tables and stops there.

The implementer checked rather than believed it, and the shortfall was real: the tool half of its
work had nothing to test against, and an "it returned an empty array" test would have passed
against a composer that hard-coded `[]`.

- [x] resolved — a development-tier fixture suite, and a refusal to invent the real one
      It added obviously-fake agents and tools under `sequelize/seeders/development/`, which is
      what that tier exists for, and **declined to add master-tier tool rows**: what a step of the
      asset-media-extraction run may return is that service's own schema, and inventing it here
      would install a baseline nobody designed and leak into `#asset-media-extraction`.

      **Still owed by whichever feature owns the real tool schema: a master-tier `ai_tools` row and
      its binding.** Without one, a default installation has an agent permitted to use no tools at
      all — which passes every test written here and fails the first real run.

      Three brief defects in one feature ([[Q36]], [[Q39]], and this) — each asserting a fact the
      brief had not checked, each caught by the unit that checked. The pattern is stable enough to
      act on: **a brief should state what it verified and what it is assuming**, so a unit knows
      which half to test before leaning on it.

## Q46 · eslint-exception · blocking: no — **fail-loud**

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

`app/tools/BaseAiModelProcessor.js` carries **one inline disable, for one rule**:

```js
// eslint-disable-next-line no-restricted-syntax -- Template-Pattern base class; see the comment above.
```

**It is a genuine contradiction between two of this project's own rules.**

| | |
|---|---|
| `hoc-classes-prohibits` permits it | *"A design such as an abstract base class that holds no state itself while its derived classes hold the properties (state) is not considered a class without state (treated the same as the Template Pattern)."* |
| the ESLint selector forbids it | `ClassDeclaration[superClass=null]:not(:has(MethodDefinition[kind=constructor]))` — it fires on **any** root class with no constructor assigning to `this`, which is exactly the shape of a Template-Pattern base at the root of a hierarchy |

**There is no state to add.** `.create()` must take no argument, because the processor loader calls
it bare while scanning the directory — and that is the property making a keyless driver an
**ordinary subclass** rather than a special case, which §17's first criterion rests on. Adding a
property to satisfy the linter would be inventing state to defeat a rule that is trying to prevent
invented state.

`eslint.config.js` gained the file in its existing per-file exception block, so the disable comment
itself is accepted; the block carries the reasoning.

- [x] recorded — one rule, one line, one file
      **Removal condition:** the selector gaining a way to admit a root class whose subclasses hold
      the state — or this base acquiring real state, which would mean the abstraction changed.

## Q47 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

The always-on testing rules name `expect.each(actual).toBe(expected)` and
`expect.deepContaining(expected)` as ORT Jest extensions available in this repository. **They are
not.**

`tests/setup-after-env.js` registers `globalThis.jest`, `globalThis.constructorSpy` and
`globalThis.sequelizeActivator`, and calls `expect.extend` **never**. The packages that provide
them — `@openreachtech/jest-expect-each`, `@openreachtech/jest-deep-containing` — are in neither
`package.json` nor `node_modules`. `expect.each(received)` would be a `TypeError` at run time.

- [x] resolved — found by a unit checking before using it, on my instruction to use it
      I told an implementer to assert a universal property with `expect.each`, citing the rule. It
      checked the setup file first, found the extension absent, and picked another legal shape that
      keeps the same statement rather than weakening the assertion to "at least one entry matches".

      **The rules describe a family of ORT repositories, and this one is younger than the rest.**
      Two of the three extensions they promise are not wired here. Worth knowing before any future
      test leans on one — and worth adding the two packages if the extensions are wanted, since the
      convention plainly expects them.

## Q48 · undefined-detail · blocking: no

**Raised at** checkpoint 8 of #provider-layer, 2026-09-24. **Accepted, not fixed.**
<!-- spec: provider-layer -->

Two audit findings accepted deliberately.

**[LOW] The processor pool is a code-execution surface.** `DeepBulkClassLoader.loadClasses()` runs
`await import()` on **every** `.js` it finds and filters afterwards — so the top-level code of a file
that is not a processor executes anyway. `loadFileNames` recurses through `fs.statSync().isDirectory()`,
which **follows symlinks**, so a symlink in the pool walks the loader out of the source tree. And
`createAsync({ poolPath })` takes the path as a parameter.

- [x] accepted
      An attacker who can write a file into the application's source tree already has code execution
      by editing any file, so the marginal risk is the three points above. Today the pool holds one
      file and **`createAsync()` is called from no boot path at all** — only from tests.

      **Owed by whichever checkpoint wires it to a boot path:** import only files matching an explicit
      name pattern or allow-list, refuse symlinks and anything resolving outside the pool, and never
      take `poolPath` from configuration or input.

**[LOW/INFO] The stub's answer is an unsalted digest of the whole request, and that is what is
recorded.** `response_body` receives `stub-answer:<sha256(canonical request)>`, so anyone who can read
that column and guess a candidate request can confirm the guess by recomputing — an offline
confirmation oracle over low-entropy request content.

- [x] accepted, and the auditor's own recommendation was to accept
      Salting with an installation-local value would close it and would break the cross-installation
      determinism the spec requires of the stub. The digest's **input is never emitted** — verified:
      the canonical text is used for its length and never stored — and `response_body` is the one
      column the 30-day purge empties.

## Q49 · contradiction · blocking: no

**Raised at** checkpoint 8 of #provider-layer, 2026-09-24. **Two rule sources disagree, and I followed the wrong one.**
<!-- spec: provider-layer -->

How a migration creates several indexes is stated twice, oppositely:

| Source | Says |
|---|---|
| `.claude/skills/hor-sequelize-migration/references/indexes.md:33`, and its digest | **"Multiple indexes → `Promise.all`; a single one → `await` directly"** |
| `D:/ORT/rules/migrations-and-seeders.md:48` (and its `~/.claude` twin) | **"Indexes: sequential `await queryInterface.addIndex(...)` — never `Promise.all`."** |

**The equipped skill wins.** `D:/ORT/CLAUDE.md` line 7: *"a project's own `./CLAUDE.md` and
`.claude/` take precedence on conflict."* The rule file is the ORT-wide set; the skill is what this
project equips.

- [x] resolved for this repository — all four multi-index migrations now use `Promise.all`
      **I instructed an implementer to make two of them sequential**, citing the always-on rule as
      though it governed. It did as asked, then read both sources, found they contradict, and said
      so in its report rather than leaving two migrations disagreeing with the other two. I reverted
      both.

      **This is the fourth brief defect of this feature** — after [[Q36]], [[Q39]] and [[Q45]] — and
      the first where the instruction actively made the code worse rather than merely being
      unnecessary. The other three asserted something unverified; this one asserted the losing side
      of a conflict it had not noticed was a conflict.

      **What is still owed, and is not this feature's:** the two rule sources should be reconciled at
      the source, since the next migration written in any ORT project meets the same fork. A rule
      file that contradicts an equipped skill is worse than either answer alone, because whoever
      reads only one of them is confident.

## Q50 · undefined-detail · blocking: no

**Raised at** checkpoint 8's re-audit of #provider-layer, 2026-09-24. **Two LOWs, accepted with obligations.**
<!-- spec: provider-layer -->

**1. A migration was edited in place, and an already-migrated database will never receive the
change.** The UNIQUE index on `ai_tools.name` was added to `20260924100004-000008` rather than in a
new migration — permitted, because 1.0.0 is unreleased and `/hora-plan`'s rule allows editing an
existing migration until a version ships.

Any database that already recorded that filename in `SequelizeMeta` **will not get the index, and
nothing will say so.** Locally this is invisible: `db:teardown` deletes the SQLite file and
`db:setup` migrates from scratch on every suite run.

- [x] accepted here, owed at deployment
      No deployed database exists for this version. **The obligation is the release's:** whoever
      first migrates a long-lived environment past this point must confirm the index is present, or
      add a separate add-index migration. Recorded because the failure is silent — a missing UNIQUE
      constraint does not announce itself; it just lets a duplicate in one day.

**2. The rewritten `_orders` instruction tests assert a positional, accumulating array.** Each
expects the sink to hold exactly the seeded baseline plus the generations those two cases wrote, in
order.

- [x] accepted
      **Any future test that saves an instruction of that agent — in any category, in any order —
      breaks them**, and the run-order barrel's comment is the only place that constraint is
      written down. The alternative (asserting only the newest row) would drop the accumulation
      claim, which is the whole point: one generation in the sink proves a wording arrived, two
      prove the sink **appends rather than replaces**.

      The re-audit judged the actual flakiness risk **low** — each case is its own jest test with a
      `findOne` and a `findAll` between saves, so sub-millisecond spacing is unlikely, and only the
      `AiAgent` category writes those rows. The fragility is about future edits, not about timing.


## Q51 · convention-violation · blocking: no

**Raised at** checkpoint 8 of #provider-layer, 2026-09-24. **Found by the orchestrator, fixed in place.**
<!-- spec: provider-layer -->

**#provider-layer minted 48 explicit row ids inside #run-contract's id block.** `hor-bank-id` splits
an 8-digit id into a **3-digit prefix** and 5 free digits. `#run-contract` holds `100`,
`#provider-layer` holds `101` (`tsdg-ai-backend/.hora/id-bank.json`). Every id from `10020001`
through `10090016` reads as prefix `100` — #run-contract's — and was written by #provider-layer's
own commits (`eea8579`, `680f543`) and by the checkpoint 8 fix pass.

**The root cause is not the agents'.** The skill states that the orchestrator allocates once per
feature and **hands the prefix to every agent working in the repository**, and that agents never
call the skill themselves. The prefix was allocated at checkpoint 3 and then left out of every
later unit brief, so each unit invented a block that looked free. Two independent units reached for
the same wrong shape — a **4-digit** block prefix — which is the tell that the brief, not the
reader, was missing the rule.

- [x] fixed
      All 48 literals were remapped into `101`, mechanically (`100N0RRR` -> `1013{N-2}RRR`), across
      the dev seeder and four test files. The new free parts all fall in `30000`-`37999`; the `101`
      ids already in use are `00001`, `10001`, `20001`, `50001`, `60001`, `70001`, `80001`, `90001`,
      so nothing collides. Database refreshed, lint clean, 1195 tests green.

      **Owed for the remaining nine features:** the row-id prefix goes into every unit brief, stated
      as the 3-digit prefix with the 5 free digits spelled out. A brief that omits it produces this
      defect again, silently, because a squatted id only fails when the other owner later picks the
      same number.

**A second record, about this repair itself.** The orchestrator's first edit to the two instruction
models used a regex that matched more than intended and **deleted the whole body of
`setupHooks()`**, including the `beforeSave` stamping hook. It was caught by the suite (16 red, with
`savedAt` coming back as the caller's own value), not by review. The hook was **reconstructed**, not
recovered: the fix pass's version was never committed and its output file was empty, so the logic is
restored exactly but **the surrounding comment is newly written**. It states the same three things
the original did — why the stamp is the server's, why it is row-derived, and what it does not cover.

## Q52 · undefined-detail · blocking: no

**Raised at** checkpoint 8 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

**#provider-layer's `AiModelCallRecorder` order test reads #run-contract's seeded rows.** It
references ai_run ids `10010001`, `10010002`, `10010004`, `10010005`, which
`20260923100004-000002-ai_runs.cjs` seeds under prefix `100`.

Two equipped rules point opposite ways here. The ORT testing rule says a DB-touching test
**references real seeded ids** rather than building fixtures; `hor-bank-id` says **do not read or
reason about another requester's rows**. Both readings are defensible, and the skill's own example
settles half of it: a prefix is not scoped to one table, so #provider-layer may seed its own
`ai_runs` rows at `101` and reference those.

- [ ] left as it stands, deliberately
      **No collision hazard exists today** — a reference writes nothing, and the ids it names are
      seeded by a feature that is accepted and closed. What exists is a **coupling** hazard: if
      #run-contract ever renumbers its seeder, this test breaks for a reason that has nothing to do
      with the code under test.

      Not changed here because the alternative — a second `ai_runs` dev seeder owned by
      #provider-layer — collides with the "one table per file" seeder rule, and choosing between two
      equipped rules is not checkpoint 8's to decide alone.

## Q53 · tooling · blocking: no

**Raised at** checkpoint 8 of #provider-layer, 2026-09-24. **Project-level, not this feature's.**
<!-- spec: none -->

**The backend's own `npm test` and `npm run db:refresh` do not run on this Windows machine.** npm
executes scripts through `cmd.exe` here, and both scripts are written for a POSIX shell:

- `db:refresh` opens with `export NODE_ENV=development`, which cmd.exe answers with
  `'export' is not recognized as an internal or external command`.
- `db:setup` is `sequelize-cli db:migrate;` — cmd.exe does not treat the trailing `;` as a
  terminator, so sequelize-cli receives the literal argument `db:migrate;` and prints its usage
  text with `Did you mean db:migrate?`.

`test.sh` itself is bash and is fine; it fails only because it calls those npm scripts.

**Why it is worth recording rather than working around silently.** `/hora-accept`'s step 2 runs
"that repository's own test command" — so a run that takes `npm test` at face value on Windows gets
a non-zero exit that looks like a suite failure and is not one. Every suite run in this session has
had to be reconstructed by hand:

```
export NODE_OPTIONS="--experimental-vm-modules"; export NODE_ENV=development
rm -f sequelize/storage/*.sqlite3
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all --seeders-path sequelize/seeders/dev-master
npx jest --passWithNoTests tests/empty/__tests__/
npx jest --passWithNoTests --detectOpenHandles tests/empty/_orders/
npx sequelize-cli db:seed:all --seeders-path sequelize/seeders/development
npx jest --passWithNoTests tests/__tests__/
npx jest --passWithNoTests --detectOpenHandles tests/_orders/
```

- [ ] open
      **Two candidate fixes, and the choice is the team's.** `npm config set script-shell bash` on
      each Windows machine leaves the scripts alone but makes a green run depend on machine-local
      configuration that nothing checks. Rewriting the scripts to be shell-neutral — `cross-env` for
      the variables, dropping the stray `;` — costs an edit and a dependency but makes the command
      in `package.json` the command that actually runs, everywhere.

      **Reconstructing the pipeline by hand is not a third option.** The `_orders` tests write, so
      they need a re-seed before every run; a hand-assembled sequence that forgets one produces
      failures that look like defects. That happened once in this session and cost a round of
      diagnosis.

## Q54 · undefined-detail · blocking: no

**Raised at** checkpoint 8's second re-audit of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

**The sink append is not in the same transaction as the live write.** `BackupMixinModel` appends
through `afterSave`, which a bare `.save()` runs outside any transaction of its own. A sink write
that fails therefore leaves the live row **already committed**: the caller is told the write failed,
the row is reworded, and the sink does not hold that wording.

The re-audit reached this for real by chaining it off two other defects, both now closed — a
divergent `Model.update()` desynced the live marker from the sink, and `.upsert()` supplied a
far-future marker that kept the clock behind. With `.update()` refused, the only remaining routes to
the precondition are the bypasses the class doc already names (`.upsert()`, `queryInterface`, raw
SQL, `save({ hooks: false })`).

- [ ] open, and deliberately not fixed here
      **Closing it properly means the mixin opening a transaction around live write + sink append**,
      which is `@openreachtech/renchan-sequelize`'s to decide, not this feature's. Patching around it
      in two model files would leave every other model that uses the mixin exposed and would hide
      the real gap.

      Recorded because the failure is **silent in the direction that matters**: the caller sees an
      error and may well retry, while the row it thinks it failed to write is already live.

## Q55 · tooling · blocking: no

**Raised at** checkpoint 8 of #provider-layer, 2026-09-24. **Project-level.**
<!-- spec: none -->

**`sequelize/_.js` cannot boot under plain Node on Windows.** `SequelizeActivator.createAsync` walks
`sequelize/models/` through the loader inside `@openreachtech/renchan-sequelize`, which does
`import(<raw windows path>)`; Node answers `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'd:'`.

**It is invisible in the suite**, because jest resolves those imports through babel's require
interop and never reaches Node's ESM loader. Everything is green while the same entry point fails
outside jest.

This is the same defect class `app/tools/FileUrlDeepBulkClassLoader.js` was written for — but that
class is wired only into `BulkAiModelProcessorsLoader` (the driver pool). The model loader is a
different loader, inside the package, and this feature does not own it.

- [ ] open
      **What it costs today:** any script that boots the models outside jest has to be written
      against jest instead. One diagnostic probe in this session was rewritten for that reason.
      **What it could cost later:** the server's own boot path goes through `sequelize/_.js`, so a
      developer on Windows cannot run the application locally at all — only its tests.

      Deployment is Linux, so this is a developer-machine issue rather than a release one. The fix
      belongs upstream in `renchan-sequelize`, the same way the pool loader was fixed here.

      **Correction, from the re-audit:** a probe does **not** have to run inside jest. Only
      `DeepBulkClassLoader`'s directory walk is blocked. Importing the model files directly with
      `url.pathToFileURL`, then calling `SequelizeActivator.generateClient({ nodeEnv, configPath })`
      and `SequelizeActivator.activateModels({ sequelizeClient, models })`, boots the full real
      registry — hooks, mixins and associations — under plain `node`. Every live probe in both
      checkpoint 8 audits ran that way. **`generateClient` is `async` and must be awaited** — the
      brief that carried this route to checkpoint 9 omitted the `await` and had to be corrected
      there.

## Q56 · undefined-detail · blocking: no

**Raised at** checkpoint 8's re-audit of #provider-layer, 2026-09-24. **Pre-existing; found while
checking something else.**
<!-- spec: provider-layer -->

**`agent.setAiAgentDefaultInstruction(row)` throws, and the same shape applies to two more
associations.** The setter fails with
`SequelizeValidationError: notNull Violation: AiAgentDefaultInstruction.AiAgentId cannot be null`.

The cause is Sequelize's own `hasOne` setter: when an agent already has an associated row, the
setter detaches the old one by nulling its foreign key through `oldInstance.save()`
(`lib/associations/has-one.js:143`). The attribute is declared `allowNull: false`, so that write
cannot succeed.

It was **not** introduced by the update-refusal commits — that path never touched `Model.update` at
any commit, and `createAttributes` is untouched by them. The re-audit established this from the
diff rather than by checking out an earlier commit.

- [ ] open
      **`createAiAgentDefaultInstruction(...)` works**, and it is what the application would use, so
      nothing is blocked. But the same shape applies to `AiAgentRoleInstruction` and
      `AiAgentDefaultModel`, and the setter is the obvious method to reach for.

      **Two ways out, and neither is this checkpoint's to pick.** Allowing null on the foreign key
      would let an orphaned instruction row exist, which the `allowNull: false` was chosen against.
      Declaring the association so the old row is destroyed rather than detached changes what a
      reassignment means. Whoever owns the agent data model decides.

## Q57 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24. **A failed model call has no row shape,
and widening it later costs a migration.**
<!-- spec: provider-layer -->

**`ai_model_calls` can only record a call that answered.** `latency_milliseconds`,
`input_token_count` and `output_token_count` are all `NOT NULL`, and `saveAiModelCall` requires
`respondedAt` besides — so a call that errored is not recorded at all, rather than recorded as
failed.

A run billed by counting the calls recorded against it therefore counts only the calls that
answered. Verified by execution at checkpoint 9: two recorded calls, 446 billable tokens, both
surviving a simulated content purge and a move of the run to `canceled`.

**§17's own data model gives `ai_model_calls` no outcome column**, so the code matches the spec. What
does not match is acceptance criterion 7, which says each call is recorded "with its model, its input
and output token counts, and **its outcome**". The two can only be reconciled by reading "outcome" as
the run's, not the call's — `ai_run_steps.outcome_code` (#run-record) plus the contract's
`PROVIDER_CALL_FAILED`, with the existence of a call row meaning the call answered.

- [x] resolved 2026-09-24 — **the reading is confirmed, and the spec now says it**
      The owner chose the run/step reading over widening the call row. Criterion 7 was rewritten to
      match the data model it sits beside: "each model call is recorded with its model and its input
      and output token counts; the outcome is the run step's (`ai_run_steps.outcome_code`), and a
      recorded call is one that answered."

      **Said plainly, because it is a narrowing and not a clarification:** the old criterion required
      an outcome on every call; the new one does not. What that costs is a per-model failure rate,
      which nothing can now answer without adding a column. The owner was told this before choosing.

      **What the choice makes newly load-bearing** — and this is why the structural gap below is now
      escalated rather than a footnote.

      **Why it is worth settling now rather than at #run-execution.** 1.0.0 is unreleased, so the
      migration can still be edited in place; once a long-lived database has run it, adding the
      column is a second migration on live data. Whether a failed provider call must be billed is a
      policy question, but the row shape that would let anyone answer it is this feature's.

      `ai_model_calls` carries `AiRunId`, `action_name` and `reading_index`; `ai_run_steps` carries
      `AiRunId`, `step_index` and `step_name`. **No key joins a call to the step that made it.**

      While the outcome might have lived on the call, that join was a convenience. Now that the
      outcome lives only on the step, **the join is the sole way to answer "did this call succeed"**
      — and it does not exist. Anyone building that read in #run-record or #run-delivery has to match
      `action_name` against `step_name` by a convention nobody has written down.

      **Owed by #run-record or #run-execution, whichever declares the step row:** either a real key
      from a call to its step, or that convention written into §10 where both features will read it.
      Recorded here rather than left implied, because the decision above is what made it necessary.

      **Update 2026-09-25 — a precedent now exists, from #run-record's checkpoint 2.** The identical
      shape turned up inside §10: `ai_run_field_outcomes` held the agreement counts while
      `ai_run_steps` held the reason code, with nothing joining a field to its step, and the second
      use case could not be walked. It was settled by adding a real key — `AiRunStepId`, NOT NULL,
      indexed — rather than by a matching convention.

      **That is the answer this question should be read against.** Whoever builds #run-execution
      should add `AiRunStepId` to `ai_model_calls` on the same grounds, while 1.0.0 is unreleased
      and the column is free; matching `action_name` against `step_name` was never written down
      anywhere and would be the second convention nobody records.

## Q58 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24. **Two candidate settings decide which
model answers, and nothing says which one wins.**
<!-- spec: provider-layer -->

Acceptance criterion 3 says turning a real provider on is "a deliberate change of **one** setting".
There are two, and §17 does not rank them:

- `ai_models.is_default` / `is_active` — global
- `ai_agent_default_models.AiModelId` — per agent

**Neither has a reader.** Checkpoint 9 executed `grep` over `app/` and `server/`: nothing reads
`is_default`, `is_active` or `ai_agent_default_models`. The mechanism is #run-execution's to honor,
so this is a question handed forward rather than a defect here.

**`ai_agent_default_models` is dead surface this version.** Migration, model, `.d.ts` and association
all exist, and the table holds **zero rows** in `master`, `dev-master` and `development` alike
(executed count). §17 lists it as "which model an agent uses, as data" — and on every installation
that question currently has no answer in data.

- [x] resolved 2026-09-24 — **`ai_models.is_default` is the authority**
      Chosen by the owner, and written into §17 in two places so nobody has to find this question:
      criterion 3 now names the setting, and the `ai_agent_default_models` row now reads "Not read
      this version".

      **What that decision leaves standing:** the migration, the model, the `.d.ts` and the
      association for `ai_agent_default_models` all remain, unread, holding zero rows. That is
      deliberate — dropping the table and rebuilding it in a later version costs more than leaving
      it — but a reader who meets it should find the sentence, not infer it. They now do.

      **#run-execution is the feature that must honor this**, and it is the one that would otherwise
      have made the silent mistake: reading the per-agent table while an operator flips the global
      flag, so a run answers on a model nobody selected and still succeeds.

## Q59 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24. **The spec overstates what adding a model
costs.**
<!-- spec: provider-layer -->

§17's data model says "Adding a model is a **row**", and acceptance criterion 4 says models "are read
from the database, and changing one needs no deployment".

**Executed at checkpoint 9:** inserting `ai_providers` + `ai_models` + `ai_model_capabilities` rows
and nothing else resolves to `null`. The model becomes usable only once a driver file is dropped into
a pool directory. That is the right design — a vendor needs code — but the sentence reads as though a
row alone were enough.

The use case itself ("ORT adds a model without touching the **services** that use one") is met in
full: nothing outside the driver names a vendor, and the app-facing `name` is the only key a caller
holds.

- [x] resolved 2026-09-24 — the owner read both sentences and approved them
      §17's `ai_models` row now reads "Adding a model is a row plus one driver class; nothing that
      *uses* a model changes", and criterion 4 gained "; adding a vendor's model still ships a driver
      class".

      The use case itself never needed changing — "ORT adds a model without touching the services
      that use one" was met in full, and still is.

## Q60 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24. **A default installation binds no tools,
and no fixture exists for recorded calls.**
<!-- spec: provider-layer -->

Two seeding gaps, both found by executing against a rebuilt database:

1. **`master` seeds no `ai_tools` and no `ai_agent_available_ai_tools`.** `composePrompt` for
   `asset-media-extraction-agent` therefore returns `toolSchemas: []`, and the stub answers with zero
   function calls — a run that, by the stub's own documentation, "settles nothing". Acceptance
   criterion 1's "answers every service on the stub" is true today only in the weak sense: the path
   completes, but it decides nothing. The tool set belongs to #asset-media-extraction (§20), so this
   is a handover rather than a hole.
2. **No development seeder for `ai_model_calls`.** After a clean reseed the table holds zero rows. A
   later feature reading recorded calls — #run-delivery's `usage` block, #run-list — has no fixture.

- [ ] open
      Both are cheap now and awkward later: a test written against an empty table tends to grow its
      own fixture, which is the thing the seeder convention exists to prevent.

## Q61 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24. **Repo-wide and pre-existing, but this is
the feature that made it matter.**
<!-- spec: none -->

**No charset or collation is declared anywhere** — not in `sequelize/config.cjs`, not in any
migration, not in `BaseAppRenchanModel.createOptions`.

Under the development SQLite dialect Vietnamese round-trips perfectly; checkpoint 9 executed exactly
that, storing and recomposing `Hãy mô tả chiếc xe tải trong ảnh, nêu rõ màu sơn & tình trạng
<thân vỏ>.` with diacritics and escaping intact. On MariaDB the wording tables inherit the server
default, and a `latin1` server would mangle the very text use case 2 is about.

- [ ] open
      Not introduced by this feature, but this feature is where the Vietnamese wording now lives —
      `ai_agent_default_instructions`, `ai_agent_role_instructions` and their sinks. The failure
      would appear only on a live MariaDB, i.e. past every gate this project runs.

## Q62 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24.
<!-- spec: provider-layer -->

**`AiRun` declares no `hasMany(AiModelCall)`.** Its associations are `ApiClient`, `AiRunCategory` and
`AiRunStatus`.

The billing read works — checkpoint 9 executed `AiModelCall.findAll({ where: { AiRunId } })` on the
indexed column and computed the contract's `usage` block from real rows — but
`AiRun.findOne({ include: [AiModelCall] })` throws.

- [ ] open
      Worth telling #run-delivery and #run-list before they write that block, since `include` is the
      obvious shape to reach for and the eager-load convention in `performance.md` points straight at
      it.

## Q63 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #provider-layer, 2026-09-24. **§17's digest moved; no checkpoint was
cleared, and this records why that is a judgment rather than an oversight.**
<!-- spec: provider-layer -->

The five edits resolving Q57, Q58 and Q59 changed §17, so `provider-layer.md`'s recorded digest no
longer matched. It was recomputed to
`65b6124931e449a11c330953a94635c0880189755a6a880a1c659f159a3ff1f2`.

**The recipe had to be recovered rather than looked up.** `hora-plan` states that digests are taken
per section with annotation comments excluded, but not how the text is normalized. It was derived by
brute-forcing four variants against the eleven digests already recorded and confirming one matched
**all eleven**: the `##` heading line kept, every `<!-- … -->` line dropped, no trimming, no trailing
newline, SHA-256 over UTF-8. Worth writing down — the next person to edit a spec section faces the
same gap.

- [x] resolved — nothing cleared, deliberately
      Four of the five edits are clarifications: they name a setting, mark a table unread, and say
      that adding a model also ships a driver. No table, column, operation or use case changed.

      **The fifth narrows acceptance criterion 7**, and a narrowing is the direction that cannot
      invalidate work: the code already satisfies the new wording — checkpoint 9 executed exactly
      that — and no test was ever written against the old "outcome" clause, because §17's data model
      never gave `ai_model_calls` a column to write it to. Nothing built against the old text exists
      to be stale.

      This is the same shape as Q28, where the spec was corrected toward the code after the
      `cancelled` / `canceled` fix and no checkpoint was cleared either. The rule being applied is
      the reconciliation table's last row: wording, with no change to a table, an operation or a use
      case, records the new digest and moves on.

## Q64 · tooling · blocking: no

**Raised at** #run-record's spec gate, 2026-09-25. **Self-inflicted, fixed, and worth recording
because the mechanism is silent.**
<!-- spec: none -->

**Three `.hora/` files were committed with CRLF line endings into a repository configured for LF**
(`core.autocrlf = false`, `core.eol = lf`, no `.gitattributes`, so git stores exactly what the
working tree holds). The files were `.hora/questions/1.0.0/open.md`,
`.hora/tasks/1.0.0/_plan.md` and `.hora/tasks/1.0.0/provider-layer.md`.

**The cause:** Python's `pathlib.Path.write_text()` translates `\n` to `\r\n` on Windows unless the
handle is opened with `newline=''`. Every edit script in this session that used the convenience form
rewrote its whole file, not just the lines it changed.

**How it surfaced, and why that matters.** Not by review — by the spec digest. Editing `specs/` with
the same convenience form turned the whole document CRLF, and the reconciliation that compares every
feature's recorded digest reported **10 of 11 features drifted at once**. A single edit cannot move
ten sections, so the count itself was the tell. Without that check the change would have been
invisible in a diff viewer and would have sat in the history.

- [x] fixed
      The three files are normalized and the correcting commit carries only line endings. Every
      edit script now opens with `newline=''`.

      **Three other tracked files hold CRLF and were deliberately left alone** — the annex HTML
      added 2026-09-22, `.hora/digests/hoc-methods.md` written at #run-contract's backend gate, and
      `.hora/spec/1.0.0/_assets.md`. All predate this session. Normalizing them would widen a
      line-ending repair into files this work never touched; they are named here so the next person
      to add a `.gitattributes` knows what is already there.

## Q65 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #run-record, 2026-09-25.
<!-- spec: run-record -->

**The three new constant hashes have no ESM bridge, and the repository is already inconsistent about
whether they need one.** `hor-constant-definition` states that every constant is two files — the
`constants/<name>.cjs` master and an `app/constants/<name>.js` bridge that re-exports it through the
custom `require`.

`AI_RUN_STEP_CATEGORY`, `AI_RUN_FIELD_STATUS` and `AI_RUN_EVIDENCE_CATEGORY` were written as `.cjs`
only, because the unit's file list named only those. The repository does not settle the question
either way: `aiRunStatusConstants` and `aiRunCategoryConstants` have bridges, `aiProviderConstants`,
`aiModelConstants` and `aiAgentConstants` do not.

- [ ] open, and deliberately deferred to checkpoint 5
      **Nothing needs a bridge yet** — no application code binds to these ids at checkpoint 3, and the
      seeders `require` the `.cjs` directly. The first consumer is the step writer and the outcome
      writer, both of which arrive at checkpoint 5, and that is the run that will know which of the
      three it actually imports.

      Writing three bridges nothing imports would be three files to keep in step for no reader. The
      risk of waiting is the opposite one: a checkpoint-5 unit reaches for
      `AI_RUN_STEP_CATEGORY.CODE.ID` from ESM, finds no bridge, and writes a fourth pattern rather
      than the convention. Named here so that does not happen quietly.

## Q66 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #run-record, 2026-09-25. **Settled, and recorded because the rows are
now seeded and the cost of reversing rises from here.**
<!-- spec: run-record -->

**§6 and §10 describe the first evidence kind differently, and the seeded key follows §6.**

| | |
|---|---|
| §6, the terminology table | "what a reading was based on — **visible text**, a visual estimate, or a category prior" |
| §10, the master's one-line description | "**something visible in the medium**, an estimate made from it, and a prior drawn from the category the subject belongs to" |

The first is narrow — text that can be read. The second is broad — anything visible at all, a paint
color or a dent included. The seeded names are `visible-text`, `visual-estimate`, `category-prior`.

- [x] settled — the narrow reading, on §6's authority
      **§6 is where the spec defines its terms**, so it outranks a one-line table description
      elsewhere; and the annex's own confidence table uses `visible_text` and scores it at 1.00, so
      two of the three sources agree. The spelling is kebab-case rather than the annex's snake_case
      because this repository's existing multi-word master key is kebab (`asset-media-extraction`),
      and the annex is interpretation material rather than a declared Source.

      **What this forecloses, stated plainly.** If the intent was the broad reading — a model
      allowed to rest a reading on a dent or a paint color rather than on text — then `visible-text`
      is the wrong name and will be wrong permanently, because it becomes the value every
      `ai_run_field_outcomes` row carries and every confidence weight keys on. Reversing it today is
      a constant and a seeder; reversing it after #asset-media-extraction runs is a migration over
      live rows.

      §10's looser sentence was **not** edited to match, because its exact replacement wording was
      never put up for approval and nothing may enter `specs/` unread. The disagreement is recorded
      here instead, so whoever next edits §10 knows which of the two the code followed.

## Q67 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #run-record, 2026-09-25. **The checkpoint's verifier failed the gate on
this and it was fixed; what stays open is the precedent it sets.**
<!-- spec: run-record -->

**`suggestion_confidence` is the repository's first and only DECIMAL column**, and Sequelize returns a
DECIMAL differently per dialect: a **string** on MySQL and MariaDB — `staging` and `live` — and a
**number** on SQLite, which is what `development` runs and therefore what every Jest run sees.

The declaration first read `suggestionConfidence: string | null`. Verified by execution against the
real models: writing `0.8125` and reading it back under `development` yields `typeof number`. So the
declaration was true of production only, and a test written from it — `expect(…).toBe('0.8125')` —
would fail locally while looking correct.

- [x] fixed as the union, with the reasoning carried in the file
      `string | number | null` is provably true in every dialect this project configures, needs no
      behavior change and cannot introduce a defect. The `.d.ts` carries a comment saying why, and
      saying not to narrow it — because the half that is wrong would be wrong only in the environment
      nobody tests in.

- [ ] open — **whether to normalize instead, when a consumer exists**
      The alternative is a reading normalizer on the model so every consumer sees `number`, and the
      declaration states that. It is the better shape for readers, and it is the one this repository
      will want if more decimal columns arrive.

      **Not done now, deliberately.** It changes read behavior, and nothing consumes the column yet —
      `AssetFieldConfidenceScorer` is #asset-media-extraction's, seventh in the order. A normalizer
      written before its first reader is a behavior change verified by nothing. Decide it when that
      scorer lands; whatever is chosen becomes the pattern for every later decimal.

## Q68 · undefined-detail · blocking: no

**Raised at** checkpoint 3 of #run-record, 2026-09-25. **Two things this checkpoint correctly did not
owe, recorded so the checkpoint that does owe them is not surprised.**
<!-- spec: run-record -->

**1. No development seeder for `ai_run_steps` or `ai_run_field_outcomes`.** `development/` holds
fixtures for `api_clients`, `ai_runs` and the agent prompt suite, and nothing for the two new
transactional tables. Checkpoint 3's exit condition names no development seeder and no test exists
yet, so this is not a shortfall here.

But the testing rule forbids mocking DB rows — *"if data is missing, add a seeder"* — so checkpoints
6, 9 and 18 all need them. `.hora/id-bank.json` already reserves prefix `102` for this feature, and
the masters are exempt from it, so the fixture ids are `102`-prefixed and free.

**2. The purge job will filter these two tables with no index to do it on.** §19's "purge expired run
traces" runs on the long clock and selects by date, and neither table has an index on `settled_at`,
`started_at` or `created_at`.

- [ ] open, both belonging to a later feature
      The seeders belong to whichever checkpoint first needs a row it cannot create itself — most
      likely 5 or 6 of this feature. The index belongs to #retention, eleventh, which can add it in a
      migration of its own; noted so it is designed rather than rediscovered when a purge over two
      years of trace rows turns out to be a table scan.

## Q69 · convention-violation · blocking: no

**Raised at** checkpoint 5 of #run-record, 2026-09-25. **Caused by the orchestrator's own briefs, found
by running the suite together rather than by review.**
<!-- spec: run-record -->

**Three of the checkpoint's four units were told different things about the same table.** `ai_run_steps`
carries a UNIQUE index on `(AiRunId, step_index)`, and the briefs said: one unit should reference the
runs `#run-contract` seeded, one should create its own, and the seeder unit should seed steps onto the
seeded runs. The result:

| writer | runs it used |
|---|---|
| the step seeder | `10010001`, `10010003`, `10010004`, `10010005`, `10010006` |
| `AiRunStepRecorder`'s order test | `10010007`–`10010010` |
| `AiRunFieldOutcomeRecorder`'s order test | `10010001`, `10010002`, `10010008`–`10010010` |
| `AiRunStatusRecorder`'s order test | **created its own, `10230001`+** |

Two overlaps, both real: the first two tests share runs `10010008`–`10010010`, and the outcome test
shares run `10010001` with the seeder.

**Every unit reported its own allocation as disjoint, and every one of them was right about its own
file** — each had only ever run its own test. The first run of the folder together was the gather step,
and it failed immediately: `4 failed, 90 passed`, all four on `step_index must be unique`.

- [x] fixed — each order test now creates the runs it needs, in its own id block
      `AiRunStatusRecorder`'s unit reached that shape on its own, unprompted, and said why: moving a
      seeded run "would surface as their failure". That is the pattern the other two were moved onto.

      **The rule this restores, worth stating once:** a test in `_orders` must not depend on rows another
      test or a seeder writes. Order in the barrel is for stating a real dependency between tests, not
      for keeping two independent files out of each other's way. Two of these passed only because the
      barrel happened to run them in the order that let the first claim its runs.

      **The alternative was rejected deliberately.** Partitioning the ten seeded runs between writers
      would need an allocation table nobody writes down — which is exactly what failed here — and the
      pool is finite while #run-execution, #run-delivery, #run-list and #run-cancel all still want runs.

## Q70 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-record, 2026-09-25.
<!-- spec: run-record -->

**§10 gives `ai_run_steps` two columns that describe incompatible lifecycles.** `outcome_code` is
`NOT NULL`; `finished_at` is documented as "NULL while it is running". The second anticipates a row
that exists *while* a step is in flight; the first makes such a row impossible to insert honestly,
because no outcome has been derived yet.

It was resolved in favor of the `NOT NULL`: the recorder writes one row when the step closes, and
`finished_at` null means a step that was **cut short** rather than one in flight.

- [ ] open — **the cost is stated, and it is a real one**
      **A step lost to a process crash leaves no row at all**, so the decision trace of a hard-killed
      worker stops at the last step that closed. For a table whose whole purpose is answering "what did
      this run actually do", that is the case where it answers least.

      Two ways out, both `specs/` work: a `running` outcome code seeded into the master alongside the
      others, or `outcome_code` made nullable. Neither is this feature's to choose alone — #run-execution
      is what will crash, and it is not built.

      The development seeder already carries an `in-progress` outcome code on one row, invented to seed
      a running step. That value exists in data and in no specification.

      **Update 2026-09-25 — one notch worse than written.** Checkpoint 9 found that the seeded running
      step (`10240018`, run `10010001`, `finished_at` null, `outcome_code` `in-progress`) is **a row
      shape `AiRunStepRecorder` cannot write at all**. The class writes once at close with a derived
      outcome, and its own documentation says a null `finished_at` means *cut short*, not *in flight*.
      So the fixture does not merely use an unspecified value — it depicts a lifecycle the application
      does not implement. Since §10 says an operator reads these rows directly this version, anyone
      reading the seeded record to learn what a running run looks like learns something untrue.

## Q71 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-record, 2026-09-25. **A vocabulary now exists in data and nowhere
else.**
<!-- spec: run-record -->

**`step_name`, `outcome_code` and `reason_code` are free strings with no master table, no constants file
and no list in §10.** The statuses, the step categories, the field states and the evidence kinds all have
master tables; these three have nothing.

The development seeder had to invent the first set to seed a plausible trace:

- **`step_name`** — `filter-suggestible-fields`, `fetch-media`, `read-media`, `drop-disallowed-readings`,
  `settle-by-majority`, `score-confidence`, `await-owner-decision` (one per §20 step, in order)
- **`outcome_code`** — `fields-kept`, `media-fetched`, `readings-returned`, `readings-dropped`,
  `fields-settled`, `confidence-scored`, `decision-recorded`, `media-fetch-failed`, `in-progress`,
  `step-canceled`
- **`reason_code`** — `schema-check-dropped-readings`, `majority-not-reached-for-some-fields`,
  `media-unreadable`, `canceled-before-completion`

The status recorder's tests independently invented `media_unreachable` and `run_time_limit_reached` —
**in snake_case, where the seeder used kebab-case.** That divergence appeared inside one checkpoint,
between two units of the same feature, which is the clearest possible evidence that nothing pins it.

**Update 2026-09-25 — the list was too short, in two directions.**

**Two more free-string columns belong here**, found by checkpoint 8's audit: `ai_run_field_outcomes.
field_path` (STRING(191)) and `confidence_method_version` (STRING(32)). The difference matters. The
three columns above risk a **vocabulary drift** — kebab against snake case. `field_path` risks
**privacy**: the audit wrote raw medium text into it and the row stored it, and this feature's own
seeder carries `reasonCode: 'field-path-outside-schema'`, which says a path can be produced by the
model rather than bounded by a schema. It is the widest channel by which content reaches a 730-day
table. That half is being closed as a security finding, not left to a vocabulary decision.

**And one column that looked like it belonged here does not:** `ai_runs.failure_reason_code` has a
vocabulary already, fixed in the contract. See Q77.

- [ ] open
      **Whoever builds #run-execution decides this**, and will either adopt what is seeded or contradict
      it. If a reason code is ever read back, translated or filtered on, it needs a master table like
      every other classification in this schema; if it is only ever a string in a log, it needs saying
      once in §10 that it is.

      Recorded now because the cost rises with every row written against an unpinned value.

## Q72 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-record, 2026-09-25. **Three things the status recorder had to decide
that belong to #run-cancel.**
<!-- spec: run-record -->

**1. A cancellation arriving after the run has already settled.** §10 is silent. It is refused: the
cancel-request write goes through the same terminal guard, so `cancel_requested_at` is never stamped onto
a run that finished — an instant recorded there would read as a gap that was never waited out. Whether
the API answers that with `409` or with the settled run as it stands is #run-cancel's.

**2. Whether `finished_at` is written when a run is canceled, and whether it equals `canceled_at`.** §10
names the two cancellation instants and says nothing about `finished_at`. Rather than deriving one from
the other, the method takes **both** on the call, so whether they coincide is the caller's statement and
not the class's assumption.

**3. A read-then-write window.** The guarded writer reads the run and then writes it — two statements —
so a cancellation taking effect at the same instant a worker records success could pass the guard on the
status it had already read.

- [ ] open, all three
      **The third is the one that matters and it is deliberately left open.** Closing it means a
      conditional write with the terminal statuses in the `WHERE` and an affected-row count to interpret.
      **This feature has no second concurrent writer** — nothing dispatches a run and nothing cancels one
      until #run-execution and #run-cancel exist. Whichever of those introduces the second writer is where
      the window has to be closed, and the class's own JSDoc says so.

      Writing the conditional now would be a concurrency guard verified by nothing, in a feature where the
      race cannot occur.

## Q73 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-record, 2026-09-25.
<!-- spec: run-record -->

**§10 does not settle whether a field that *was* settled may carry a null `suggestion_confidence`.** The
column is nullable and its stated meaning is "NULL when nothing was settled", so a settled field with a
null score is a row the schema permits and the prose does not describe.

The recorder does not refuse it. That is deliberate: the score is the scorer's to compute, and refusing it
here would be this class deciding a policy §10 left open — the same reason nothing in the status recorder
infers a failure from an empty result.

- [ ] open
      One sentence in §10 either way settles it. The question becomes live when
      `AssetFieldConfidenceScorer` is built in #asset-media-extraction, which is the thing that would
      produce — or refuse to produce — a settled field with no score.

## Q74 · undefined-detail · blocking: no

**Raised at** checkpoint 5 of #run-record, 2026-09-25. **Two properties of the `_orders` tree, measured
rather than assumed.**
<!-- spec: none -->

**1. `tests/_orders/` is not idempotent, tree-wide.** Run it twice against the same database without
re-seeding and it fails: `66 failed, 28 passed` across three of the four folders. Every failure is a
re-insert of a row the first run wrote — 42 × `id must be unique`, 4 × `api_client_id must be unique`,
4 × `request_key must be unique` in the `AiRun` folder alone, and `AiAgent` and `AiTool` fail the same
way. Only `AiModelCall` survives a second run.

This is **pre-existing and not caused by any work here** — the same holds for folders this feature never
touched. It is recorded because every brief in this session has had to carry the words "re-seed before
every `_orders` run", and a reader who does not know this will diagnose a dirty database as a defect.

- [ ] open
      Making the tree idempotent would mean teardown, or auto-increment ids, in every folder. That is a
      decision about the whole test convention, not about any one feature, and it is worth making
      deliberately rather than discovering again at the next gate.

**2. One order test still borrows another feature's seeded rows, latently.**
`tests/_orders/AiModelCall/AiModelCallRecorder.js` writes `ai_model_calls` rows hung off
`#run-contract`'s seeded runs `10010001`, `10010002`, `10010004`, `10010005`.

It is the same rule Q69 restored, and it **cannot bite today**: `ai_model_calls` carries no UNIQUE index
beyond `id`, and no seeder writes that table, so there is nothing for a second writer to collide with.
It is latent, not broken.

- [ ] open
      It becomes live the moment anything seeds `ai_model_calls` — which Q68 already says a later feature
      will want — or the moment that table gains a composite unique. Cheap to move now, the same way the
      two step-writing tests were just moved; left alone here because it belongs to #provider-layer's
      change set and this checkpoint had no business rewriting it.

      This is also the third instance of the same shape, after Q52 and Q69. The pattern is not a series of
      accidents: nothing in the test convention states that a `_orders` test owns the rows it stands on,
      so each feature rediscovers it.

## Q75 · contradiction · blocking: no

**Raised at** checkpoint 5's verification of #run-record, 2026-09-25. **Q70's contradiction has a
consequence outside §10, and the consequence lands on a feature that has no table to fix it with.**
<!-- spec: run-list -->

Q70 records that §10 describes `ai_run_steps.finished_at` as *"NULL while it is running"* while making
`outcome_code` `NOT NULL` in the same table — no implementation satisfies both, and the one taken writes
the row once at close, so `finished_at` null means "cut short" rather than "in flight".

**§13 (#run-list) depends on the half that cannot be satisfied.** It requires:

> a run in progress reports which step it is on, and which reading of how many

and declares *"No table of its own. Reads the run record and its steps."*

Under one-write-at-close there is no row for the step a run is **currently** on — the newest row is the
last step that *closed*. And **"which reading of how many" has no column anywhere in §10's model**:
`agreed_reading_count` and `total_reading_count` sit on `ai_run_field_outcomes`, written once per field
at settle time, and are not live counters.

`.hora/contracts/1.0.0/client-api.md` inherits the same expectation — `AiRunsResponse` carries "the
decomposed running state (`stepName`, `stepIndex`, `readingIndex`, `readingCount`, `progressRatio`)".
**#run-progress (§14) is not affected**; its step indices ride on events rather than on these rows.

- [x] resolved 2026-09-25 — **§13 narrowed, and the contract brought into line with it**
      The owner chose the third shape. §13's second criterion now reads "a run in progress reports the
      last step that completed", and `AiRunsResponse` carries "the last completed step (`stepName`,
      `stepIndex`)" in place of the five-field running state.

      **This cuts a promise to the client rather than clarifying one, and is recorded as a cut.** What
      goes is `readingIndex`, `readingCount` and `progressRatio` — so a caller can no longer show
      "reading 2 of 3" or a progress bar, only the name of the last step that finished. If that is
      asked for later, this is where it was given up.

      §13's three use cases needed no change; none of them named the reading pair. `ai_model_calls.
      reading_index` stays — it is a per-call column #provider-layer built for billing and
      reproduction, not the live counter §13 wanted.

      **The contract was pulled toward the spec, not away from it.** A contract change is ordinarily
      `contractDrift` and a finding; here it is the deliberate consequence of a scope decision, made in
      the same write as the criterion it follows.

      **Q70 stays open.** The rejected alternative — a row written at step open — would have closed both
      at once, because a step lost to a crash would then leave a row. Narrowing §13 buys nothing there,
      so the crash-loses-the-step cost is unchanged and still recorded.

- [x] the original framing, kept for the record
      The routing table names stage 4 for "a use case the data model cannot represent", which is exactly
      this. Three shapes could close it, and choosing is the owner's:

      1. **A row at open.** Seed a `running` outcome code, write the step when it starts and update it at
         close. Costs an extra write per step and makes `outcome_code` mean two things.
      2. **Live counters on `ai_runs`.** A current step name, index and reading pair maintained on the run
         row itself — which is denormalization, and the database rule prefers rows to columns.
      3. **Narrow §13.** A run in progress reports the last step that *completed*, and the reading pair is
         dropped from the contract. Cheapest, and it changes what a client is promised.

      **Raised now rather than at §13's gate**, because §13 arrives with nothing to read and its
      checkpoint 1 would fail on a spec defect three features old. Nothing here is a defect in what
      #run-record built — the verifier judged the implementer's reading the only self-consistent one and
      passed the checkpoint on it.

## Q76 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #run-record, 2026-09-25. **The seeded record shows four rows in states
this feature's own writers refuse to produce.**
<!-- spec: run-record -->

§10 says an operator reads these rows **directly on the machine** this version, so the seeded
development record is the whole of the surface an operator has. On that surface, verified by query
across all ten seeded runs:

- both `failed` runs (`10010005`, `10010009`) carry `failure_reason_code = NULL` — the exact state
  `saveFailedAiRun()` now refuses to write;
- both `canceled` runs (`10010006`, `10010010`) carry `cancel_requested_at = NULL` **and**
  `canceled_at = NULL` — a state `saveCanceledAiRun()` cannot produce, since it always writes the
  second.

So an operator walking the seeded canceled run can measure no gap at all, which is precisely what
acceptance criterion 5 promises is measurable.

- [ ] open
      The rows live in `#run-contract`'s `sequelize/seeders/development/20260923100004-000002-ai_runs.cjs`,
      which predates this feature and whose own criteria never mentioned these columns. **But criteria
      4 and 5 are this feature's**, and this feature seeded a failed, a canceled and a running trace
      into `ai_run_steps` without filling in the run rows those traces hang off.

      **The mitigation, not a fix:** the failed run's step does carry `reason_code: 'media-unreadable'`,
      so the trace answers *why* even where the run row does not.

      Four values would close it, with the two cancellation instants differing by a measurable gap on
      at least one run.

## Q77 · contract-drift · blocking: no

**Raised at** checkpoint 9 of #run-record, 2026-09-25. **A vocabulary the contract already fixes, and
four near-misses of it written as the only worked examples.**
<!-- spec: run-record -->

`.hora/contracts/1.0.0/client-api.md` fixes a **closed set of seven** codes for `failure.reasonCode`,
which is `ai_runs.failure_reason_code` rendered: `MEDIA_FETCH_FAILED`, `MEDIA_LIMIT_EXCEEDED`,
`MEDIA_UNSUPPORTED`, `MEDIA_UNREADABLE`, `PROVIDER_CALL_FAILED`, `OUTPUT_INVALID`,
`TIME_LIMIT_EXCEEDED`.

This feature's tests write four literals into that column that are near-misses of that set, in the
wrong case:

| written | the contract's |
|---|---|
| `media_unreachable` (x3) | `MEDIA_FETCH_FAILED` |
| `run_time_limit_reached` (x2) | `TIME_LIMIT_EXCEEDED` |
| `media_unreadable` | `MEDIA_UNREADABLE` |
| `media_too_large` | `MEDIA_LIMIT_EXCEEDED` |

**Nothing shipped drifts** — no production code writes a failure code yet. It matters because these
are the only worked examples #run-execution will copy, and `saveFailedAiRun()` accepts any non-blank
string, so nothing catches the divergence.

**This is not Q71.** Q71 covers three columns on `ai_run_steps` with no master and no contract entry.
`ai_runs.failure_reason_code` is the one column of the set whose vocabulary **is** already fixed, in
the contract — so it needs pinning in code, not deciding.

- [ ] open
      The repository already has the pattern: `app/constants/aiRunRefusalConstants.js`, from
      #run-contract, pins the refusal statuses the same contract declares. There is no equivalent for
      the failure reason codes, and a constants file plus corrected literals would close it.

## Q78 · undefined-detail · blocking: no

**Raised at** checkpoint 9 of #run-record, 2026-09-25. **The link this feature exists to add can point
at another run's step, and nothing notices.**
<!-- spec: run-record -->

Confirmed by execution, not by reading: a field outcome was written with `aiRunId` of one run and
`aiRunStepId` of a step belonging to a **different** run, and the row was accepted. There is no
database foreign key — correct, per the ORT rule that integrity is enforced in application code — no
application check, and no test.

`AiRunStepId` was added at this feature's checkpoint 2 for one reason: §10's second use case reads a
field's reason code off the step that settled it. **A mis-wired caller produces a field outcome whose
"the step that settled it" belongs to another run**, and the operator reads someone else's reason code
for their missing field, silently, with no way to tell.

The seeded data is consistent — zero mismatches and zero orphans across all 12 outcomes and 20 steps
— so nothing is wrong today.

- [ ] open
      Not an acceptance criterion, so it did not make checkpoint 9 unmet. But it is the one hole in the
      very link this feature was extended to provide, and the cheapest place to close it is in
      `AiRunFieldOutcomeRecorder` — read the step and refuse when its `AiRunId` is not the one handed
      in — beside the guard that already refuses a blank failure reason.

      #run-execution is the first caller, so it is the first thing that could get it wrong.

## Q79 · undefined-detail · blocking: no

**Raised while closing Q76, 2026-09-25. Same class of defect as Q76, found in the same surface.**
<!-- spec: run-record -->

**The seeded record has a run's steps running two days after the run finished.** The run seeder
(`20260923100004-000002-ai_runs.cjs`, #run-contract's) puts its instants on **2026-09-10**; the step
seeder this feature added (`20260925110001-000004-ai_run_steps.cjs`) puts its `started_at` /
`finished_at` on **2026-09-12**.

So an operator reading run `10010004` sees it accepted, started and finished on the 10th, and its
seven steps running on the 12th. Nothing in the schema forbids it and no criterion reads across the
two files, so no test fails — but §10 says an operator reads these rows **directly on the machine**
this version, and the record is therefore the only thing they have to learn what a real trace looks
like.

This is exactly why Q76 mattered: a fixture that shows an impossible state teaches that state.

- [ ] open
      **Cheap now, and it only gets more expensive.** The step seeder is this feature's own file and
      the fix is to move its instants inside each run's own window — `accepted_at` < the steps <
      `finished_at`. Twenty rows.

      It was not fixed while Q76 was, because the unit that found it had been told to touch one file
      and correctly did not reach into another's. Recorded rather than done quietly so the choice is
      visible.

## Q80 · contract-drift · blocking: no

**Raised while closing Q77, 2026-09-25. Three things, and the first is the orchestrator's own error.**
<!-- spec: run-record -->

**1. The brief asserted a precedent that does not exist.** Q77's unit was told to copy
`constants/aiRunRefusalConstants.cjs` and its bridge. **There is no such `.cjs` file.** The refusal
constants are a single ESM file at `app/constants/aiRunRefusalConstants.js`, with no CommonJS half and
no bridge. The unit found the repository's real two-file pattern by itself
(`constants/aiRunStatusConstants.cjs` + its bridge) and gave the reason the shape matters: **a seeder
can `require` a `.cjs`**, which the refusal file's shape cannot serve.

This is the same failure as the `SHORT_COLUMN_NAME` map asserted earlier in this project and found not
to exist — a brief stating a fact about the tree that the tree does not hold. The unit is what caught
it both times.

**2. Two more invented failure codes, in a file nobody was handed.**
`tests/__tests__/app/aiRun/AiRunStatusRecorder.js` carries `'run.failure.model.unavailable'` and
`'run.failure.medium.unreadable'` — the same dotted invention Q77 corrected in the `_orders` sibling,
in the `__tests__` file of the same class. Checkpoint 9's finding named only `tests/_orders/`, so no
unit's scope reached them.

Two further strings, `'run.failure.10230072'` and `'run.failure.10230075'`, sit in the `_orders` file
on status-transition refusal cases where the failure code is not what the case is about. They are
id-derived fixtures rather than near-misses of the vocabulary, but a `#run-execution` author copying
that file copies them too.

**3. The honest drift guard cannot live in the backend, and the reasoning is worth keeping.** A test
asserting that the constants file matches the contract has no precedent — **no test in this repository
reads a `.hora/` file, and no constant hash here has a test at all.** Worse, `tsdg-ai-backend` is its
own git repository and `.hora/contracts/` lives in the parent workspace, so such a test would reach
outside its own repo and **fail on a lone checkout for an absent file rather than a wrong set** — a
guard that cries for the wrong reason.

- [ ] open
      **The proposal, which I did not build:** the comparison belongs at the workspace root, where both
      files are in reach — `/hora`'s own verification, diffing the contract's table against
      `constants/aiRunFailureReasonConstants.cjs`. That is the only place the assertion is honest.

      A presence test inside the backend (seven `toHaveProperty` cases) would pin the seven **twice in
      one repository** and still not see the contract move. It catches a deleted or misspelled key and
      nothing else, and it would be the first test any constant hash here has ever had.

## Q81 — a test case's inputs are named `input` here and `params` in the testing rule

- category: convention
- blocking: no
- raised by: checkpoint 8, round four of `#run-record`

The testing rule fixes the set of fields a `test.each` case may carry, and names `params` for the
inputs to the member under test. Every test file under `tests/_orders/AiRun/` uses `input` instead —
51 occurrences in `AiRunFieldOutcomeRecorder.js` alone — and so do the `constructor` and `.create()`
describes throughout `tests/__tests__/app/aiRun/`. The `npm-package` rule's own worked example also
shows `{ input: { key: 'EQUALS' } }`, so the divergence is in the standard, not only in this repo.

I added this round's cases as `input`, to keep one shape per file rather than introduce a second one
beside it. That is a reader's choice, not a ruling.

- [ ] open
      **What has to be decided is which of the two the rule means**, and then whether the existing
      files are converted or the rule is widened to admit both. Converting is mechanical and touches
      every test file of this feature; widening costs nothing today and leaves two spellings for the
      next reader to wonder about.

      Not raised against any one file, because no file is wrong on its own — they agree with each
      other and disagree with the rule.

## Q82 — three recorders declared `Date` and none of them asked

- category: design
- blocking: no
- raised by: checkpoint 8, round four of `#run-record`

Fixed this round, and recorded because the shape is worth naming rather than the instance.

`AiRunStatusRecorder`, `AiRunStepRecorder` and `AiRunFieldOutcomeRecorder` each declared `Date` in
the JSDoc of the parameters carrying an instant, and each wrote whatever arrived straight into a
`datetime(3)` column, where Sequelize coerced it. A JSDoc type is not a guard, and every one of the
six instant columns of this feature's decision trace accepted the literal text `Invalid date`.

- [ ] open
      **The question is not this feature's, which is why it is recorded rather than closed.** Every
      `find~`/`save~` method in this repository declares its parameter types the same way, and
      nothing anywhere turns a declared type into a check. This feature now holds three call sites
      that do, through `AiRunInstantInspector`.

      Worth deciding once, for the repository: whether an instant reaching a column is checked at
      each writer, or whether the base model is where a `DATE(3)` attribute refuses a value that is
      not one — which would cover every table at once and need no writer to remember.

## Q83 — `instanceof Date` refuses an instant that crossed a realm or a queue

- category: design
- blocking: no
- raised by: checkpoint 8, round four of `#run-record`

`AiRunInstantInspector` requires a real `Date`, deliberately — coercion is how a value that was not
a time reached six columns of the decision trace, and accepting a string that happens to parse would
leave the door open for the next string that does not. The consequence is recorded here rather than
disputed.

`instanceof` fails across realms, and it fails on anything that has been serialized. The recorders
are reached from `#run-execution` and `#run-cancel`, whose background work goes through a job queue
where a payload round-trips as JSON — and a `Date` arrives on the worker side as a string.

- [ ] open
      **Whoever writes that caller has to rebuild the `Date` before handing it over**, and nothing
      today says so out loud where they will be standing. Not a defect in this feature: no caller
      exists yet, and the guard is correct for every caller that hands in what the signature asks
      for.

      Worth settling when `#run-execution` is planned — either as a note in that feature's file, or
      by deciding that the boundary which deserializes a job payload is where instants are
      reconstructed once, for every field, rather than per recorder.

## Q84 — one key is compared as it arrived while its two neighbours are normalized

- category: design
- blocking: no
- raised by: checkpoint 8, round four of `#run-record`

`AiRunFieldOutcomeRecorder` states the rule at the top of the class: a `BIGINT` key may reach it as
text, from MariaDB or from a request, and a value compared in the form it arrived in would refuse
pairs that match. `AiRunId` and `AiRunFieldStatusId` both go through a normalizer for exactly that
reason. `AiRunEvidenceCategoryId` does not.

The effect is fail-closed, so no wrong row: `aiRunEvidenceCategoryId: '1'` is refused. But the
message then reads `refused an evidence kind naming no master row: AiRunEvidenceCategoryId 1`, and
master row 1 exists — so the log names a defect that did not occur, which is the class of finding
this checkpoint has now raised four times.

Predates every round; recorded rather than fixed because the fix is a third normalizer and the
question underneath it is whether each recorder should carry its own.

- [ ] open
      **Related to [Q82](#) and decided with it, or separately.** Q82 asks whether a declared `Date`
      is checked at each writer or at the base model; this asks the same of a `BIGINT` key. Both
      answers point at the same place: a model layer that holds an attribute to its declared kind
      would cover every table at once, and would need no writer to remember.


## Q85 — criterion 3 names a model call, and nothing calls a model at this gate

- category: spec-assumption
- blocking: no
- raised by: checkpoint 1 of `#run-execution`

§11's third acceptance criterion reads "a model call is never retried automatically: a run that
fails on a provider error reports it rather than calling again". §11 also states that the concrete
job of a service belongs to that service, and that job is `#asset-media-extraction`, the seventh
feature. So at this gate there is a worker, a queue and a job body of `{ aiRunId }`, and nothing
that calls a model.

**The reading assumed, and approved by the owner:** the criterion is a statement about the queue's
retry policy rather than about a model being called. A job runs once and is never retried
automatically; a provider failure is recorded as `PROVIDER_CALL_FAILED`. Both halves are checkable
here — fail a job, observe no second delivery, read the run's reason code — using `#provider-layer`'s
stub driver to produce the failure.

- [ ] open
      **What this pass does not establish**, recorded so no later gate reads it as though it did:
      that a model was ever called, that a real provider failure produces this code, or that the
      driver reports one the way the criterion assumes. The first run in which a model call
      actually happens is `#asset-media-extraction`'s, and that is where the criterion becomes
      checkable in the sense its words suggest.

      Nothing is owed here. Left open so that the feature which does call a model reads this rather
      than re-deriving it.


## Q86 — Sequelize runs `afterCommit` hooks even when the COMMIT itself failed

- category: upstream-defect
- blocking: no
- raised by: checkpoint 5 of `#run-execution`

§11's first acceptance criterion is "the job for a run is dispatched only after the transaction that
created the run has committed; a transaction that rolls back dispatches nothing". The dispatch is
registered on `transaction.afterCommit()`, which is the only hook Sequelize offers for it.

**Sequelize 6.37.8 runs those hooks from a `finally`**, after its `catch` has already decided to
re-throw, and sets `this.finished = 'commit'` either way — verified in
`node_modules/sequelize/lib/transaction.js`:

```js
} catch (e) {
  await this.forceCleanup()
  throw e
} finally {
  this.finished = "commit"
  for (const hook of this._afterCommitHooks) {
    await hook.apply(this, [this])
  }
}
```

So a transaction whose COMMIT **failed** still fires the hook, and the hook is given nothing that
would let it tell that apart. The criterion's stated rollback clause is safe — `rollback()` never
touches the hooks — so the exposed window is a failing COMMIT alone.

- [ ] open
      **Not worked around in our own code, deliberately.** A hook cannot distinguish the case, and
      re-reading the row per dispatch would buy a query against a window this narrow.

      **What covers it instead:** the worker loads its run by `aiRunId` and no-ops when the row is
      absent. The job body is `{ aiRunId }` and nothing else, so that read already happens — the
      mitigation costs nothing and is the same read the design already required.

      **Removal condition:** drop this note if Sequelize moves the hook loop out of the `finally`,
      or gives the hook a way to know the commit failed.

## Q87 — the equipped job skill documents a surface the installed package does not have

- category: upstream-defect
- blocking: no
- raised by: checkpoint 5 of `#run-execution`

`hor-renchan-job-bullmq` (from `hora-skills-ort-renchan` 0.2.1), and therefore its digest, describe
two things that do not exist in `@openreachtech/renchan-job-bullmq` **1.1.3**, which is the version
installed and the version `npm view` reports as `latest`:

- `BaseJobEngine.createAsync({ subscriptionBroker })` and a Share holding a `subscriptionBroker`.
  Verified: the signature is `createAsync ({ config = this.config } = {})`, and the string
  `subscriptionBroker` appears in **no file** under the package's `lib/`.
- `RedisConnection#generatePubSubOptions()`, which has no consumer here and no subscriber to serve.

The digest is not at fault — it summarized the skill faithfully. The skill is what diverges.

- [ ] open
      **Why it matters beyond this checkpoint:** checkpoint 7 builds the job daemon's entry point,
      and a reader following the skill would take the boot path that passes a broker. That path does
      not exist, so the daemon would not start. The path that does exist is
      `JobWorkersDaemon.createAsync({ EngineCtor })`.

      That is also the right path for this product on its own merits: nothing here subscribes,
      because a run reports its outcome by callback (`#run-delivery`), not by publishing progress —
      and progress is `#run-progress`, which this version withdrew.

      **What is owed:** report the divergence to whoever maintains `hora-skills-ort-renchan`. Until
      then, the installed package's own files are the authority for this feature, and both the
      engine and the connection were written against them rather than against the skill.


## Q88 — the job loader reads its workers directory without checking it exists

- category: upstream-defect
- blocking: no
- raised by: checkpoint 7 of `#run-execution`

`@openreachtech/renchan-job-bullmq` 1.1.3, `lib/tools/DeepBulkClassLoader.js#loadFileNames()`:

```js
return fs
  .readdirSync(poolPath)
  .filter(it => !it.startsWith('.'))
```

No guard. An engine whose `workersPath` does not exist yet kills the daemon at boot with `ENOENT`,
where listening on nothing would be the truthful outcome — and "nothing yet" is the ordinary state
of a service whose first job has not been written.

- [ ] open
      **Worked around in our own code, not by patching the package**: `app/jobs/.keepDirectory.js`
      makes the directory exist. It is load-bearing rather than scaffolding, and it works because
      the loader's own filter skips a name beginning with a dot, so the directory yields zero
      workers rather than trying to import a file that is not one. The same idiom
      `server/restfulapi/renderers/v1/get/` already uses.

      **Removal condition:** when the loader answers an absent directory with an empty list. At that
      point the keep-file stops being a workaround and becomes ordinary directory scaffolding —
      which is also when `app/jobs/` will hold a real job anyway.

## Q89 — the second acceptance criterion cannot be observed until a service supplies a job

- category: spec-assumption
- blocking: no
- raised by: checkpoint 7 of `#run-execution`

§11's second acceptance criterion is "a run accepted while no worker is running is executed once a
worker starts". It is a property of a durable queue plus a daemon that boots and binds to it.

Everything it needs is built: Redis is declared and running, the queue library is installed, the
daemon boots and auto-discovers workers under `app/jobs/`, and the accept path enqueues after
commit. **But `app/jobs/` holds no job**, because §11 says outright that the concrete job of a
service belongs to that service — `#asset-media-extraction`, the seventh feature. So the daemon
binds no queue, and there is nothing for an accepted run to be executed *by*.

- [ ] open
      **What this gate established is structural, not observable**, and the distinction is the whole
      of this entry: the parts are present and wired, and no run has been carried across a restart
      because no run can be carried at all yet.

      **Not weakened and not worked around.** No test was written that would pass without proving
      the criterion — the implementer named the gap instead, which is why it is recorded here.

      **Where it becomes checkable:** `#asset-media-extraction`'s gate, and the whole-version sweep.
      Worth reading at `#run-execution`'s own checkpoint 9 and at its acceptance gate, so neither
      reads a pass there as evidence that a run survived a restart.


## Q90 — the job daemon executes any `.js` that lands under its workers path

- category: undefined-detail
- blocking: no
- raised by: checkpoint 8 of `#run-execution`

`scripts/startJobDaemon.js` boots `JobWorkersDaemon`, which walks `app/jobs/` recursively and
`import()`s every `.js` / `.cjs` / `.mjs` whose name does not begin with a dot. A top-level side
effect in such a file runs at boot with the daemon's full authority, and any default export that is
a `BaseJobWorker` subclass is bound to a queue **with no registration step anywhere**.

This is the framework's own design and the directory is repository-controlled, so it is recorded
rather than flagged as a defect.

- [ ] open
      **Why it is written down at all:** the daemon script's docblock presents the absence of a
      registration step purely as a convenience — "a service that adds a job directory under that
      path is picked up with no file edited here". The other half is that the path is the only thing
      standing between a file and being executed. Both halves are now in that docblock.

      **The adjacent fact worth keeping beside it:** `app/jobs/.keepDirectory.js` exports
      `Object`, and is skipped only because the loader filters names beginning with a dot ([[Q88]]).
      If that filter ever changes, the global `Object` constructor would be offered to the daemon as
      a candidate worker class. Harmless while the filter stands, and the two are worth reading
      together.

      **What would close this:** nothing is owed. It is the shape of the framework, and a reviewer
      of `#asset-media-extraction` — the first feature to put a real file in that directory — is who
      this entry is written for.


## Q91 — the spec defines the media allow-list and never says where it lives

- category: undefined-detail
- blocking: no
- raised by: checkpoint 1 of `#media-fetch`

§18's first acceptance criterion turns on it: "a file URL whose host is not on the allow-list is
refused, and nothing is fetched". §5's glossary defines the term — "the set of hosts this service
may fetch a file from. A URL on any other host is refused" — and §NFR repeats it: "Media arrives as
a URL this service fetches from an allow-listed host".

**Nothing says where the set of hosts is held.** §23's key file map is an empty table, no section
names a configuration file or an environment key for it, and §18 declares its three tables —
`ai_run_media_categories`, `ai_run_media`, `provider_uploaded_files` — with no allow-list among
them.

- [ ] open
      **The reading taken, and why:** an environment key, read through `app/globals/_.js` like every
      other deployment fact this service holds.

      The strongest evidence is the omission itself. §18 lists its tables exhaustively; a feature
      whose data model is stated that completely would have declared a fourth table if the
      allow-list were one. And the value cannot be a constant in code, because development fetches
      from a local or fake host and live fetches from the client's own storage — a deployment fact
      by definition. Adding a host is then a deployment change rather than a migration, which is
      also the cheaper of the two for a set that will change when the client moves storage and
      almost never otherwise.

      **What the reading gives up:** an allow-list in a table could be per client, could carry a
      reason and a date, and would be readable by an operator without a deployment. Nothing in
      §18 asks for any of that, and the criterion is written about "the allow-list", singular and
      service-wide.

      **Worth settling in the spec** — this is a durable design fact that a later reader will want
      stated rather than inferred from an absence.


## Q92 — the run response's `engine` carries two facts, and one of them is per field

- category: undefined-detail
- blocking: no
- raised by: checkpoint 3 of `#run-delivery`

`.hora/contracts/1.0.0/client-api.md` says `engine` holds "which loop and model produced the result,
**and** the version of the confidence formula that scored it" — two facts. The data model carries
them in two places and at two different grains:

- `ai_runs.engine_label` — one string, one per run
- `ai_run_field_outcomes.confidence_method_version` — **one per settled field**, so a single run can
  carry several different values

§12 declares no shape for `engine`, and neither does the contract.

- [ ] open
      **The reading taken at checkpoint 3**, and used unchanged by checkpoint 4's stub:
      `engine: { label, confidenceMethodVersion }`, both nullable. It is the only reading that
      carries both facts without smushing them into one string.

      **What it leaves open, and what checkpoint 6 must decide:** what a run whose settled fields
      carry two *different* `confidence_method_version` values answers. The candidates are the one
      shared by every field (null when they disagree), the newest, or a move of the field to
      `steps[]` where the grain matches. Nothing in the spec prefers any of them.

      **Not drift.** The contract states the content; it just does not state the shape. Worth
      settling in the spec before `#run-list` answers the same field for many runs at once.

## Q93 — `steps[]` has no declared field list anywhere

- category: undefined-detail
- blocking: no
- raised by: checkpoint 3 of `#run-delivery`

`GET /v1/ai-runs/:runKey?expand=steps` answers a `steps[]`, and **no section says what is in a
step**. §12 does not, §10 does not, and the contract names the array without naming its fields. §10
says outright that "the API read-back is `#run-delivery`", so the shape falls to this feature by
default rather than by statement.

- [ ] open
      **The reading taken at checkpoint 3**: the seven fields readable off `ai_run_steps` —
      `stepIndex`, `stepName`, `stepCategoryName`, `outcomeCode`, `reasonCode`, `startedAt`,
      `finishedAt`.

      **`rejections` is deliberately excluded**, and that is the part worth a decision rather than
      an inference. It is the internal decision trace; the contract never names it; and §10 is
      emphatic that the trace holds figures and never values. Handing it to a client would be a
      spec edit, not a code change.

      **Where it bites:** a client debugging a run will ask why a field was rejected, and the answer
      is in the column this reading withholds. That is a product decision about what a partner may
      see, which is why it is recorded rather than settled here.

## Q94 — which media kinds this version handles is a flag, not a name in code

- category: design
- blocking: no
- raised by: checkpoint 3 of `#media-fetch`

§18 seeds three media categories — `image`, `video`, `audio` — and says the two unhandled ones exist
"so a request naming one of them is refused by name rather than ignored". **It does not say how the
handled one is distinguished from the other two.**

- [ ] open
      **The reading taken**: `is_active` on `ai_run_media_categories`, `image` true and the other two
      false. What it buys is that the distinction is a data fact rather than a list in code — turning
      video on later is a flag flipped on an existing row, and a fourth kind is a new row, neither of
      them a code change.

      **What it obliges**: checkpoint 5 must **read the flag**, not hard-code `image`. Written into
      this feature's brief for that reason.

      **The alternative not taken** was seeding only `image` and refusing anything else as unknown —
      rejected because it cannot tell "a kind we know and do not handle yet" from "a kind that does
      not exist", which is exactly the distinction §18 asks the refusal to make.

## Q95 — a fifth file now carries an inline lint exception

- category: eslint-exception
- blocking: no
- raised by: checkpoint 8, round 2, of `#run-execution`

`eslint.config.js` keeps a list of files permitted an inline `eslint-disable`, under a comment
reading "🚨 Never add other files to this files." It held four. It now holds five:
`sequelize/models/AiRun.js`, for `no-param-reassign` on one line.

The line is `options.where = provenAiRunCondition`, inside `beforeBulkUpdate`. **Sequelize gives a
bulk hook no return channel** — it reads `options.where` back after the hook and builds the statement
from it — so assigning to it is the only way the UPDATE runs under the condition the model built
rather than under the caller's object. Three routes were tried and none avoided it: a named method
taking `{ options }` is still flagged (the destructured binding is a parameter binding), the rule's
`ignorePropertyModificationsFor` option is empty in the shared config, and `Object.assign` is on the
`no-restricted-properties` denylist.

- [ ] open
      **Put to the person running the session and approved by them**, with the alternative stated:
      dropping the substitution and keeping only the compile check needs no exception, but drops the
      guarantee from "the statement runs under this model's condition" to "the caller's `where`
      compiled to that condition at the instant the hook asked" — which a `where` answering
      differently on a second read would satisfy while running something else.

      **Removal condition:** if Sequelize ever gives a bulk hook a return channel for its `where`,
      or if the shared config grows an `ignorePropertyModificationsFor` covering a hook's options.


## Q96 — a step still running must carry an outcome code, and no vocabulary names one

- category: contradiction
- blocking: no
- raised by: checkpoint 4 of `#run-delivery`

`ai_run_steps.outcome_code` is `NOT NULL` while `finished_at` is nullable. Those two together say a
step that has started and not finished must nevertheless carry an outcome code — and **§10 and §20
name no code for "still running"**. The table belongs to `#run-record`, which is already accepted,
so this is a contradiction inside shipped schema rather than a gap in work not yet done.

- [ ] open
      Found while building the stub for `GET /v1/ai-runs/:runKey`, which has to answer a `running`
      run's `steps[]` and therefore had to put *something* in the column. The stub uses `running` as
      a specimen and says so in the file.

      **Two ways out, and they are not equivalent.** Making the column nullable while a step is in
      flight says "no outcome yet" in the schema, and `finished_at` already carries that information
      so the pair stays consistent. Writing a `running` code into the vocabulary makes the in-flight
      state a value like any other, which reads better in a response but means every consumer must
      know that one code is not terminal.

      **Where it bites:** checkpoint 6 answers this field from real rows, so whichever is chosen has
      to be chosen before then. Until it is, a real `running` step has no defined answer.

## Q97 — the asset-media-extraction result has a table in §20 and no type declaration

- category: undefined-detail
- blocking: no
- raised by: checkpoint 4 of `#run-delivery`

A stub for §12 cannot answer a succeeded run without materializing the `result` payload, and
`result` is "per service" — §12 declares no shape and the contract gives only the
asset-media-extraction table from §20. So **this feature's stub now contains a specimen of a later
feature's payload**, taken field for field from §20's table.

- [ ] open
      Checkpoint 3 typed the field `Record<string, unknown> | null` with a comment saying the
      answering service declares its own, so that a second service adds its own interface rather
      than editing this one. That part is settled and is the right shape.

      **What is not settled:** `#asset-media-extraction`'s own checkpoint 3 should declare the
      concrete interface under `types/restfulapi/`, and **this stub's specimen must then be
      reconciled against it**. Two independent renderings of one payload is exactly the drift the
      one-builder-two-callers rule exists to prevent, and right now there are two.

## Q98 — a decimal's wire type is decided by the dialect unless someone decides it

- category: undefined-detail
- blocking: no
- raised by: checkpoint 4 of `#run-delivery`

`ai_run_field_outcomes.suggestion_confidence` is a `decimal`. **Sequelize hands a `DECIMAL` back as
a string on MariaDB** and the contract says nothing about the wire type, so a client reading
`suggestionConfidence` gets `0.92` or `"0.92"` depending on which dialect answered.

- [ ] open
      The stub emits a number. Checkpoint 6 reads real rows and will emit a string unless it casts.

      **This is the same trap that already failed once here** — `#run-record`'s checkpoint 3
      recorded a DECIMAL/SQLite failure, and the local database is SQLite while live is MariaDB, so
      a suite that passes locally does not settle it.

      Decide once, in the contract, rather than let a client discover it. The same question reaches
      every money-shaped or score-shaped field this product answers.

## Q99 — the spec says a value is written in the asset owner's language, and the file rule says English

- category: spec-assumption
- blocking: no
- raised by: checkpoint 4 of `#run-delivery`

§20 says extracted values and their reasons are written in the language the asset owner reads. The
project's own rule is one language per file and English in files. **A client reading the stub would
reasonably conclude the field is ASCII**, because the canned `reason` strings are English with a
comment stating the production language.

- [ ] open
      The stub is right to be English — the file rule governs what is in a file. What is missing is
      a line in §12 or the contract saying the field is **free text in the asset owner's language**,
      so a consumer sizes and renders it accordingly rather than discovering multi-byte text in
      production.

## Q100 — the equipped stub-API skill has no REST chapter

- category: upstream-defect
- blocking: no
- raised by: checkpoint 4 of `#run-delivery`

`hor-stub-api` is GraphQL-only: every instruction is about
`server/graphql/resolvers/<audience>/stub|actual/`, `static get schema ()` and `errorCodeHash`.
**This product's only client-facing surface is REST**, and the REST layer has no `stub/`↔`actual/`
split to migrate through — one `renderersPath`, one class per route.

- [ ] open
      **Carried over rather than skipped**: the skill's grand principle (hardcoded literals only,
      shape-accurate, the real class name and the real interface) applies unchanged, and the REST
      form of the migration is written into the renderer's own JSDoc — checkpoint 6 keeps the file,
      the class name, `get:routePath` and the response shape, and replaces the body; the canned
      constants leave with the old body.

      **One instruction of the skill pulled against this checkpoint's own requirement.** The skill
      forbids conditionals; the assignment asked for a canned answer per distinguishable state.
      Resolved with hash lookups — the sanctioned dispatch form — and no branch anywhere, with both
      reads made total so a key reaching `Object.prototype` behaves as an unknown key does.

      **What is owed:** report the gap to whoever maintains the equipped skills package. A REST
      chapter, or a statement that the principle is surface-independent, would remove the judgment
      call from the next person who stubs a route.

## Q101 — the stub is a live route the moment the engine starts

- category: design
- blocking: no
- raised by: checkpoint 4 of `#run-delivery`

The REST layer has no barrel. `AppRestfulApiServerEngine.config.renderersPath` points at
`server/restfulapi/renderers/v1/`, and `RestfulApiRoutesBuilder` deep-loads every class under it
whose prototype is a `BaseRenderer` and registers it at boot. **So `GET /v1/ai-runs/:runKey` answers
canned data from the next start**, and it is the first renderer to land under that tree.

- [ ] open
      **Verified in the main session rather than taken on report**, because a stub that answers the
      outside world is different from a stub that does not. `BaseRenderer#passesFilter` defaults to
      `false`, and `RestfulApiRoutesBuilder#generateRendererHandler()` reads that as *run the filter
      handler* — the naming is inverted, and the renderer inherits the default, so the engine's own
      filter answers `401`/`403` ahead of the canned body. The stub is behind authentication.

      **What remains true and worth stating:** between now and checkpoint 6, an authenticated client
      reading a run back gets invented data rather than an error. That is what a stub is for, and
      the window is one gate wide, but it is a window on a real surface rather than on a mock.


## Q102 — the spec says "10 MB per photo" and never says which megabyte

- category: undefined-detail
- blocking: no
- raised by: checkpoint 5 of `#media-fetch`

§7 states the cap as "10 MB per photo, and at most 12 photos in one request — matching the client's
own upload limit, so nothing is refused twice for different reasons". **A file between 10,000,000
and 10,485,760 bytes is accepted on one reading and refused on the other.**

- [ ] open
      **The reading taken**: `10 * 1024 * 1024 = 10485760`, written into the constant's comment with
      its reasoning — an upload limit is customarily stated in binary, and it is the larger of the
      two readings, so nothing the client's own uploader accepted is refused here. The spec's own
      justification for the cap ("matching the client's own upload limit") is what makes the larger
      reading the safer one: refusing something the client already accepted is the failure this
      sentence exists to prevent.

      **Worth one line in the spec**, because the two readings differ by 485,760 bytes and the
      boundary is exactly where a complaint would come from.

## Q103 — the contract fixes no field names for the limit reason's parameters

- category: undefined-detail
- blocking: no
- raised by: checkpoint 5 of `#media-fetch`

`MEDIA_LIMIT_EXCEEDED` is the one reason code of the seven that carries parameters, and
`.hora/contracts/1.0.0/client-api.md` says only that they "carry the limit". **No field names.** The
client system builds its own wording out of them, so the names are part of the interface whether or
not the contract says so.

- [x] resolved at checkpoint 5 of `#run-delivery`
      **The shape chosen**: `{ limitName, limitValue, declaredValue }`, with `limitName` one of
      `'mediaByteSize'` / `'mediaCount'`. The distinction matters because the size cap and the count
      cap share one reason code and are two different things for a person to do about — trim a photo,
      or send fewer.

      **Why this one won over the stub's `{ mediaCountLimit, sentMediaCount }`:** the contract's own
      row says `MEDIA_LIMIT_EXCEEDED` covers "over the byte cap, **or** more media than the limit",
      and §20's criterion says "with the limit named in the reason's parameters". The kept spelling
      names which limit was exceeded and covers both cases; the other names no limit and can express
      only one. The stub's canned literal was changed to match in the main session, so no second
      spelling remains on the branch.

      **Still worth a line in the contract**, which names no fields for this at all — the reconciliation
      settled which spelling this product uses, not what the contract states.

      **This belongs in the contract** rather than being settled by the first implementation that
      needed it. `#run-delivery`'s stub independently chose `{ mediaCountLimit, sentMediaCount }` for
      the same code — **so there are already two spellings of one payload in this branch**, which is
      exactly what a contract exists to stop. They must be reconciled before checkpoint 6.

## Q104 — the kind refusal is required by the constraint block and by no acceptance criterion

- category: contradiction
- blocking: no
- raised by: checkpoint 5 of `#media-fetch`

§18's constraint block and the client contract both require `MEDIA_UNSUPPORTED` — "a medium of a kind
this version does not handle, named rather than ignored", which is also why §18 seeds `video` and
`audio` at all. **None of §18's six acceptance criteria covers it.**

- [ ] open
      `AiRunMediaCategoryInspector` was built and tested for it anyway, because checkpoint 3 put
      `is_active` on the master for exactly this and [[Q94]] records that reading.

      **The gap is in what the gate can catch, not in the code.** No criterion covers this behaviour,
      so a later change that dropped the kind check would pass this feature's checkpoint 9 and its
      acceptance gate with nothing red. Every other behaviour §18 asks for has a criterion standing
      over it; this one does not.

      **The fix is a criterion in §18**, which is `/hora-spec`'s to write, not this feature's.

## Q105 — use case 2 has nothing to call, and checkpoint 9 will find that

- category: spec-assumption
- blocking: no
- raised by: checkpoint 5 of `#media-fetch`

§18's second use case is "ORT answers, months later, exactly which file was handed to which provider
and when". Checkpoint 2 verified it on paper against the table and its join, and that verification
holds. **But §18 declares no operation for it**, so there is no API to ask.

- [ ] open
      Deliberately not built: an operation reaching past this checkpoint would be work the spec does
      not ask for, and inventing one here would put a client-facing surface into the product by
      implication rather than by decision.

      **Where it surfaces:** checkpoint 9 re-verifies the use cases against the **built API**. For
      this one there is nothing to call, so the answer will be that the data is there and the
      question cannot be asked over the wire. That is a true answer and it should be recorded as one
      rather than read as a failure — but it is also the moment to decide whether an operator tool,
      a query, or nothing at all is what this use case actually wants.

## Q106 — two catalogued packages were read and not taken

- category: design
- blocking: no
- raised by: checkpoint 5 of `#media-fetch`

The once-per-feature catalog check found two entries overlapping this work. Both were declined, and
the reasoning is recorded so the choice is a decision rather than an oversight.

- [ ] open
      **The rocket-client triad** (Launcher / Payload / Capsule), which the external-API-client
      convention is written around. It models endpoints of *one* API: a Launcher holds a base URL, a
      Payload describes method / pathname / query / body. A media fetch has **no base URL** — the
      host varies per request and is bounded only by the allow-list — no pathname to describe, since
      the whole URL arrives verbatim in the request body, and a binary body rather than a parsed one.
      The convention's cross-cutting rules were followed instead: native `fetch` only, failure
      decided from the returned value rather than a `try`/`catch` at the caller, `null` never
      `undefined`, and `fetch` reached through a static getter so a test substitutes it.

      **The unit said outright it was not fully confident in this one**, and that is worth keeping:
      taking the triad later is a dependency plus a rewrite of `MediaFetchClient`, not a refactor.

      **The value-inspector package**, overlapping the whole-number checks. Declined because this
      repository already answers the same question by hand in `AiRunKeyInspector` ([[Q9]] records the
      same call for `RunKeyGenerator`), and because the behaviours differ where it matters: a
      declared size of `0` must **pass** the cap check while `isPositiveNumberLike()` would refuse
      it, and `'007'` must not read as a size.


## Q107 — nothing sweeps a temporary workspace a dead worker left behind

- category: undefined-detail
- blocking: no
- raised by: checkpoint 7 of `#media-fetch`

§18 says a fetched file's temporary copy "lives on the worker's disk for the length of the run and
is deleted when the run ends", and the removal is now hooked into the only place that knows a run
has ended. **A delivery whose process is killed between the fetch and the removal runs no `finally`
at all**, and the copy stays on disk.

**§19's retention section declares three purge jobs and all three are database sweeps.** None of
them touches the disk, so this is not covered there either.

- [ ] open
      **No disk sweeper was invented**, deliberately. A periodical job that deletes files is
      `#retention`'s to declare, and §19 declares none — building one here would put a file-deleting
      job into the product by implication rather than by decision, and a sweeper that gets its
      pattern slightly wrong deletes a running delivery's working files.

      **The mitigation that exists**: the workspace root is the machine's own temporary directory,
      so the operating system reclaims it eventually. That is a mitigation, not a plan, and it is
      stated as such in two class comments rather than left to be assumed.

      **What a decision here looks like:** either §19 grows a fourth purge that sweeps workspaces
      older than the run time limit, or §18 states that the temporary directory's own lifecycle is
      the answer and a killed process's leftovers are accepted. Both are defensible; neither is
      written down.

      Worth reading at `#retention`'s gate, and at the whole-version sweep.


## Q108 — reading a run back stops returning the callback's body after the content purge

- category: contradiction
- blocking: no
- raised by: checkpoint 5 of `#run-delivery`

§12's fourth criterion is unconditional: "reading a run back by its key returns the same body the
terminal callback carried". **§19 purges `result_body` after thirty days**, so from day thirty-one
the read-back answers `result: null` while the callback carried a result.

- [ ] open
      §10 is clear that the purge is intended — the decision figures survive on the long clock
      *precisely because* the content does not. So the two sections do not disagree about behaviour;
      §12's criterion is simply written without the clause that makes it true.

      **No test was weakened for this.** The tests assert the body a run carries at the time it is
      read, which is the honest statement of what the builder does.

      **The fix is one clause in §12** saying the equality holds until the content purge. Worth
      settling before the whole-version sweep reads that criterion against a product that will
      eventually contradict it.

## Q109 — a stored result that will not parse has no stated answer

- category: undefined-detail
- blocking: no
- raised by: checkpoint 5 of `#run-delivery`

`ai_runs.result_body` holds what the answering service wrote. **Nothing says what a read-back answers
when that column holds text that is not an object** — unparseable, an array, a bare number, or null.

- [ ] open
      **The rule chosen**, written into `AiRunResponseBuilder#buildResult()`: `result: null` whenever
      the column holds no object. The client still gets `statusName`, `usage` and `failure` rather
      than a `500`, which is the more useful failure.

      **The cost, stated in the code:** a client cannot tell that case from a run whose result was
      legitimately empty. If the spec would rather it be loud — a `500`, or a distinct failure code —
      that is a one-line change in that method.

## Q110 — three response fields have no seeded non-null path

- category: undefined-detail
- blocking: no
- raised by: checkpoint 5 of `#run-delivery`

`sequelize/seeders/development/*-ai_runs.cjs` writes `engine_label`, `result_body` and
`failure_parameters` as **null on all ten rows**. So three fields of the run read-back cannot be
exercised non-null against seeded data.

- [ ] open
      **A second `ai_runs` seeder was deliberately not added** — that file warns against giving the
      table two sources of truth, and a second seeder is exactly that. The fields are covered instead
      by a describe that hands the builder a run entity written out in the case, while its children
      are read for real.

      **What is owed:** a row or two carrying all three, added to the existing seeder when
      `#run-contract` is next touched. Until then, the happy path of those three fields rests on a
      hand-written entity rather than on a row the database produced.

## Q111 — the run-key header's name is a reading, not something the contract states

- category: undefined-detail
- blocking: no
- raised by: checkpoint 5 of `#run-delivery`

`.hora/contracts/1.0.0/client-api.md` says a callback is "signed as a request is, plus the run key in
a header" — and **names no header**. The three inbound header names are fixed there; this fourth one
is not.

- [ ] open
      **The spelling chosen**: `x-ort-run-key`, matching the prefix and casing of the three beside it
      so a client reads one convention across the whole protocol. It lives in
      `constants/signedRequestHeaderConstants.cjs` with the other three, which is also what stopped
      the inbound context and the outbound signer from holding two sets of literals.

      **Adding it to the contract's Callback row would be an improvement, not a correction** — the
      contract is silent rather than wrong. But a client has to know the name to read it, so silence
      here means the name is discovered from an implementation.


## Q112 — a purged run is distinguishable on the record and not on the client surface

- category: contradiction
- blocking: no
- raised by: checkpoint 6 of `#run-delivery`

§19 carries a criterion: "a run whose content has been purged is distinguishable from one that never
carried any". **It is satisfied on the run record and not on the surface a client reads.**

`.hora/contracts/1.0.0/client-api.md`'s `AiRunResponse` carries no purged marker, so
`GET /v1/ai-runs/:runKey` answers `result: null` for both — a run that was purged after thirty days,
and a run that never produced a result at all.

- [ ] open
      Found while replacing the stub's canned body with the real one. The renderer is not where this
      is decided: the response shape is the contract's, and whether the distinction belongs on the
      client surface at all is §19's call. Both facts are now written into the renderer's own JSDoc
      so the next reader does not have to rediscover the asymmetry.

      **Related to [[Q108]] and worth settling with it.** That one says §12's "reading a run back
      returns the same body the callback carried" is written without the clause the purge makes
      necessary; this one says the client cannot tell when that clause has bitten. Either the
      response gains a marker, or §19's criterion states that it is satisfied for an operator and
      not for a client.

      **Where it bites:** a client reconciling a missed callback months later reads `result: null`
      and cannot tell whether to re-request the work or accept that the run produced nothing.


## Q113 — the time limit stops a run's accounting and does not stop the work

- category: design
- blocking: no
- raised by: checkpoint 9 of `#run-execution`

§11's third use case is *"a run that has been going too long stops by itself **instead of holding a
worker indefinitely**"*. The fourth acceptance criterion — "a run still running past the time limit
ends as failed, carrying the time-limit reason code" — is kept in full: the race answers, the row is
written, and the losing side can never reach that row because the status is the base worker's to
write.

**The use case's own words are not kept.** `BaseAiRunJobWorker` races the work against a timer and
then leaves the loser "to settle or reject on its own". A work that ignores the race keeps running,
holding its worker slot — so the daemon's concurrency drops by one for as long as that work lives,
which for a work that never settles is forever. That is precisely "holding a worker indefinitely".

**There is no channel at all for the work to be told.** `parcel.signal` is deliberately unused, and
that reasoning is sound — it is BullMQ's abort signal, its firing conditions are undocumented, and a
limit built on it would be a limit nobody could state the behaviour of.

- [ ] open
      **The gap is that no signal of this class's own making is offered either.** `executeAiRunWork()`
      is handed a body, a context and a parcel, and nothing it could honour. The shape that closes it
      is the one `MediaFetchClient` already uses against the same problem: an `AbortSignal` this class
      controls, raised when the timer wins, passed into the work.

      **What that buys and what it does not.** Nothing can force a concrete work to honour a signal,
      so this makes cooperative stopping *possible* where today it is impossible. A work that ignores
      it still holds its slot — but it then does so by its own choice, which is a different statement
      from the one that is true now.

      **Why it is worth doing before the seventh feature and not after.** `#asset-media-extraction`
      is the first concrete `executeAiRunWork()`, and it fetches files and calls a provider — both
      long, both already signal-aware. If the channel is added after it is written, it is written
      against the shape that has no channel and then has to be revisited.

      **Second-order, already recorded**: the same absence is why a work still running past the limit
      can write a media file after the workspace was removed — `#media-fetch`'s checkpoint 7 names it
      on the class and could do nothing about it. Closing this closes that.

- [x] the channel was built, and it is not the whole of what the use case asks
      `BaseAiRunJobWorker` now builds a controller per race and hands its signal to
      `executeAiRunWork()`, raised **only** where the time limit won. Two controllers, because the
      two cancellations run opposite ways: the work's signal is raised only on a loss, while the
      alarm behind it is cancelled whichever way the race ends — an alarm nobody is waiting on would
      still fire, and firing is what raises the work's signal, so a work that answered in time would
      be told its run was over minutes later.

      **`parcel.signal` stays unused and its reasoning stays verbatim.** This is a second signal,
      this service's own, whose firing condition this file states.

      **What it guarantees**: a work is *told*, before the row is settled, that its run went past the
      limit, as a real `AbortSignal` it can hand to a fetch or a provider client; a work that
      answered in time is never handed a raised one; and no path out of the race leaves a timer
      behind.

      **What it does not guarantee**: that any work stops. A work that ignores the signal keeps
      running and keeps its slot. What changed is that this is now the work's choice rather than its
      only option — and no docblock claims the slot is freed.

      **What it makes somebody else's**: `#asset-media-extraction`'s `executeAiRunWork()`, the first
      concrete one, must honour the signal in the calls it makes and ask it before writing into the
      run's workspace. `#media-fetch`'s checkpoint 7 finding is now **closable but not closed**.

      **And the use case is still ahead of what any base class can deliver**, which is worth a spec
      decision rather than another round of code: §11 asks for a run that stops "instead of holding a
      worker indefinitely", and the only mechanism that truly frees the slot is killing the worker
      process — which would take the daemon's other in-flight runs with it. Either the wording
      becomes what the system keeps ("the run stops being waited on, and its work is told to stop"),
      or a second mechanism is designed. **Left open for that reason**, not because the channel is
      missing.


## Q114 — three fixture files tell two incompatible stories about one run

- category: contradiction
- blocking: no
- raised by: the fixture-enrichment pass after checkpoint 6 of `#run-delivery`

Run `10010009` is described three ways and two of them cannot both be true:

| file | what it says |
| :-- | :-- |
| `development/*-ai_runs.cjs` | `failure_reason_code: 'PROVIDER_CALL_FAILED'` — the provider errored or declined |
| `development/*-ai_run_media.cjs` | `byte_size: 20971521` against a 10485760 cap, `fetched_at: null`, and the comment *"over the 10 MB cap, so nothing was fetched and nothing was sent"* |
| `development/*-ai_model_calls.cjs` | a model call with a `response_body`, and the comment *"failed on its provider, and the call that errored is still a call it made"* |

**A run cannot have sent nothing and also have made a model call.** Verified by reading all three rows
rather than taken on report.

- [ ] open
      **Where it came from.** `#media-fetch`'s seeder needed an over-cap medium as a fixture for the
      byte-cap check, and **no run carried `MEDIA_LIMIT_EXCEEDED`** to hang it on — only two of the
      seven reason codes have a seeded row at all (`MEDIA_UNREADABLE` on `10010005`,
      `PROVIDER_CALL_FAILED` on `10010009`). So the medium was attached to the nearest failed run,
      which already had a different story. The model-call seeder then read that run's code at face
      value and wrote a third.

      **Why it matters beyond tidiness.** No test cross-checks the three, so nothing is red today.
      That is exactly what makes it corrosive: a fixture set that disagrees with itself stops being
      evidence, and each later feature reads whichever file it happens to open.

      **The resolution that loses nothing**: add one failed run under `MEDIA_LIMIT_EXCEEDED` carrying
      `{ limitName: 'mediaByteSize', limitValue: 10485760, declaredValue: 20971521 }`, move the
      over-cap medium onto it, and give `10010009` a medium consistent with having reached a
      provider. That also closes §12's sixth criterion, whose "and its parameters" half is today
      backed only by a hand-written entity — `MEDIA_LIMIT_EXCEEDED` is the one code of the seven that
      carries parameters at all.

      **The resolution that loses something**, and was rejected: flipping `10010009` to
      `MEDIA_LIMIT_EXCEEDED` needs no new row, but leaves `PROVIDER_CALL_FAILED` with no seeded run.

      **The id question, answered rather than left as an objection**: the new row goes in the
      `ai_runs` seeder's own block. A prefix governs who may mint an id; a table's rows live in the
      block of the seeder that owns that table, so adding a row to a seeder is that seeder's block by
      definition. Filling a column of a row that already exists mints nothing and was never the issue.


## Q115 — a fetched file is never checked against what it claims to be, and the acceptance was never recorded

- category: design
- blocking: no
- raised by: checkpoint 8, round 3, of `#media-fetch`

`MediaFetchClient#extractResponseMimeType()` carries the server's `content-type` through unverified,
and the bytes are then written to disk and handed to a provider. **There is no magic-byte check
anywhere.** A body declared `image/jpeg` that is an archive, an SVG or a polyglot reaches a provider
declared as a photograph.

Under the audit skill's own upload criteria — size validated, declared type trusted, no content check
— that is a MEDIUM.

- [ ] open
      **The decision itself is sound and is not being reopened.** §18 asks for no content check and
      names no set of formats to check against, and `ai_run_media.mime_type` is specified as borrowed
      verbatim from the standard — that is, the caller's claim. Adding a sniffer would decide which
      files this service refuses, which is a spec decision and not an audit fix.

      **The finding is that nobody recorded it.** Rounds 1 and 2 both saw the paragraph in the class
      docblock and both passed over it; the acceptance lived in a comment in the source and in two
      agent reports, and in no place a later reader of `.hora/` would find it. Checkpoint 8 requires
      a finding to be fixed **or explicitly accepted and recorded**, and only the first half of the
      second option had happened. **That is my omission, not an agent's** — I read three audit reports
      naming it and recorded the spec silences around it while leaving this one in prose.

      **What closing it looks like:** §18 gains a criterion naming the formats this service accepts,
      or states that the declared type is the caller's claim and is carried through deliberately.
      Either is a `/hora-spec` edit. Until then this entry is the record.

      Related: [[Q104]], where a required behaviour has no criterion standing over it, is the same
      shape one level up — a decision that is real in the code and absent from what the gate checks.


## Q116 — "retried until it lands" names no bound, and a queue needs a number

- category: undefined-detail
- blocking: no
- raised by: checkpoint 7 of `#run-delivery`

§12's eighth criterion says a callback that fails to deliver **is retried**. Nothing in §12 or in
`.hora/contracts/1.0.0/client-api.md` states an attempt count, a backoff, or what a client should
expect once the attempts are spent.

- [ ] open
      **The reading taken**: seven attempts on an exponential backoff from one minute — roughly an
      hour of trying. Argued from §7's "an hour's outage is tolerable" and from §12's own
      reconciliation use case, which says the read-back is the route for a client that missed a
      callback. Past the last attempt, that read-back is what remains.

      **The number is asserted as a whole option hash**, the same way `#run-execution` asserts its
      own `attempts: 1`, so it cannot drift silently — but it is this implementation's reading and
      not something the spec states.

      **Worth settling**, because a client integrating against this service has to know how long to
      wait before falling back to polling, and today that answer exists only in a dispatcher.

## Q117 — a client that refuses is retried exactly like a client that is down

- category: undefined-detail
- blocking: no
- raised by: checkpoint 7 of `#run-delivery`

§12 says a callback is retried until it lands and **draws no line between a far side that is
unreachable and one that answers "no"**. So a `404` or a `410` from a registered callback URL is
retried on the same schedule as a `503`.

- [ ] open
      **Anything that is not a `2xx` counts as not landed**, deliberately — deciding otherwise would
      be this service inventing a rule the spec does not give it. A `4xx` is retried.

      **What it costs**: a client that has permanently removed an endpoint is called seven times over
      an hour for every settled run, and the delivery table fills with attempts that could never have
      landed.

      **If a permanent refusal is meant to stop the retrying, the spec has to say so** — and say which
      statuses count as permanent, because that is the part an implementation must not guess.

## Q118 — the job daemon now needs Redis at boot, where it needed nothing before

- category: design
- blocking: no
- raised by: checkpoint 7 of `#run-delivery`

`app/jobs/` held only its keep-file, so the daemon's folder scan bound **no queue** and the process
started against nothing. `app/jobs/deliver-run-callback/` is the first real job, so from its next
start the daemon opens a live BullMQ Worker — and therefore needs Redis reachable to start at all.

- [ ] open
      **This is the intended state, not a regression** — a daemon that listens to nothing is the
      thing [[Q89]] has been recording as un-observable. It is recorded because it changes what a
      deployment must have running before the worker process is considered healthy, and nothing in
      §11, §12 or §23 says so.

      **What it does not close**: [[Q89]] itself. §11's second criterion is about *a run's* job
      surviving a restart, and this is a *callback* job. The daemon-plus-durable-queue mechanism
      becomes observable for the first time; the run job §11 speaks of is still
      `#asset-media-extraction`'s to supply.


## Q119 — an outbound callback's signature is a valid inbound request's signature

- category: design
- blocking: no
- raised by: checkpoint 8, round 1, of `#run-delivery`

`AiRunCallbackSigner` builds its payload and its digest through the **same** class that verifies an
inbound request. That borrowing is right — a second implementation would be self-consistent and
neither side would catch the drift — and it is argued for in the signer's own docblock.

**The consequence is not stated anywhere.** A `(timestamp, body, signature)` triple this service
*produces* on an outbound callback is a valid triple for an *inbound* request under the same secret,
inside the 300-second window. **No byte distinguishes the direction.**

- [ ] open
      **What limits it today is an accident, not a guard.** The signature binds that exact body, and
      a callback's body is a run-response JSON: no route accepts it — the run-creating POST's
      validator refuses it, and a GET carries no body so its raw body reads as unsigned. So the
      protection is that the body happens not to parse as a request, which is not a property anybody
      chose and not one a later route is obliged to preserve.

      **It becomes material together with [[Q120]]**: a third party that receives a redirected
      callback holds a validly signed credential of that client's.

      **The fix is a contract change and belongs to `#run-contract`**, not here: a direction constant
      inside the signed payload, or a header of its own. Recorded rather than taken, because
      changing what is signed changes what every existing client must compute.

## Q120 — the registered prefix is the only thing bounding where a callback goes

- category: undefined-detail
- blocking: no
- raised by: checkpoint 8, round 1, of `#run-delivery`

§12 says a callback is refused "unless its URL starts with" the client's registered prefix, and
**that is the whole of what the spec asks.** Three consequences follow, none of which the spec
addresses:

- **`http:` is allowed unconditionally.** Nothing forces a production deployment to register only
  `https:` prefixes, so a plaintext prefix would push a run's result — which §7 classes as personal
  data at its highest level — over the wire in the clear, with nothing objecting.
- **No private, loopback or link-local address is refused.** A prefix naming `127.0.0.1`, a
  link-local metadata address or an internal host is perfectly valid to this check.
- **A prefix with no trailing separator matches a sibling host.** A registered
  `https://client.example` (written without the trailing slash, which is natural) matches
  `https://client.example.attacker.invalid/`. Narrowed in practice because a path-less prefix is
  normalized to carry a trailing slash; a prefix with a partial path is the exposed shape.

- [ ] open
      **The URL checks that *are* there were tested hard and hold**: credentials before the host, a
      scheme downgrade in the original URL, a path that normalizes out of the prefix, punycode, case,
      default ports, and an empty or unparseable prefix refusing everything. Those are not in
      question.

      **What is in question is the spec's silence about the destination itself.** An allow-list of
      prefixes is an allow-list of *strings*; it says nothing about what the string resolves to.
      Deciding otherwise — refusing plaintext in live, refusing private address space, requiring a
      prefix to end at a path separator — is policy this service would be inventing.

      Worth settling in §12 before a deployment discovers it. Related to [[Q119]] and to the redirect
      defect that made this audit round find it.


## Q121 — video and audio must end differently, and the built check cannot tell them apart

- category: contradiction
- blocking: no
- raised by: checkpoint 1 of `#asset-media-extraction`

§20 asks for two different endings for the two kinds this version does not handle:

- *"a video URL among the media is **refused** with the unsupported reason code, rather than being
  silently skipped"*
- *"**audio** among the media is **ignored**"*

`#media-fetch` built the distinction as `is_active` on `ai_run_media_categories`, and
`AiRunMediaCategoryInspector` reads that flag. **It is `false` for both video and audio**, so the
check answers the same for each — verified by reading the inspector and the master seeder.

**Refused, ignored and handled are three outcomes. A boolean carries two.**

- [ ] open
      The flag was the right shape for the question `#media-fetch` was asked ([[Q94]]): §18 says the
      two unhandled kinds exist "so a request naming one is refused by name rather than ignored",
      which reads as one behaviour for both. §20 then asks for two.

      **The two sections disagree, and §18 is the one already built.** §18's wording even contains
      the word §20 uses for audio — "rather than ignored" — so the collision is not a subtlety.

      **What closing it looks like:** the master gains a column naming what this version does with a
      kind (handle / refuse / ignore) and the inspector reads that instead of a boolean, which keeps
      the property [[Q94]] was for — a fourth kind is a row, not a code change. The alternative is
      §20 dropping one of its two criteria.

- [x] settled at checkpoint 3 of `#asset-media-extraction`
      `is_active` is **replaced**, not joined: `ai_run_media_categories` carries `handling_name`,
      one of three words held in `AI_RUN_MEDIA_HANDLING` — `handle`, `refuse`, `ignore`. Image
      handles, video refuses, audio ignores.

      **Why the endings are a constant vocabulary and not a fourth master table**, which is the part
      worth keeping: a fourth *kind* is a row because the service already knows all three things it
      might do with one, while a fourth *handling* is a branch of behaviour that does not exist until
      code implements it — seeding one would promise an ending nothing could carry out. So kinds stay
      data and endings stay code, and [[Q94]]'s property is intact.

      **Why replaced rather than kept alongside:** two columns able to disagree — a kind marked
      inactive and handled — cost a reader more than the missing third state did, and would need a
      rule about which wins. This master is also the one whose `is_active` never carried the
      column's usual meaning: every kind seeded here is one a caller may legitimately name, video
      and audio included, since being namable is the whole reason their rows exist.

      **The costs, named rather than discovered later:** this master is now the only one without
      `is_active`, diverging from its siblings' standard column set; a kind can no longer be
      withdrawn by a flag, and removing the row instead gives a caller "unrecognized value" rather
      than "a kind we know and do not handle"; and the migration's `down` restores the column
      without its per-row values, because the seeder supplied them.

      **What is still open is §18's own sentence.** It reads "refused by name rather than ignored",
      which describes one behaviour for both kinds and is now narrower than what the schema does.
      Nothing in code depends on it. Whether it is amended is `/hora-spec`'s.

- [ ] open — §18's wording

      **Where it bites:** `#asset-media-extraction`'s step 2 has to act on the difference, and the
      only thing it can ask today answers one word for both. This needs deciding before that step is
      written, not after.

## Q122 — rate limiting is asked for once, in one criterion, and nothing anywhere implements it

- category: undefined-detail
- blocking: no
- raised by: checkpoint 1 of `#asset-media-extraction`

§20's last criterion: *"a client that has exceeded its rate limit is refused, and no run is created
and no model is called."* Searching the whole of `specs/1.0.0/spec.md` for "rate limit" returns
**that line and nothing else**.

`express-rate-limit` is a dependency in `package.json` and **no limiter is wired anywhere** — a grep
over `server/` and `app/` finds no call site. A previous audit round noted the same absence from the
other direction.

- [ ] open
      **So this feature owns a criterion whose subject does not exist yet**, and the spec gives it
      nothing to build against: no window, no count, no per-client or per-route scope, no answer for
      what a refused caller is told, and no statement of whether the limit belongs to this route or
      to every run-creating route.

      **The criterion is specific about one thing and it is the part that matters**: the refusal
      happens *before* a run is created and *before* a model is called. That rules out limiting
      inside the job and places it at the request, which is where the dependency already sits unused.

      **Worth settling before checkpoint 5**, because "the client's rate limit" implies a figure
      stored per client — and `api_clients` carries no such column, so either the limit is one
      figure for everyone, or this is also a schema change.


## Q123 — three shapes the request and the result never declare

- category: undefined-detail
- blocking: no
- raised by: checkpoint 3 of `#asset-media-extraction`

§20 and `.hora/contracts/1.0.0/client-api.md` leave three shapes unstated, and all three reach a
client:

- **`asset.province`** — declared as "the category slugs and the province". Nothing says whether a
  province is a name, a code or a slug. Typed `string`.
- **A field result's `value`** — typed `string | number`, because a number field answers a number
  and a text or select field answers a string. Nothing states it; step 4 bounds it either way.
- **`suggestionConfidence`'s range** — 0–1 or 0–100. Nothing says.

- [ ] open
      **The province is the one that bites silently.** A client integrating against the wrong reading
      sends something this service accepts and neither side notices until the values come back wrong.
      Checkpoint 4's stub has to pick one, and whatever it picks becomes what a client builds against
      before checkpoint 6 exists.

      **The confidence range matters at checkpoint 5**, where the formula is written and versioned
      ([[Q92]] already records that the version is per settled field). A formula versioned against one
      range and read against the other is a defect that survives a version bump.

## Q124 — the accepted response is declared as five statuses, and the contract says one

- category: contradiction
- blocking: no
- raised by: checkpoint 3 of `#asset-media-extraction`

`.hora/contracts/1.0.0/client-api.md` describes `AiRunAcceptedResponse`'s `statusName` as
"(always `queued`)" in its shape section, and four sections later says a repeated request answers
`202` "carrying that run's status as it now stands". **Those cannot both be true**, and the built
`BaseAiRunPostRenderer#buildRepeatedRunResponse()` passes `aiRun.AiRunStatus.name` — whatever it is.

- [ ] open
      The type follows the shipped code and the repeat row: the five-status union. Declaring
      `'queued'` alone would be a lie about code that already runs.

      **If the contract is to be tightened, the shape section is the line to reword, not the code** —
      a client that repeats an idempotency key after its run has finished gets a real status, and
      that is the useful behaviour.


## Q125 — the fetch budget is a paragraph, and the caller that must read it does not exist

- category: design
- blocking: no
- raised by: checkpoint 8, round 6, of `#media-fetch`

`DEFAULT_REQUEST_TIMEOUT_MILLISECONDS` is 30000 and the run's limit is 300000, with a cap of twelve
media. **12 × 30000 = 360000.** Twelve slow-but-not-stalled fetches overrun the whole run budget by
sixty seconds, before the upload and three readings.

The constant was justified by arithmetic that did not work, and the justification is now correct: the
bound buys **a named failure in place of an unnamed one** — a stalled host becomes
`MEDIA_FETCH_FAILED` against a nameable medium rather than an unnamed `TIME_LIMIT_EXCEEDED` — and it
explicitly does **not** bound the run.

- [ ] open
      **Two alternatives were weighed and both refused**, which is why this is a question rather than
      a fix. Tightening the bound to fit twelve inside the budget needs 20 s or less, which demands
      512 KB/s and would refuse an honest slow transfer of a file this service accepts — arriving as
      `MEDIA_FETCH_FAILED` with nothing naming the speed. Mandating concurrency would assemble up to
      twelve 10 MB bodies at once, which is the exhaustion the same class's comment argues against
      two paragraphs earlier, reached from the other side.

      **What is handed forward is weaker than the rest of that checkpoint**: nothing asserts the
      overrun and nothing makes a caller ration. The caller is `#asset-media-extraction`'s step 2,
      and it can still fetch twelve sequentially and produce exactly the unnamed
      `TIME_LIMIT_EXCEEDED` this finding is about, with nothing red to say so.

      **So it is written here rather than left in the file.** Whoever builds that step needs it as an
      input, not as a comment they may or may not open. The spec is silent on whether a run's media
      are fetched sequentially or concurrently, and that silence is what the caller has to resolve.

## Q126 — two classes now duplicate a redirect-following tool three times over

- category: design
- blocking: no
- raised by: checkpoint 8, round 6, of `#media-fetch`

`MediaFetchClient` and `AiRunCallbackSender` now hold the same thing three times: the
`redirect: 'manual'` hand-written hop walk, the response-body disposal, and the blank-`location`
guard. Each duplication was the right call in its round — the second and third exist **because** a
lesson had failed to travel between the two files, twice, in both directions.

- [ ] open
      **The duplication is not the defect; it is the symptom.** Twice now a fix landed in one class
      and the identical defect sat in the other until an audit found it. A shared tool would make the
      lesson travel by construction.

      **What makes it non-trivial:** the two ask different per-hop questions — one a host allow-list,
      one a client's registered URL prefix — so a shared walk has to be parameterized on the only
      interesting part, and the two classes' failure vocabularies differ.

      **Worth deciding at a later checkpoint, not retrofitted now.** Both are under audit closure and
      both are correct; a refactor of two audited classes buys structure at the price of re-opening
      what six and three rounds established.


## Q127 — two counts inside one object had four spellings, and one route answered both

- category: contradiction
- blocking: no
- raised by: checkpoint 4 of `#asset-media-extraction`

`agreement` carries how many readings agreed out of how many. It was spelled four ways:

| where | spelling |
| :-- | :-- |
| `types/restfulapi/assetMediaExtractionResult.d.ts` (checkpoint 3) | `agreedCount` / `readingCount` |
| `ai_run_field_outcomes`, the columns | `agreed_reading_count` / `total_reading_count` |
| the development seeder's specimen result body | `agreedReadingCount` / `totalReadingCount` |
| `#run-delivery`'s GET stub, before it was replaced | the seeder's |

**The contract fixes no key names at all**, so this was a repository inconsistency rather than drift.

- [x] settled in the main session at checkpoint 4
      **The consequence was live, not theoretical**: `GET /v1/ai-runs/:runKey` would have answered
      `agreedReadingCount` for the seeded run and `agreedCount` for any run the stub created — **from
      the same route**, with the difference visible only to a client that happened to read both.

      **The columns won**, being what the real renderer will read from and the one spelling three of
      the four already agreed on. The type was corrected, and the stub, and both of its test files.

      **Worth naming why it was found here.** Three checkpoints had written against one spelling or
      the other without either noticing; the stub found it because it was the first thing to answer a
      result body on the same route as the fixtures. That is what a stub is for, and it is a better
      argument for the stub going as far as it did than any principle.

      **Still open in the contract**: it names the field and not its keys. Worth a line there, since
      a client generates from it.

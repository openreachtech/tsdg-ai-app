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
      checkpoint 8 audits ran that way.

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

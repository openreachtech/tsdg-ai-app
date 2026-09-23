# hor-execution-placement-pattern
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-execution-placement-pattern/ -->

**Read the source above whenever this leaves a question open.**

Decide **where processing lives** the moment you receive a requirement — before any implementation detail. Once placement is decided, hand off to the individual implementation skills (`hor-renchan-job-bullmq`, `hor-external-api-client`).

## Grand principle: write processing lives in only two places — "API" or "Worker"

**Processing that changes state (writes)** only ever happens in one of two places. Every requirement must resolve into this binary choice. The deciding axis is **how heavy / how long-running the processing is**.

| Placement | Execution model | What it holds |
| --- | --- | --- |
| **API** | Responds **synchronously** to the request | Things that are **light and finish quickly** |
| **Worker** | Runs **asynchronously** in the background | Things that are **heavy and take time** |

- **Why only two places**: a write can only originate from "an external request (API)" or "processing the system drives on its own (Worker)". Creating a third place scatters responsibility, monitoring, and retry paths so they can no longer be traced.
- **Why split by weight**: a request must return quickly. If you run heavy processing inside the API, the response never comes back and it times out; if it is cut off midway, it cannot recover. Push it to a Worker and the API can respond immediately, while retries, progress notifications, and scaling work independently.
- **When the boundary is unclear, lean toward Worker.** If "probably fast" processing turns out slow at production data volumes, an API implementation becomes a timeout incident. A Worker does not break when it gets slow. **As a rule of thumb, anything involving external I/O, AI calls, large record counts, or file generation counts as the heavy side.**

> Read-only (non-state-changing) processing is not the main subject of this skill. As a rule it just returns synchronously via the API (GraphQL query / REST GET) and is not turned into a Worker.

## Decision flow

1. **Is it a write?** If read-only, return it via an API query / GET and you're done.
2. **Is it light & short-lived?** → **API**.
3. **Is it heavy / time-consuming / uncertain due to external dependencies?** → **Worker**.
4. **What triggers the Worker?**
   - User actions, external integrations, etc. — **request-based** → enqueue from inside the API handler.
   - A side effect unrelated to the main processing, run **after the response** → dispatch from a **post-worker**.
   - Automatic, by time / interval → **schedule-based**.

| Nature of the processing | Placement | Concretely |
| --- | --- | --- |
| Light, short-lived, needs a synchronous response | **API** | GraphQL resolver / REST renderer |
| Heavy, time-consuming, **request-based** | **Worker (API-triggered)** | renchan-job-bullmq (enqueue from resolver/renderer) |
| A **side effect** unrelated to main processing, run **after the response** | **Worker (post-worker-triggered)** | post-worker only dispatches (e.g. sending an email after signup) |
| Heavy, **automatic by interval/time** | **Worker (scheduled)** | renchan-job-bullmq (cron / interval scheduler) |

## 1. Put it in the API (light, short-lived)

Rule of thumb for what goes here: **simple CRUD against the DB, input validation, and short aggregations/updates that complete within a single request.** Why the API: for short processing where the user waits for the result immediately, responding synchronously is the shortest path. Turning it into a job instead introduces the complexity of enqueue → progress notification → polling/subscription, which isn't worth it.

Choose the API family **based on the caller in the requirement**:

| Family | Location | Use for |
| --- | --- | --- |
| **GraphQL** | `server/graphql/resolvers/<role>/actual/{mutations,queries}/` | ordinary reads/writes from your own frontend — the default |
| **REST API (renderer)** | `server/restfulapi/renderers/v1/{post,get}/*Renderer.js` | file uploads, endpoints hit by external systems, non-GraphQL clients |

```js
// Good: a short DB update is handled synchronously inside the resolver and returned immediately
const updated = await context.share.transaction(async tx => this.updateProfile({ input, tx }))
return { profile: updated }

// Avoid: running even heavy processing synchronously inside the resolver → the response never returns and times out
const content = await generateContentWithAi({ accessToken }) // takes tens of seconds
return { content }
```

## 2. Put it in a Worker (heavy, time-consuming)

Workers are implemented with `@openreachtech/renchan-job-bullmq`; Manifest / Worker / Dispatcher under `app/jobs/<kebab-name>/` (how to write them: `hor-renchan-job-bullmq` skill). They split into three kinds by trigger. **In all three, the shape is the same: "the real work is in the Worker, the trigger is elsewhere" — don't put logic beyond dispatch in the trigger.**

### 2.1 Request-based — enqueue from inside the API handler

Triggered by a user action or external integration, the API (resolver / renderer) **only enqueues and responds immediately**, while the real work is handled by a Worker in the Daemon. Progress is returned via a subscription or similar. **The API side sticks to "just enqueuing"** (no real work) — the Worker side handles retry / progress notification / concurrency control.

Examples in the source repo: heavy AI content generation (`app/jobs/content-generation-internal`, `app/jobs/content-generation-public-lp`), report email sending (`app/jobs/send-report-email`) — enqueued with `dispatchJob` from a resolver/renderer.

```js
// Good: heavy processing is enqueued and the response returns immediately (the real work is in the Worker)
await context.share.jobDispatcherProvider.dispatchJob({
  DispatcherCtor: ContentGenerationPublicLpJobDispatcher,
  body: {
    accessToken,
  },
})
return { accepted: true }
```

### 2.2 post-worker — side effects after the response

renchan's **post-worker** (`BaseGraphqlPostWorker`) is the mechanism for **running side effects unrelated to the API's main processing, after the response**. It fires as an `onResolved` hook **per GraphQL operation**, running after the main resolver has returned.

**A post-worker holds only the dispatch to the Worker. Don't put complex logic here** (the real work always belongs on the Worker side). Why dispatch only: a post-worker is a thin hook that runs after the response. Heavy processing or complex logic written here accumulates in a place where **neither retry, progress notification, nor monitoring apply**, and failures get swallowed.

**Choosing between 2.1 and 2.2** — the decisive test:

| Case | Placement |
| --- | --- |
| **The user is requesting** that processing — waits for the result, or it's part of the response | enqueue inside the handler (2.1) |
| A **side effect unrelated to the main processing**, run afterward without making the response wait | post-worker (2.2) |

Example: dispatch **sending a welcome email after signup** from a post-worker (the signup response isn't kept waiting; the email send is streamed to a Worker afterward).

Current state of the source repo: the server engine has `postWorkersPath: null` (**not wired**). To use it, set the engine's `postWorkersPath` and place a post-worker that extends `BaseGraphqlPostWorker`.

```js
// Good: a post-worker only dispatches (the real work of the side effect is on the Worker side)
/** @override */
async onResolved ({ variables, context, response: { output, error } }) {
  if (error) {
    return
  }

  await context.share.jobDispatcherProvider.dispatchJob({
    DispatcherCtor: SendWelcomeEmailJobDispatcher,
    body: {
      customerId: output.customer.id,
    },
  })
}

// Avoid: writing email-body assembly or sending logic directly in the post-worker
//   → real work accumulates in a post-response place where failures get swallowed, and neither retry nor monitoring apply.
```

### 2.3 Schedule-based

Processing that starts **automatically by time / interval** rather than from a user: periodic batches, cleanups, reminders, re-aggregations and the like, which need to run even without an external request. They don't ride the API path, so start them from a cron / interval scheduler (`*CronJobScheduler.js` / `*IntervalJobScheduler.js`, `hor-renchan-job-bullmq` skill). Example in the source repo: `app/jobs/purge-expired-content-sessions`.

```js
// Avoid: substituting a periodic cleanup with "an admin presses a button and the resolver runs a long loop"
//   → forgotten presses, double execution, and timeouts occur. Put periodic processing in a scheduler.
```

## 3. Placement of external integrations

Integrations with external systems must also ride on one of the two places above (API / Worker). **Decide the two axes separately: the receiving method follows the other party's spec, and the placement (API or Worker) follows this skill's weight criterion.**

| Direction | Convention |
| --- | --- |
| **inbound** (receiving calls from outside) | **often a REST API (renderer)**, but **not necessarily** — it can be received via GraphQL. Choose the receiving method based on the other system's constraints. If the processing after receiving is heavy, the renderer sticks to enqueuing and hands the real work to a Worker (2.1). Example: `server/restfulapi/renderers/v1/post/IntegrationReportPostRenderer.js` |
| **outbound** (calling an external API) | call it via the rocket-client Launcher (`hor-external-api-client` skill). External calls are slow and uncertain, so call them from a Worker if they would block the user's response |

Why "not necessarily REST": the integration method (REST / GraphQL / Webhook, etc.) is usually decided by the other system and won't always match our default (REST renderer).

## Finishing checklist

- [ ] Is this processing a **write**? (If a read, return it via query/GET and you're done.)
- [ ] Did you resolve it into the binary of **light → API / heavy → Worker**, leaning toward Worker when unsure?
- [ ] If placing it in the API, did you choose **GraphQL resolver** or **REST renderer** based on the caller?
- [ ] If placing it in a Worker, did you choose one of **request-based (enqueue)** / **post-worker** / **schedule-based** by trigger?
- [ ] For the request-based case, does **the API side only enqueue** (no real work written in the resolver/renderer)?
- [ ] If running a side effect unrelated to main processing after the response, did you write **only a dispatch in the post-worker** and keep the real work in the Worker?
- [ ] For external integrations, did you decide the **receiving method (other party's constraints)** and the **placement (weight criterion)** separately?

## What this skill does not state

Recorded so an absence is not read as a rule:

- **Transactions and commit ordering.** The skill never says when a dispatch may happen relative to a commit, nor whether a job may be enqueued inside a transaction. Its only transaction mention is the incidental `context.share.transaction(async tx => …)` in the section-1 example. Nothing here settles a dispatch-after-commit question.
- **post-worker on a REST surface.** The post-worker story is stated **only** for GraphQL: `BaseGraphqlPostWorker`, an `onResolved` hook "per GraphQL operation", and `postWorkersPath` on the GraphQL server engine. The skill gives no post-worker equivalent for a `server/restfulapi/renderers/**` renderer.

full text: `.claude/skills/hor-execution-placement-pattern/SKILL.md`

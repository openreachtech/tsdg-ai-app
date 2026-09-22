# Reference code

Interpretation only. **Nothing here is a requirement.** The build plan
(`../tsdg-ai-backend-build-plan-v0.4.html`) says two layers of
`tsdg-ai-backend` are ported from existing services and names a third as the
REST reference. These are extracts of those services, at the exact commits the
plan was checked against, so a stage designs against what the code does rather
than against a paraphrase of it.

**Copied, never linked.** The originals live outside this repository, so a link
would resolve on one machine and break on every other clone.

**Partial by intent.** Only the parts the plan names are here. Anything else
about these services is not evidence for anything.

| Directory | Repository | Commit | Why the plan names it |
|---|---|---|---|
| `leepai/` | `openreachtech/leepai-crm-demo-backend-alpha` | `4371ba0` (2026-09-15) | the multi-provider layer, and the `recordFieldValues` pattern |
| `rgp-yazaki/` | `openreachtech/rgp-yazaki-finance-ai-backend` | `8e94479` (2026-09-09) | the document-reading layer, consensus, the stub driver, the provider-upload record |
| `linoa/` | `openreachtech/linoa-ai-concierge-backend` | `987e663` (2026-01-29) | the REST renderer, as the reference for a v1 REST surface |

## What each extract holds

### `leepai/` — the multi-provider layer

| Path | What it is |
|---|---|
| `app/tools/BaseAiModelProcessor.js` | the base the plan names as the top of the provider chain |
| `app/tools/BaseAiModelProviderProcessor/` | one base per provider — Claude, Gemini, OpenAI |
| `app/tools/AiModelProcessor/` | one processor per model, ~20 of them |
| `app/tools/BulkAiModelProcessorsLoader.js`, `AiModelResponse.js` | how processors are discovered, and the response shape |
| `app/claudeClient/`, `app/geminiClient/` | the outbound clients — Payload / Fetcher / Capsule / Launcher per call |
| `app/aiTools/` | tool processors and their bulk loader |
| `app/agents/recordFieldValues/` | the agent loop the plan names as the pattern for a service |
| `sequelize/models/AiAgent*.js` | prompts, models and tool assignments held as DB data, several with a `*Bk` history table (ADR-06) |

### `rgp-yazaki/` — document reading, consensus, stub, egress

| Path | What it is |
|---|---|
| `app/tools/AiModelProcessor/Stub*.js`, `app/constants/stub*.js` | the stub driver that is the default in every environment, and its fixture data |
| `app/verification/` | consensus reduction, agreement verification, the parsers and the match strategies |
| `app/analysis/` | the per-file analysis processors, the extraction writer, the agreement writer, the progress publisher |
| `app/jobs/analyze-batch-file/` | Dispatcher / Manifest / Worker — the job shape |
| `app/jobs/purge-expired-provider-uploads/` | a scheduled purge, which is the retention pattern the plan splits in two |
| `app/geminiClient/`, `app/storage/`, `app/upload/`, `app/queue/` | the outbound client, file handling and the queue |
| `sequelize/models/GeminiUploadedFile.js` | the record of a file handed to a provider |
| `sequelize/models/ReadingFieldAgreement.js` | per-field agreement across readings |

### `linoa/` — the REST surface

| Path | What it is |
|---|---|
| `server/restfulapi/AppRestfulApiServerEngine.js` | the engine |
| `server/restfulapi/renderers/v1/` | GET and POST renderers, including an external-callback renderer |
| `server/restfulapi/contexts/` | the request context and its share |

The plan records this service as carrying no AI code — it is cited for the REST
renderer and the header authentication shape only.

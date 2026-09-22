# Glossary

Append-only, and not split per version. It exists so that one concept does not acquire two
names. A contract pins the type names on an API's surface; this pins the rest.

**Every identifier below was checked against `@openreachtech/eslint-config`'s `id-denylist`,
read from the package itself** under the backend row's `node_modules/`.

| Term | Identifier | Kind | Used in | Notes |
|---|---|---|---|---|
| run | `AiRun` | entity | backend | table `ai_runs` |
| run key | `runKey` | field | backend, the contract | the identifier the caller holds. Never the row's own `id` |
| client system | `ApiClient` | entity | backend | table `api_clients` |
| idempotency key | `requestKey` | field | backend | the column. The header it arrives in is `Idempotency-Key` |
| run status | `AiRunStatus` | master entity | backend | table `ai_run_statuses` |
| run category | `AiRunCategory` | master entity | backend | table `ai_run_categories`. One row per AI service |
| step | `AiRunStep` | entity | backend | table `ai_run_steps`. The decision trace |
| step category | `AiRunStepCategory` | master entity | backend | table `ai_run_step_categories`. Code, ai, human |
| field outcome | `AiRunFieldOutcome` | entity | backend | table `ai_run_field_outcomes`. How a settled field was scored, holding no value |
| field state | `AiRunFieldStatus` | master entity | backend | table `ai_run_field_statuses` |
| evidence kind | `AiRunEvidenceCategory` | master entity | backend | table `ai_run_evidence_categories` |
| model call | `AiModelCall` | entity | backend | table `ai_model_calls` |
| callback delivery | `AiRunCallbackDelivery` | entity | backend | table `ai_run_callback_deliveries` |
| callback kind | `AiRunCallbackDeliveryCategory` | master entity | backend | one row this version, for the terminal callback |
| medium | `AiRunMedia` | entity | backend | table `ai_run_media`. Holds no file bytes |
| media kind | `AiRunMediaCategory` | master entity | backend | table `ai_run_media_categories`. Image, video, audio |
| egress record | `ProviderUploadedFile` | entity | backend | table `provider_uploaded_files`. What left the machine, to whom, when |
| provider | `AiProvider` | entity | backend | table `ai_providers` |
| model | `AiModel` | entity | backend | table `ai_models`. Its vendor id is `targetModelName` |
| agent | `AiAgent` | entity | backend | one per AI service |
| tool schema | `AiTool` | entity | backend | `payload` holds the stringified JSON schema |
| media allow-list | `MediaFetchClient` | class | backend | the hosts come from `MEDIA_FETCH_ALLOWED_HOSTS` |
| suggestible field | `SuggestibleFieldSelector` | class | backend | step 1 of the asset-media-extraction run |
| absolute majority | `FieldConsensusResolver` | class | backend | step 5. Ported from the reference extract |
| confidence | `suggestionConfidence` | field | backend, the contract | **never `confidence`** — see below |
| confidence scorer | `AssetFieldConfidenceScorer` | class | backend | step 6. Computes from agreement and evidence kind |
| media signature | `mediaSignature` | field | backend, the contract | makes the stub deterministic for one input |
| reason code | `reasonCode` | field | backend, the contract | a code plus `parameters`. Never display wording |
| content | `requestBody` / `resultBody` / `responseBody` | fields | backend | the short retention clock |
| decision trace | — | concept | backend | the step, field-outcome and model-call rows. The long clock |

## Names avoided, and why

| The naive name | Why it fails | What was used |
|---|---|---|
| `runList`, `mediaList` | `list` is on the `id-denylist`, and an array is named by the plural of its element | `runs`, `media` |
| `runInfo`, `mediaInfo` | `info` is on the denylist, and adds nothing `run` does not already say | `AiRun`, `AiRunMedia` |
| `stepData`, `resultData` | `data` is on the denylist and explains nothing to a reader | `AiRunStep`, `resultBody` |
| `fieldItem` | `item` is on the denylist; the element of `fields` needs no word for being one | the element of `fields` |
| `AiRunKind`, `ai_run_kinds` | the database convention names a classification set `*_categories` and a status set `*_statuses`, and `kinds` is neither. The annex used it throughout | `AiRunCategory`, `ai_run_categories` |
| `AiRunType`, `mediaType` | `type` is forbidden as a suffix — it collides with the JSDoc annotation | `AiRunCategory`, `AiRunMediaCategory` |
| `mimeType` | **kept as it is.** The one sanctioned exception: a word borrowed verbatim from an external standard | `mimeType` |
| `confidence` | the client's interface already carries `confidenceScore`, meaning an organisation match percentage, and the two will appear on one screen | `suggestionConfidence` |
| `key` for a field identifier | the value is a dotted path, not a flat key, and the same word has to read the same on the way in and the way out | `path` |
| `ctx`, `err`, `msg`, `num` | all on the denylist | `context`, `error`, `message`, `count` |

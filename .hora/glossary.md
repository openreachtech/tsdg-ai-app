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
| what a step dropped | `rejections` | field | backend | column on `ai_run_steps`. The field path, the reason code and figures — **never a value read out of a medium**. See below for the name |
| the three evidence kinds | `visible-text`, `visual-estimate`, `category-prior` | master row values | backend | the seeded `name` of each `ai_run_evidence_categories` row, taken from §6's terminology table |
| the step-category constant set | `AI_RUN_STEP_CATEGORY` | constant hash | backend | `constants/aiRunStepCategoryConstants.cjs`. Three rows, ids 1–3. **No ESM bridge yet** — see Q65 |
| the field-state constant set | `AI_RUN_FIELD_STATUS` | constant hash | backend | `constants/aiRunFieldStatusConstants.cjs`. Four rows, ids 1–4. No ESM bridge yet |
| the evidence-kind constant set | `AI_RUN_EVIDENCE_CATEGORY` | constant hash | backend | `constants/aiRunEvidenceCategoryConstants.cjs`. Three rows, ids 1–3. No ESM bridge yet |
| shared model ancestor | `BaseAppRenchanModel` | class | backend | `sequelize/baseModel/`. Every model extends it; none extends the framework's `RenchanModel` directly, so shared behavior has one home |
| the asset-media-extraction service | `asset-media-extraction` | master row value | backend, the contract | the `name` of the one seeded run category. It is what the API returns as `runCategoryName`, and it matches the feature id, the route and the queue |
| the run-status constant set | `AI_RUN_STATUS` | constant hash | backend | `constants/aiRunStatusConstants.cjs`, with an ESM bridge beside it. Five rows, ids 1–5 |
| the run-category constant set | `AI_RUN_CATEGORY` | constant hash | backend | `constants/aiRunCategoryConstants.cjs`, with an ESM bridge beside it |
| request body hash | `requestBodyHash` | field | backend | a hex digest of the raw request bytes, kept so a repeated idempotency key can be told apart from a changed body without keeping the body |
| secret at rest | `ApiClientSecretCipher` | class | backend | `app/apiClient/`. AES-256-GCM. The envelope is `<ivHex>:<authTagHex>:<ciphertextHex>` in one column |
| signature check | `ApiClientSignatureVerifier` | class | backend | `app/apiClient/`. Holds both of a client's secrets, and accepts either while a rotation is under way |
| freshness window | `RequestTimestampWindowInspector` | class | backend | `app/apiClient/`. 300 seconds either way, and the clock is passed in rather than read |
| run key minting | `RunKeyGenerator` | class | backend | `app/aiRun/`. 32 random bytes as hex — see Q9 for why not the catalogued package |
| body digesting | `RequestBodyDigester` | class | backend | `app/aiRun/`. Produces the `requestBodyHash` above, from the raw bytes and never from a re-serialization |
| the active fixture client | `development-client` | seeded value | backend | `api_clients` id `10000001`. The one a local run signs with |
| the rotating fixture client | `rotating-client` | seeded value | backend | id `10000002`. Carries both secrets, so a test can prove a rotation is not an outage |
| the switched-off fixture client | `inactive-client` | seeded value | backend | id `10000003`. Signs correctly and is refused `403`, which is what tells that refusal apart from `401` |

## Names avoided, and why

| The naive name | Why it fails | What was used |
|---|---|---|
| `runList`, `mediaList` | `list` is on the `id-denylist`, and an array is named by the plural of its element | `runs`, `media` |
| `runInfo`, `mediaInfo` | `info` is on the denylist, and adds nothing `run` does not already say | `AiRun`, `AiRunMedia` |
| `stepData`, `resultData` | `data` is on the denylist and explains nothing to a reader | `AiRunStep`, `resultBody` |
| `fieldItem` | `item` is on the denylist; the element of `fields` needs no word for being one | the element of `fields` |
| `rejectedItems`, `rejected_items` | `item` is on the denylist and forbidden as a suffix. **The spec named the column this and was corrected**, so the schema and §10 now agree | `rejections` |
| `visible-evidence` | considered, and not taken: §6's terminology table — where the spec *defines* the term — reads "visible text", and two of the three sources agree on the narrow reading. §10's looser "something visible in the medium" is the outlier. See Q66 | `visible-text` |
| `AiRunKind`, `ai_run_kinds` | the database convention names a classification set `*_categories` and a status set `*_statuses`, and `kinds` is neither. The annex used it throughout | `AiRunCategory`, `ai_run_categories` |
| `AiRunType`, `mediaType` | `type` is forbidden as a suffix — it collides with the JSDoc annotation | `AiRunCategory`, `AiRunMediaCategory` |
| `mimeType` | **kept as it is.** The one sanctioned exception: a word borrowed verbatim from an external standard | `mimeType` |
| `confidence` | the client's interface already carries `confidenceScore`, meaning an organisation match percentage, and the two will appear on one screen | `suggestionConfidence` |
| `key` for a field identifier | the value is a dotted path, not a flat key, and the same word has to read the same on the way in and the way out | `path` |
| `ctx`, `err`, `msg`, `num` | all on the denylist | `context`, `error`, `message`, `count` |
| `cancelled`, `cancelling` | British spelling. The naming convention requires American always, and `no-restricted-syntax` enforces it by name — the most protected rule there is, so no per-file exception can buy it off. The spec, the contract and the code all carried the British form until lint caught it | `canceled`, `canceling` |

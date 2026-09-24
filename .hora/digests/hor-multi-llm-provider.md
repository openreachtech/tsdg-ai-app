# hor-multi-llm-provider
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-multi-llm-provider/ -->

**Read the source above whenever this leaves a question open.**

## Grand principle

Three vendors (Anthropic Claude / OpenAI / Google Gemini) behind **one processor abstraction**, so
callers (agents, resolvers, jobs) **never branch on the provider**. A caller resolves a **model name**
to a processor and calls `processor.sendRequestToAi(...)`.

A three-level strategy: `BaseAiModelProcessor` (the contract) → one **provider base** per vendor
(vendor plumbing) → **one concrete processor per model** whose only distinct member is `#get:aiModel`.
A loader auto-discovers the concrete processors and picks one by model-name string at runtime.

- Adding a model must be **additive (Open–Closed)**: drop one file whose `#get:aiModel` returns the
  new name, and the loader finds it.
- The concrete class holds **no** target model id and **no** token limit — those come from the DB
  `AiModel` / `AiModelCapability` rows.

## Database versus environment — the dividing line

| Lives in | What |
| --- | --- |
| **DB** | provider list, model metadata: `targetModelName` (vendor API model id), `isDefault`, `isActive`, `displayOrder`, `contextWindowToken`, `maxOutputToken`, which tools a model may use, and which model an agent uses by default |
| **env** | **API keys / base URLs only** — `CLAUDE_API_TOKEN`, `CLAUDE_API_BASE_URL` and the analogous OpenAI/Gemini vars, via `@openreachtech/renchan-env` through `app/globals/env.js`. **Never hard-code a key.** |
| **code (constants)** | the app-facing names/ids only: `AI_MODEL.*` / `AI_PROVIDER` in `constants/aiConstants.cjs` (two-file `.cjs` master + ESM bridge — see `hor-constant-definition` skill) |

"A model's real endpoint and limits are **data, not code**." "Which model an agent uses is per-agent
config (`AiAgentDefaultModel → AiModel.name`), overridable per call — never hard-coded. Swapping a
model is a **data change**."

## The tables

| Model (table) | Columns the skill names | What it decides |
| --- | --- | --- |
| `AiProvider` (`ai_providers`) | `name` | the vendor; fixed ids `AI_PROVIDER = { ANTHROPIC {ID:1}, GOOGLE {ID:2}, OPENAI {ID:3} }` |
| `AiModel` (`ai_models`) | `AiProviderId`, `name` (app key), `targetModelName` (vendor id), `isDefault`, `isActive`, `displayOrder` | `name` is what the loader matches (`'sonnet-4-5'`); `targetModelName` is the vendor API model id (e.g. `'claude-sonnet-4-5-20250929'`) |
| `AiModelCapability` (`ai_model_capabilities`) | `contextWindowToken`, `maxOutputToken` | `maxOutputToken` → payload `maxTokens` |
| `AiModelToolAssignment` (`ai_model_tool_assignments`) | — (the skill names no columns) | which tools a model may use (`AiTool` is in the `hor-ai-prompt-document-store` skill) |

A processor reads its own row with
`AiModel.findOne({ where: { name }, include: [AiModelCapability] })` — that is `#findAiModelByName()`.

## Layers and files

```
app/tools/
  BaseAiModelProcessor.js                     abstract contract (get aiModel, sendRequestToAi, ...)
  BaseAiModelProviderProcessor/
    BaseClaudeAIProcessor.js                  Claude function-call loop + Files API upload
    BaseOpenAIProcessor.js                    OpenAI function_call + file upload (with expiry)
    BaseGeminiAIProcessor.js                  Gemini functionCall + file uri upload
  AiModelProcessor/
    ClaudeSonnet4_5AiModelProcessor.js        concrete: get aiModel + sendRequestToAi
    OpenAiGPT_5_AiModelProcessor.js           (~21 concrete model files, one per model)
    Gemini2_5FlashAiModelProcessor.js
    ...
  BulkAiModelProcessorsLoader.js              auto-discovery + getProcessor(aiModel)
  AiPayloadGenerator/
    BaseAiMessagePayloadGenerator.js          shared history trimming / token budget
    ClaudeMessagePayloadGenerator.js          provider payload shaping (tools, toolChoice, files)
    OpenAiMessagePayloadGenerator.js
    GeminiMessagePayloadGenerator.js
  AiModelResponse.js                          normalized response wrapper
app/claudeClient/ | app/geminiClient/ | app/openAiClient/   low-level Launcher/Payload/Capsule/Client
```

## The contract — `BaseAiModelProcessor`

- `#get:aiModel` — **abstract**; the model-name string the loader matches on (e.g. `'sonnet-4-5'`).
- `#sendRequestToAi({ ... })` — **abstract**; non-streaming, returns an `AiModelResponse`.
- `#sendStreamRequestToAi({ ..., onText, onComplete })` — **abstract**; streaming variant.
- `#prepareAttachedFiles({ fileUrls })` — concrete default returns `fileUrls` unchanged; overridden per
  provider to upload files and attach provider file ids/uris.
- `#findAiModelByName({ aiModelName })` — concrete; the DB read above.

The request param bag is **uniform across providers**:

```js
async sendRequestToAi ({
  aiAgent,
  instruction,
  documents,
  fileUrls,
  historyMessages = [],
  tools = [],
  toolChoices = [],
  isAutoHandleFunctionCall = true,
  extraToolOptions = {},
  shouldPrefetchDynamicDocumentsForBackground = false,
}) {
  // ...
}
```

## A concrete model processor — only `#get:aiModel` is unique

Everything else (build the instruction, prepare files, build the payload, send, handle one round of
function calls, wrap the response) is the standard flow from the provider base.

```js
import BaseClaudeAIProcessor from '../BaseAiModelProviderProcessor/BaseClaudeAIProcessor.js'
import AiModelResponse from '../AiModelResponse.js'

import CONSTANT_HASH from '../../../constants/aiConstants.cjs'

const {
  AI_MODEL,
} = CONSTANT_HASH

export default class ClaudeSonnet4_5AiModelProcessor extends BaseClaudeAIProcessor {
  static create () {
    return new this()
  }

  get aiModel () {
    return AI_MODEL.CLAUDE_SONNET_4_5.NAME
  }

  async sendRequestToAi ({ /* the uniform param bag above */ }) {
    const aiModel = await this.findAiModelByName({
      aiModelName: this.aiModel,
    })

    const documentInstructionComposer = await this.createDocumentInstructionComposer({
      // ...splits documents, wires the agent's default instruction (`hor-ai-prompt-document-store` skill)
    })

    const preparedFileUrls = await this.prepareAttachedFiles({
      fileUrls,
    })

    const payloadGenerator = this.createClaudeMessagePayloadGenerator({
      aiAgent,
      aiModel,
      message: documentInstructionComposer.generateComposedInstruction(),
      fileUrls: preparedFileUrls,
      historyMessages,
      tools,
      toolChoices,
    })

    const payload = payloadGenerator.generateClaudeMessagePayload()
    const fetcher = this.createSendMessageToClaudeFetcher()
    const capsule = await fetcher.launchRequest(payload)

    // three early returns, each the same body, in this order:
    //   capsule.hasError() / !capsule.hasFunctionCallEvent() / !isAutoHandleFunctionCall
    if (capsule.hasError()) {
      return AiModelResponse.create({
        aiResponseCapsule: capsule,
      })
    }

    const followUpPayload = await this.handleFunctionCalls({
      payloadParams: payload.params,
      aiResponses: capsule.extractContent(),
      extraToolOptions,
    })

    const followUpCapsule = await fetcher.launchRequest(followUpPayload)

    return AiModelResponse.create({
      aiResponseCapsule: followUpCapsule,
    })
  }
}
```

- `#get:aiModel` returns the **app-facing** name (`AI_MODEL.*.NAME`); `targetModelName` and
  `maxOutputToken` come from the **DB row**, not the class.
- `isAutoHandleFunctionCall: false` short-circuits after the first response and returns the raw
  function call — what the forced-single-tool actions in `hor-ai-agent-structure` rely on.
- The flow handles **one** round of function calls (one follow-up request), not an open-ended tool loop.

## Runtime selection — `BulkAiModelProcessorsLoader`

Auto-discovers every class under `app/tools/AiModelProcessor/` with renchan's `DeepBulkClassLoader`,
instantiates each via `.create()`, and matches `#get:aiModel`:

```js
import {
  DeepBulkClassLoader,
} from '@openreachtech/renchan'

static async loadProcessorClasses (path) {
  return DeepBulkClassLoader.create({
    poolPath: path,
  })
    .loadClasses()
}

getProcessor (aiModel) {
  return this.processors.find(processor => processor.aiModel === aiModel)
}
```

The **name** passed to `#getProcessor()` comes from the DB — explicit id wins, else the agent's default:

```js
// explicit id wins, else the agent's default model
const targetAiModelId = aiModelId
  ?? aiAgentDefaultModel?.AiModelId
  ?? null

const aiModel = await AiModel.findByPk(targetAiModelId)
const processor = this.bulkAiModelProcessorsLoader.getProcessor(aiModel.name)
```

or directly via `aiAgent.AiAgentDefaultModel.AiModel.name → getProcessor(...)`.

> Do not confuse this with `BulkAiToolProcessorsLoader`: the provider bases use a *tool*-processor
> loader (`getProcessor(toolName)`) to run function calls — a different loader over `app/aiTools/`.

## Adding a model or a provider

| Case | Steps |
| --- | --- |
| **New model, existing provider** | one file under `app/tools/AiModelProcessor/` extending that provider base, `#get:aiModel` returning the new `AI_MODEL.*.NAME`; `AiModel` + `AiModelCapability` rows (and `AiModelToolAssignment` rows) via a **seeder**; the `AI_MODEL` entry in `constants/aiConstants.cjs`. **No caller changes** — the loader finds it. |
| **New provider** | a provider base under `app/tools/BaseAiModelProviderProcessor/` implementing function-call handling + `#prepareAttachedFiles()`; a payload generator under `AiPayloadGenerator/`; a capsule exposing the standard method surface; the low-level Launcher/Payload/Capsule/Client under `app/<provider>Client/`; an `AI_PROVIDER` entry. Then per-model processors as above. |

## Normalization — what makes a response read the same whichever vendor answered

`AiModelResponse.create({ aiResponseCapsule })` is a **thin uniform wrapper**: each method guards that
the capsule implements it, then delegates — `extractFunctionCalls()`, `extractContentText()`,
`extractErrorMessage()`, `hasError()`.

The real logic is in the provider **capsule** (e.g. `SendMessageToClaudeCapsule extends BaseCapsule`
from `@openreachtech/renchan-tools-external-api`), and every vendor implements the **same surface**:
`#hasError()`, `#extractContent()`, `#hasFunctionCallEvent()`, `#extractFunctionCalls()` (→
`{ name, arguments }`), `#extractContentText()`, plus model / role / stop-reason / **token-usage**
extractors. "**This shared surface is what makes the whole abstraction provider-agnostic.**" Callers
read those methods the same way regardless of vendor, without knowing which one answered.

## Per-vendor mechanics (compressed — read the source before implementing a provider base)

The one real per-vendor difference is the function-call round-trip. Same shape everywhere: filter the
response for tool calls, run each via
`BulkAiToolProcessorsLoader.getProcessor(toolName).process({ ...input, extraToolOptions })`, push the
results back into the payload, re-request.

| Vendor | Function-call event | Tool result fed back as | Payload channel | Arguments |
| --- | --- | --- | --- | --- |
| Claude | `response.type === 'tool_use'` | `{ type: 'tool_result', tool_use_id, content }` (role `user`) | `payloadParams.messages` | `response.input` (object) |
| OpenAI | `response.type === 'function_call'` | original call + `{ type: 'function_call_output', call_id, output }` | `payloadParams.input` | `JSON.parse(response.arguments)` |
| Gemini | `functionCall` part | `{ role: 'model', parts: [{ functionCall }] }` + `{ role: 'user', parts: [{ functionResponse: { name, response: { result } } }] }` | `payloadParams.contents` | `response.arguments` (already an object) |

`#handleStreamingFunctionCalls()` is the streaming counterpart — same follow-up payload, forwarding
`{ onText, onComplete }` (Claude/Gemini) or `{ onText, onComplete, onError }` (Claude adds `onError`).

File upload — `#prepareAttachedFiles({ fileUrls })` uploads attachments once and reuses them, keyed by
the uploaded file's `idHash` (last path segment of the file URL; base URLs come from
`env.BASE_EMPLOYEE_FILE_URL` / `env.BASE_CLIENT_FILE_URL`). It maps app `UploadedFile` rows to a
per-provider upload record. Only files that end up with a provider id/uri are returned.

| Vendor | Upload record model | Reuse rule | Identity attached |
| --- | --- | --- | --- |
| Claude | `ClaudeUploadedFile` | always reusable (Claude file ids do not expire) | `claudeFileId` |
| OpenAI | `OpenAiUploadedFile` | reusable if no `expiresAt`, else `expiresAt > now` (Unix seconds → Date) | `openAiFileId` |
| Gemini | `GeminiUploadedFile` | reusable if `expiresAt > now` (ordered by `expiresAt` DESC) | `geminiFileUri` |

The `AttachedFile` typedef on `BaseAiModelProcessor` carries all three optional identities plus
`fileUrl` / `fileType`.

Compressed further — read the source before touching these:

- Payload generators: `BaseAiMessagePayloadGenerator` holds shared state (`aiAgent`, `aiModel`,
  `targetAiModel`, `message`, `historyMessages`, `maxTokens`, `tools`, `emotionalLevel`, `fileUrls`,
  `toolChoices`) and history trimming (`MessageTokenLimiter`). `#generateToolChoice()` →
  `{ type: 'auto' }` (no tools) / `{ type: 'tool', name }` (exactly one — the forced single tool) /
  `{ type: 'any' }` (multiple); `tools` / `toolChoice` are **omitted entirely** when there are no tools.
  full text: `.claude/skills/hor-multi-llm-provider/references/provider-internals.md#payload-generators-apptoolsaipayloadgenerator`
- Low-level clients: per operation (SendMessage, StreamingMessage, UploadFile) a **Payload** + a
  **Fetcher** (extends `Base<Provider>ApiRequestLauncher` → `BaseRequestLauncher`) + a **Capsule**, plus
  one shared **ApiClient** and one shared **Base...RequestLauncher** that reads the vendor key/base URL
  from env. Same pattern as the external-api-client skill.
  full text: `.claude/skills/hor-multi-llm-provider/references/provider-internals.md#low-level-clients-appclaudeclient-appgeminiclient-appopenaiclient`

## Cross-cutting rules

- **Callers never branch on the provider** — resolve a processor by name and use the uniform
  `#sendRequestToAi()` / `AiModelResponse` surface.
- **A concrete model processor adds no logic beyond `#get:aiModel`** — put shared behavior on the
  provider base, per-vendor behavior on the provider base too, and model specifics in the DB.
- **Return `null` / a normalized error response, not `undefined`**, on failure; check `#hasError()`
  before reading content.
- One class per file, one `export default`, `static create()` factory; getters return a constant.

## What this skill does NOT cover

- **No stub / fake / offline provider.** The skill contains no mention of a stub, fake, mock, dummy or
  keyless driver anywhere — neither as a member of the processor set nor as a test double. Its only
  statement touching a missing key is "never hard-code a key". A stub driver is therefore
  un-specified here; the skill's own shape would make it one more concrete processor (its own
  `#get:aiModel`, discovered by the loader) plus `AiProvider` / `AiModel` rows.
- **No call-recording table.** The skill names only `ai_providers`, `ai_models`,
  `ai_model_capabilities`, `ai_model_tool_assignments` and the three per-vendor uploaded-file models.
  It says nothing about `ai_model_calls` or recording a call. The only related thing it names is the
  capsule's **token-usage extractors** (alongside model / role / stop-reason), which is the
  vendor-normalized material a call record would read from.

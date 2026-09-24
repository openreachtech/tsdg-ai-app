# hor-ai-prompt-document-store
<!-- hora-skills-ort-renchan 0.2.1 -->
<!-- source: .claude/skills/hor-ai-prompt-document-store/ -->

**Read the source above whenever this leaves a question open.**

## Grand principle

Every editable part of an AI agent — instruction, role, attached documents, tool schemas — **lives in the database, not in code**. A `DocumentInstructionComposer` assembles the runtime prompt from those rows at request time; every editable text has a `*Bk` backup copy so history is preserved.

- **No agent-facing text as a code constant.** Baseline text comes from seeders (`constants/aiConstants.cjs`); runtime edits go through resolvers (a mutation with history, not a deploy).
- **Compose the prompt at runtime from the three parts** — never concatenate a prompt by hand in a resolver.
- **Write editable text with `.save()` on the backup-mixin model, never `.update()`**, so history is captured; wrap multi-table writes in one transaction.
- Return `null` for missing values, not `undefined`; one class per file; migrations use snake_case `field:` names (`hor-sequelize-migration` skill).

## The store at a glance

| Concern | Where |
| --- | --- |
| Agent identity | `AiAgent` (`name`, `description`) |
| Agent **instruction** (preset) | `AiAgentDefaultInstruction.instruction` (TEXT) → `AiAgentDefaultInstructionBk` |
| Agent **role** (system prompt) | `AiAgentRoleInstruction.role` (TEXT) → `AiAgentRoleInstructionBk` |
| Agent model | `AiAgentDefaultModel → AiModel` (`hor-multi-llm-provider` skill) |
| Agent documents | `AiAgentDocumentAssignment` → `Document` + `DocumentAttachmentCategory` |
| Documents | `Document.content` (+ `DocumentEmbedding` / `DocumentSkill`; `hor-light-rag` skill) → `DocumentBk` |
| Agent tools | `AiAgentAvailableAiTool` → `AiTool.payload` (JSON schema) |
| Status / history | `AiAgentLatestStatus`+`AiAgentStatusPhase`, `DocumentLatestStatus`+`DocumentStatusPhase` |

## The models — columns and associations

All extend `BaseAppRenchanModel`, attributes via `ModelAttributeFactory` — `factory.ID_BIGINT` for entities/junctions, `factory.ID_INTEGER` for small status lookups. Declaration conventions: **`hor-sequelize-model` skill**.

**Prompt / agent:**

- `AiAgent` — `name` STRING(191), `description` TEXT, `registeredAt`/`savedAt`/`lastModifiedAt`, `CreatedByUserId`/`LastModifiedByUserId`. hasOne: `AiAgentLatestStatus`, `AiAgentDefaultInstruction`, `AiAgentRoleInstruction`, `AiAgentAvatarUrl`, `AiAgentRoleCategory`, `AiAgentEmotionalLevel`, `AiAgentDefaultModel`. hasMany: `AiAgentStatusPhase`, `AiAgentAvailableAiTool`, `AiAgentTagAssignment`, `AiAgentDocumentAssignment`, `AiAgentDocumentInstructionRecord`. belongsToMany `AiAgentTag`, and `Document` as `GeneratedDocuments` via `AiAgentDocumentGeneration`.
- `AiAgentDefaultInstruction` — `AiAgentId`, `instruction` TEXT, `savedAt`; belongsTo `AiAgent`; `BackupMixinModel` → `AiAgentDefaultInstructionBk`.
- `AiAgentRoleInstruction` — `AiAgentId`, `role` TEXT, `savedAt`; belongsTo `AiAgent`; `BackupMixinModel` → `AiAgentRoleInstructionBk`. (`role` is the provider system prompt — see the `hor-multi-llm-provider` skill's payload generators.)
- `AiAgentDefaultModel` — `AiAgentId`, `AiModelId`, `savedAt`; belongsTo `AiAgent`, `AiModel`.
- `AiAgentAvailableAiTool` — `AiAgentId`, `AiToolId`, `isEnabled` BOOL, `isDefault` BOOL, `savedAt`; belongsTo `AiAgent`, `AiTool`. (Which tools the agent may use.)
- `AiAgentDocumentAssignment` — `AiAgentId`, `DocumentId`, `DocumentAttachmentCategoryId` (default 1), `order` INT, `savedAt`; belongsTo `AiAgent`, `Document`, `DocumentAttachmentCategory`. (Binds documents; BASE vs DYNAMIC + `order`.)
- `AiAgentDocumentInstructionRecord` — `DocumentId`, `AiAgentId`, `instruction` TEXT, `savedAt` (per-document instruction override).
- `AiAgentStatus` — `ID_INTEGER`, `name`, `description` STRING(191); hasMany `AiAgentLatestStatus`, `AiAgentStatusPhase`.
- `AiAgentLatestStatus` — `AiAgentId`, `AiAgentStatusId` INT, `savedAt`; belongsTo `AiAgent`, `AiAgentStatus`; subquery `?AiAgentStatusId.AiAgentId`; `BackupMixinModel` → `AiAgentStatusPhase`.
- `AiAgentStatusPhase` — `AiAgentId`, `AiAgentStatusId` INT, `savedAt` (the status history sink).

**Tool:**

- `AiTool` — `name` STRING(191), `description` STRING(191), `payload` TEXT (NOT NULL, stringified JSON schema), `displayOrder` INT (default 0), `isVisible` BOOL (default true), `savedAt`; **no associations — `associate()` is noop**; loaded by PK + `JSON.parse(payload)` at runtime. Migration `…-create_table-ai_tools.cjs` → table `ai_tools`, column `payload` TEXT NOT NULL.
- `AiModelToolAssignment` (join) — `AiModelId`, `AiToolId`, `savedAt` (model↔tool availability).

**Document:**

- `Document` — `name` STRING(191), `description` TEXT, `content` TEXT (the body), `generatedAt`, `savedAt`/`lastModifiedAt`, `CreatedByUserId`/`LastModifiedByUserId`; hasOne `DocumentLatestStatus`/`DocumentSkill`/`DocumentEmbedding`/`DocumentSkillGenerationOutcome`; hasMany `DocumentStatusPhase`, `AiAgentDocumentAssignment`, `AiAgentDocumentInstructionRecord`, `AiAgentDocumentGeneration`, `AiChatRoomMessageDocumentLinkage`; `BackupMixinModel` → `DocumentBk`.
- `DocumentAttachmentCategory` — `name`, `description`, `displayName` STRING(191), `displayOrder` INT; hasMany `AiAgentDocumentAssignment`. `BASE_KNOWLEDGE {ID:1}` (body inlined) vs `DYNAMIC_DOCUMENT {ID:2}` (catalog only).
- `DocumentSkill` — `BackupMixinModel` → `DocumentSkillBk`; drives the dynamic catalog. `DocumentStatus` / `DocumentLatestStatus` (`BackupMixinModel` → `DocumentStatusPhase`) / `DocumentStatusPhase` / `DocumentEmbedding` mirror the agent-side status and embedding shapes. Columns of these five: full text: `.claude/skills/hor-ai-prompt-document-store/references/models-and-composition.md#document-models-columns--associations`

## The `*Bk` / `*StatusPhase` mechanics — the write-once history sink

- A backed-up model declares `static get Mixins () { return [BackupMixinModel] }` and `static get BackupModel () { return this._.<Name>Bk }`. **The `*Bk` model is a plain `BaseAppRenchanModel` with identical columns, no mixin, no `BackupModel` — the write-once history sink.** On `.save()` the mixin copies the **newly saved** values into `*Bk` — verified against `node_modules/@openreachtech/renchan-sequelize/lib/models/mixins/BackupMixinModel.js`, which is an `afterSave` hook reading `entity.get(key)`. The skill text says "pre-change" and is wrong; see the correction below.
- So the live row always holds the current value while every prior version is retained — an audit trail for free (never overwrite without it). Same for `AiAgentDefaultInstruction`, `AiAgentRoleInstruction`, `Document`, `DocumentSkill`.
- **Status variant:** `AiAgentLatestStatus` / `DocumentLatestStatus` use `BackupMixinModel` but point `BackupModel` at the `*StatusPhase` table — every status change appends a phase row while the LatestStatus row is mutated in place. Subqueries like `?AiAgentStatusId.AiAgentId` filter agents by current status.
- **Consequence: always `.save()` on these models, never `.update()`** — `.update()` can bypass the mixin and lose history / miss columns.

### Identifying a version of an instruction — the skill states no scheme

**The skill defines no version identifier for an instruction.** There is no version number, no `prompt_version` column, and no stated rule for addressing one generation in a `*Bk` table. All the skill states is: the sink has **identical columns** to the live table (so `AiAgentId`, `instruction` / `role`, `savedAt`, plus the sink row's own `id`), and each `.save()` appends a row carrying the values just saved.

**That is enough to build an identifier on.** Because every save appends, the sink holds
every version an instruction has ever had, each with its own `savedAt` — so `savedAt` of the
instruction in force addresses exactly one sink row. A feature recording a `prompt_version`
can use it, and resolve a months-old call back to the text that was sent.

Do not invent a scheme. A feature that must resolve a recorded `prompt_version` back to the exact instruction text sent has to have that identity designed and specified — it cannot be read out of this skill. Two adjacent facts to confirm at source before relying on either:

- ~~Whether the pre-change row or the newly-saved values land in `*Bk`.~~ **Settled by reading the code, not the skills.** `BackupMixinModel.setupHooks()` registers an `afterSave` hook that builds the sink row from `entity.get(key)` over every attribute but `id` / `createdAt` / `updatedAt` / `deletedAt` — the **newly saved** values. `hor-sequelize-model` is right and this skill is wrong. The sink therefore carries every version including the current one, never a lagging copy. full text: `.claude/skills/hor-ai-prompt-document-store/references/models-and-composition.md#the-bk--statusphase-mechanics`
- The physical `_bk` table name and its `tableName` declaration are a `hor-sequelize-model` convention (`<original table>_bk`), not stated in this skill.

## `AiTool.payload` — tool schemas as data

Tool schemas are `JSON.stringify`-ed into `AiTool.payload` by seeders and `JSON.parse`-d at runtime; actions hold only a tool **id**. Provider tools and function-declaration tools live side by side as rows.

- **Provider tools** (`sequelize/seeders/master/…-ai_tools_related.cjs`): Claude `JSON.stringify({ type: 'web_search_20250305', name: 'web_search' })`, OpenAI `{ type: 'web_search_preview' }`, Gemini `{ googleSearch: {} }`.
- **Function-calling tools** (from `constants/aiRecordSearchToolsConstants.cjs`): full function-declaration objects (`{ name, description, parameters: { type, properties, required } }`) stringified into `payload`, seeded with `is_visible: false` (internal forced tools — `hor-ai-agent-structure` skill).
- **Runtime read** (in an action): `const aiTool = await AiTool.findByPk(aiToolId); JSON.parse(aiTool.payload)`.
- Agent↔tool binding is `AiAgentAvailableAiTool`; model↔tool availability is `AiModelToolAssignment`.

## Composing the runtime prompt — `DocumentInstructionComposer`

`.createAsync(...)` wires a `TaskSpecificInstructionGenerator` and an `AiAgentBaseKnowledgeAssembler` (the light-rag seam), plus the agent's `defaultInstruction`. `#generateComposedInstruction()` joins **three parts** with `\n\n`, in this order:

```js
generateComposedInstruction () {
  const taskSpecificInstruction = this.taskSpecificInstructionGenerator.generateInstruction()
  const backgroundKnowledge = this.aiAgentBaseKnowledgeAssembler.generateBackgroundKnowledge()
  const defaultInstruction = this.generateDefaultInstruction()

  return [
    backgroundKnowledge,     // 1. runtime datetime + BASE docs (inlined) + dynamic doc bodies (RAG)
    taskSpecificInstruction, // 2. this call's documents + instruction
    defaultInstruction,      // 3. the agent preset
  ]
    .join('\n\n')
}
```

The parts are XML-wrapped so the model can tell them apart.

**Part 1 — background knowledge** (`AiAgentBaseKnowledgeAssembler#assembleCombinedBackgroundSection()`, joined with `\n\n`, empties filtered):

- runtime datetime: `<runtime_context>\n<current_datetime_iso>${iso}</current_datetime_iso>\n</runtime_context>`
- BASE-knowledge docs (bodies inlined) preceded by the legacy delimiter line `----Please remember the content of the document below as prior knowledge, and then respond to the instructions-----`, then a `<documents>…<document index=N><source>…</source><content>…</content></document>…</documents>` block.
- dynamic docs, only when prefetch selected any: `<dynamic_documents_retrieved_for_background>\n<![CDATA[${payload}]]>\n</dynamic_documents_retrieved_for_background>` — the payload is the `hor-light-rag` skill's `<retrieve_dynamic_documents_result>` XML.
- BASE vs DYNAMIC is decided by `DocumentAttachmentCategoryId === DOCUMENT_ATTACHMENT_CATEGORY.BASE_KNOWLEDGE.ID`.

**Part 2 — task-specific** (`TaskSpecificInstructionGenerator#generateInstruction()`):

```
attached documents for this task:
<documents>
<document index=0>
<source>${name}</source>
<content>${content}</content>
</document>
</documents>
Instruction for this task:
<instruction>
${this.instruction}
</instruction>
```

Documents are loaded from the DB by id (`Document.findAll({ where: { id } })`) plus any one-time documents (named `Additional Reference N`), sorted by `order`.

**Part 3 — agent preset** (`#generateDefaultInstruction()`): `<instruction><agent_preset>${this.defaultInstruction}</agent_preset></instruction>`.

> The exact line breaks and spacing inside the delimiter line and the XML blocks are reflowed by the source's markdown wrapping; copy them from the source file before hard-coding. full text: `.claude/skills/hor-ai-prompt-document-store/references/models-and-composition.md#composed-runtime-prompt--the-three-xml-parts`

## Exporting an agent as a document — `#generateAiAgentDocument({ aiAgent })`

The same composer renders a **Markdown** document (used by the export mutation), created with the three generator deps `null` — only the formatting methods are used:

```
# AI Agent: <name>

<description>

## Default Instructions

<AiAgentDefaultInstruction.instruction>

## Attached Documents

### Document 1: <name>

*<description>*

<content>
```

`#formatAttachedDocuments()` sorts `AiAgentDocumentAssignments` by `order`, or emits `*No documents attached*`.

## Seeders — master / dev-master / development

Three tiers under `sequelize/seeders/` (see the **sequelize-seeder skill**):

- **`master/`** — production baseline: the built-in system-worker agents and the AI-tools rows.
- **`dev-master/`** — the same data duplicated for the dev DB (identical filenames).
- **`development/`** — sample/demo rows with high fixed ids (`documents-id1000`, `ai_agents-id50000`).

Pattern: `TimestampSeedsSupplier.supplyAll(rows)` + `queryInterface.bulkInsert`; `down` = `bulkDelete` by id.

**Prompt text comes from `constants/aiConstants.cjs` → `DEFAULT_AI_AGENT`**, keyed by well-known agent; each entry `{ ID, NAME, DESCRIPTION, DEFAULT_INSTRUCTION, ROLE_INSTRUCTION }`. A single master agent seeder (e.g. `…-ai_agent_for_document_skill_snapshot.cjs`) `require`s it and seeds across ~10 tables in one file:

- `ai_agents` (`name`/`description` from the entry)
- `ai_agent_default_instructions` — `instruction: DEFAULT_AI_AGENT.<KEY>.DEFAULT_INSTRUCTION`
- `ai_agent_role_instructions` — `role: DEFAULT_AI_AGENT.<KEY>.ROLE_INSTRUCTION`
- `ai_agent_latest_statuses` + `ai_agent_status_phases` (from `AI_AGENT_STATUS`)
- `ai_agent_default_models` (an `AI_MODEL.*.ID`)
- plus `ai_agent_avatar_urls`, `ai_agent_role_categories`, `ai_agent_emotional_levels`, `ai_agent_tag_assignments`

Tool seeders: `…-ai_tools_related.cjs` seeds `ai_tools` + `ai_model_tool_assignments` (Claude→Anthropic models, OpenAI→OpenAI, Gemini→Google, from `AI_MODEL` provider ids); `…-ai_tools-record-search.cjs` seeds `ai_tools` only, payloads from `aiRecordSearchToolsConstants.cjs`, `is_visible: false`. Document seeder (`development/…-documents-id1000.cjs`) seeds `documents` (markdown `content`) then derives `document_latest_statuses` + `document_status_phases` (`DOCUMENT_STATUS.ACTIVE.ID`).

Limits / categories in `aiConstants.cjs`: `AI_AGENT` (`MAX_INSTRUCTION_LENGTH: 10000`, `MAX_ROLE_LENGTH: 200`, `MAX_NAME_LENGTH: 50`, `MAX_DESCRIPTION_LENGTH: 500`), `DOCUMENT_ATTACHMENT_CATEGORY` (`BASE_KNOWLEDGE {ID:1}` / `DYNAMIC_DOCUMENT {ID:2}`), `DOCUMENT_STATUS`, `AI_AGENT_STATUS`. The `.cjs` constants rule: **`hor-constant-definition` skill**.

## Reading and writing (resolvers)

Schema `server/graphql/schemas/user/019-aiAgent.graphql` — queries `aiAgent` / `aiAgents` / `aiModels`; mutations `addAiAgent` / `updateAiAgent` / `updateAiAgentStatus` / `exportAiAgentInstructionDocument` / `generateDocumentByAiAgent`.

- **Read** (`AiAgentQueryResolver`): `AiAgent.findOne` with a deep `include` (LatestStatus, DefaultModel, AvailableAiTool→AiTool `where isVisible`, DocumentAssignment→Document + DocumentAttachmentCategory ordered by `order`, `AiAgentDefaultInstruction`, `AiAgentRoleInstruction`, …); `#formatResponse()` exposes `instruction` (from `AiAgentDefaultInstruction.instruction`) and `role` (from `AiAgentRoleInstruction.role`). The list resolver omits the instruction bodies. **`hor-query-resolver` skill**.
- **Write** (`AddAiAgentMutationResolver` / `UpdateAiAgentMutationResolver`): one transaction; build a nested `AiAgent.build({ AiAgentDefaultInstruction: { instruction }, AiAgentRoleInstruction: { role }, AiAgentDocumentAssignments: [...], AiAgentDefaultModel, AiAgentLatestStatus })` with cascading `include`, then bulk-create `AiAgentAvailableAiTool`. Update uses `.set(...)` + `await builtAiAgent.AiAgentDefaultInstruction.save()` / `.AiAgentRoleInstruction.save()` (**these `.save()` calls trigger the `*Bk` backup**), then destroy+recreate the assignment/tool rows. Verify requested tools belong to the model (`AiModelToolAssignment`). **`hor-mutation-resolver` skill**.
- **Export** (`ExportAiAgentInstructionDocumentMutationResolver`): loads the agent, in a transaction calls `DocumentInstructionComposer.create({ ...: null }).generateAiAgentDocument({ aiAgent })`, persists a `Document` (status DRAFT), and **after commit** dispatches `DocumentEmbeddingDispatcher` + `DocumentSkillSnapshotDispatcher` jobs so the exported document is indexed for later dynamic retrieval (`hor-light-rag` skill; jobs via the `hor-renchan-job-bullmq` skill).

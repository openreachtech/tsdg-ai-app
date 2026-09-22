import {
  BaseAgentAction,
} from '@openreachtech/mentsu-agent-loop-core'

import AiTool from '../../../../sequelize/models/AiTool.js'

/**
 * Base of the record-field-values agent actions: shared helpers for running one forced-tool
 * AI turn over the loop context (`processor` / `aiAgent` / `historyMessages` / `documents` /
 * `files`), following the existing forced-single-tool pattern
 * ({@link import('../../../tools/DocumentSkillSnapshotGenerator.js').default}).
 *
 * @abstract
 * @extends {BaseAgentAction}
 */
export default class BaseRecordFieldValuesAgentAction extends BaseAgentAction {
  /**
   * Load one `ai_tools` row and parse its payload JSON, or return `null` when missing/broken.
   *
   * @param {{
   *   aiToolId: number
   * }} params
   * @returns {Promise<object | null>}
   */
  async loadToolPayloadObject ({
    aiToolId,
  }) {
    const aiTool = await AiTool.findByPk(aiToolId)

    if (!aiTool) {
      return null
    }

    try {
      return JSON.parse(aiTool.payload)
    } catch {
      return null
    }
  }

  /**
   * Run one forced-tool AI turn over the loop's chat context.
   *
   * @param {{
   *   context: RecordFieldValuesLoopContext
   *   instruction: string
   *   toolPayloadObject: object
   * }} params
   * @returns {Promise<*>}
   */
  async sendForcedToolRequest ({
    context,
    instruction,
    toolPayloadObject,
  }) {
    return context.processor.sendRequestToAi({
      aiAgent: context.aiAgent,
      documents: context.documents,
      extraToolOptions: {},
      fileUrls: context.files,
      historyMessages: context.historyMessages,
      instruction,
      isAutoHandleFunctionCall: false,
      toolChoices: [
        {
          name: toolPayloadObject.name,
        },
      ],
      tools: [
        toolPayloadObject,
      ],
    })
  }

  /**
   * Pick the first function call carrying the given name.
   *
   * @param {{
   *   response: *
   *   toolName: string
   * }} params
   * @returns {object | null}
   */
  extractFunctionCallFromAiResponse ({
    response,
    toolName,
  }) {
    const functionCalls = response.extractFunctionCalls()

    const matched = functionCalls.find(functionCall => functionCall.name === toolName)

    if (!matched) {
      return null
    }

    return matched
  }

  /**
   * Parse function-call arguments (JSON string or object), or return `null` on failure.
   *
   * @param {{
   *   functionCall: { arguments?: object | string }
   * }} params
   * @returns {object | null}
   */
  parseFunctionCallArguments ({
    functionCall,
  }) {
    const rawArguments = functionCall.arguments
      ?? null

    if (rawArguments === null) {
      return null
    }

    try {
      return typeof rawArguments === 'string'
        ? JSON.parse(rawArguments)
        : rawArguments
    } catch {
      return null
    }
  }
}

/**
 * Loop context assembled by {@link import('../../../tools/RecordFieldValuesGenerator.js').default}.
 *
 * @typedef {{
 *   message: string
 *   files: Array<server.graphql.user.AttachedMessageFileInput>
 *   aiAgent: *
 *   historyMessages: Array<*>
 *   documents: Array<server.graphql.user.AiAgentDocumentInput>
 *   processor: *
 *   originObjectCategoryId: number
 *   originObjectUniqueKey: number
 *   editableColumns: Array<import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry & {
 *     currentValue: *
 *   }>
 *   currentValues: string
 *   fixedOptionsByColumnId: Record<number, Array<*>>
 *   fillFormAiToolId: number
 *   selectSearchTargetsAiToolId: number
 *   editSearchQueryRegistry: *
 *   userId: number
 *   userRoleIds: Array<number>
 * }} RecordFieldValuesLoopContext
 */

import {
  BaseAgentAction,
} from '@openreachtech/mentsu-agent-loop-core'

import AiTool from '../../../../sequelize/models/AiTool.js'

/**
 * Base of the record-search agent actions: shared helpers for running one forced-tool AI turn
 * over the loop context (`processor` / `aiAgent` / `historyMessages` / `documents` / `files`),
 * following the same forced-single-tool pattern as the record edit-mode actions
 * ({@link import('../../recordFieldValues/actions/BaseRecordFieldValuesAgentAction.js').default}).
 *
 * @abstract
 * @extends {BaseAgentAction}
 */
export default class BaseRecordSearchAgentAction extends BaseAgentAction {
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
   *   context: RecordSearchLoopContext
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
 * Loop context assembled by {@link import('../../../tools/RecordSearchGenerator.js').default}.
 *
 * @typedef {{
 *   message: string
 *   files: Array<*>
 *   aiAgent: *
 *   historyMessages: Array<*>
 *   documents: Array<*>
 *   processor: *
 *   searchableCategories: Array<{ originObjectCategoryId: number, name: string, slug: string }>
 *   recordSearchService: import('../../../tools/RecordSearchService.js').default
 *   classifySearchIntentAiToolId: number
 *   planRecordSearchAiToolId: number
 *   composeSearchAnswerAiToolId: number
 * }} RecordSearchLoopContext
 */

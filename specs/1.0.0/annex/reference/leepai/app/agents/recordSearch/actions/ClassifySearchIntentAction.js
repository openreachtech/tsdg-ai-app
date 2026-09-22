import BaseRecordSearchAgentAction from './BaseRecordSearchAgentAction.js'

import Timber from '../../../tools/Timber.js'

/**
 * Intent gate (AI decision): one forced `classify_search_intent` turn deciding whether the
 * chat utterance is a record-search request. Used standalone by the generator before the
 * loop runs (not registered in the loop's registry). Failures resolve to `false` so the
 * normal chat answer is generated (safe fallback).
 *
 * @class ClassifySearchIntentAction
 * @extends {BaseRecordSearchAgentAction}
 */
export default class ClassifySearchIntentAction extends BaseRecordSearchAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'classifySearchIntent'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Decide whether the chat utterance asks to find existing CRM records (record search) or is ordinary conversation'
  }

  /**
   * Tool name for the classification turn (matches `ai_tools` payload).
   *
   * @returns {string}
   */
  get toolName () {
    return 'classify_search_intent'
  }

  /**
   * Run the classification turn.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     message: string
   *   }
   *   context: import('./BaseRecordSearchAgentAction.js').RecordSearchLoopContext
   * }} params
   * @returns {Promise<boolean>}
   */
  async run ({
    argumentHash: {
      message,
    },
    context,
  }) {
    const toolPayloadObject = await this.loadToolPayloadObject({
      aiToolId: context.classifySearchIntentAiToolId,
    })

    if (!toolPayloadObject) {
      Timber.log('[ClassifySearchIntentAction] classify_search_intent tool row missing or broken')

      return false
    }

    const instruction = this.buildInstruction({
      message,
    })

    const response = await this.sendForcedToolRequest({
      context,
      instruction,
      toolPayloadObject,
    })

    if (response.hasError()) {
      Timber.log('[ClassifySearchIntentAction] sendRequestToAi error', {
        errorMessage: response.extractErrorMessage(),
      })

      return false
    }

    const functionCall = this.extractFunctionCallFromAiResponse({
      response,
      toolName: this.toolName,
    })

    if (!functionCall) {
      return false
    }

    const parsed = this.parseFunctionCallArguments({
      functionCall,
    })

    return parsed?.isRecordSearch === true
  }

  /**
   * Build the classification instruction.
   *
   * @param {{
   *   message: string
   * }} params
   * @returns {string}
   */
  buildInstruction ({
    message,
  }) {
    const lines = [
      'You are deciding whether the user request below asks to FIND existing CRM records.',
      'You must call the tool `classify_search_intent` exactly once. Do not reply with assistant-only text.',
      'Rules:',
      '- isRecordSearch is true only for lookups of existing records ("find the meetings of client A", "show documents about X", "list companies in Tokyo").',
      '- isRecordSearch is false for ordinary conversation, advice, summaries, and content generation.',
      '',
      `<user_request><![CDATA[${message}]]></user_request>`,
    ]

    return lines.join('\n')
  }
}

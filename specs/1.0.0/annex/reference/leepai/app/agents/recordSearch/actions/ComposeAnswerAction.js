import BaseRecordSearchAgentAction from './BaseRecordSearchAgentAction.js'

import Timber from '../../../tools/Timber.js'

/**
 * Answer step (AI decision): one forced `compose_search_answer` turn that writes the
 * human-facing summary of the search result. The record ids themselves come from code, not
 * from the AI. Failures resolve to a deterministic fallback sentence so the loop always
 * returns a message.
 *
 * @class ComposeAnswerAction
 * @extends {BaseRecordSearchAgentAction}
 */
export default class ComposeAnswerAction extends BaseRecordSearchAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'composeAnswer'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Write the human-facing summary of the record-search result (counts and categories; ids are attached by the server)'
  }

  /**
   * Tool name for the compose turn (matches `ai_tools` payload).
   *
   * @returns {string}
   */
  get toolName () {
    return 'compose_search_answer'
  }

  /**
   * Run the compose turn.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     message: string
   *     resultSummary: {
   *       foundCount: number
   *       isTruncated: boolean
   *       resultCategoryName: string | null
   *     }
   *   }
   *   context: import('./BaseRecordSearchAgentAction.js').RecordSearchLoopContext
   * }} params
   * @returns {Promise<{ message: string }>}
   */
  async run ({
    argumentHash: {
      message,
      resultSummary,
    },
    context,
  }) {
    const fallbackMessage = this.buildFallbackMessage({
      resultSummary,
    })

    const toolPayloadObject = await this.loadToolPayloadObject({
      aiToolId: context.composeSearchAnswerAiToolId,
    })

    if (!toolPayloadObject) {
      Timber.log('[ComposeAnswerAction] compose_search_answer tool row missing or broken')

      return {
        message: fallbackMessage,
      }
    }

    const instruction = this.buildInstruction({
      message,
      resultSummary,
    })

    const response = await this.sendForcedToolRequest({
      context,
      instruction,
      toolPayloadObject,
    })

    if (response.hasError()) {
      Timber.log('[ComposeAnswerAction] sendRequestToAi error', {
        errorMessage: response.extractErrorMessage(),
      })

      return {
        message: fallbackMessage,
      }
    }

    const functionCall = this.extractFunctionCallFromAiResponse({
      response,
      toolName: this.toolName,
    })

    const parsed = functionCall === null
      ? null
      : this.parseFunctionCallArguments({
        functionCall,
      })

    const composedMessage = typeof parsed?.message === 'string'
      && parsed.message.trim() !== ''
      ? parsed.message
      : fallbackMessage

    return {
      message: composedMessage,
    }
  }

  /**
   * Build the compose instruction: result summary + user request.
   *
   * @param {{
   *   message: string
   *   resultSummary: {
   *     foundCount: number
   *     isTruncated: boolean
   *     resultCategoryName: string | null
   *   }
   * }} params
   * @returns {string}
   */
  buildInstruction ({
    message,
    resultSummary,
  }) {
    const summaryJson = JSON.stringify(resultSummary)

    const lines = [
      'You are writing a short reply summarizing the record-search result for the user request below.',
      'You must call the tool `compose_search_answer` exactly once. Do not reply with assistant-only text.',
      'Rules:',
      '- Summarize how many records were found and of which category; do not list raw ids.',
      '- When isTruncated is true, mention that only the first results are shown.',
      '- When foundCount is 0, say nothing matched.',
      '',
      `<result_summary><![CDATA[${summaryJson}]]></result_summary>`,
      '',
      `<user_request><![CDATA[${message}]]></user_request>`,
    ]

    return lines.join('\n')
  }

  /**
   * Build the deterministic fallback message used when the AI turn is unavailable/failed.
   *
   * @param {{
   *   resultSummary: {
   *     foundCount: number
   *     isTruncated: boolean
   *     resultCategoryName: string | null
   *   }
   * }} params
   * @returns {string}
   */
  buildFallbackMessage ({
    resultSummary: {
      foundCount,
      isTruncated,
      resultCategoryName,
    },
  }) {
    if (foundCount === 0) {
      return 'No matching records were found.'
    }

    const categoryLabel = resultCategoryName
      ?? 'record'

    const truncationNote = isTruncated
      ? ' (showing the first results)'
      : ''

    return `Found ${foundCount} ${categoryLabel} record(s)${truncationNote}.`
  }
}

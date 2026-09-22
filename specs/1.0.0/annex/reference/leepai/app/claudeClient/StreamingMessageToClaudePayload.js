import {
  require,
} from '../globals/_.js'

const {
  BasePayload,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Payload for streaming a message from Claude.
 *
 * @extends {BasePayload}
 */
export default class StreamingMessageToClaudePayload extends BasePayload {
  /**
   * Get conversion table
   *
   * @override
   * @returns {Record<string, string>}
   */
  get conversionTable () {
    return {
      maxTokens: 'max_tokens',
      emotionalLevel: 'temperature',
      systemPrompt: 'system',
      aiModel: 'model',
      tools: 'tools',
      messages: 'messages',
      toolChoice: 'tool_choice',
    }
  }
}

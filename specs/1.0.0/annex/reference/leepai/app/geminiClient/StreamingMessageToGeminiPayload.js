import {
  require,
} from '../globals/_.js'

const {
  BasePayload,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Payload for streaming a message from Gemini.
 *
 * @extends {BasePayload}
 */
export default class StreamingMessageToGeminiPayload extends BasePayload {
  /**
   * Get conversion table
   *
   * @override
   * @returns {Record<string, string>}
   */
  get conversionTable () {
    return {
      maxOutputTokens: 'maxOutputTokens',
      emotionalLevel: 'temperature',
      systemPrompt: 'systemInstruction',
      aiModel: 'model',
      contents: 'contents',
      tools: 'tools',
      toolConfig: 'toolConfig',
    }
  }
}

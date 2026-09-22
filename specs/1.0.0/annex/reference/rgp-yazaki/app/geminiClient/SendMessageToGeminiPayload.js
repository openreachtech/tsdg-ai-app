import {
  require,
} from '../globals/_.js'

const {
  BasePayload,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * What one OCR request carries (`AI-01`).
 *
 * **This is where the provider's vocabulary starts.** Above this class a request is described in
 * this system's words - which model, which instruction, which document, which shape the answer
 * must take; the conversion table below renames them into what the Gemini SDK calls them. That is
 * the whole reason the table exists: `FR-091` claims a provider can be swapped without touching
 * anything above `AI-01`, and a caller that already spoke Gemini would quietly break the claim.
 *
 * It replaces the chat payload of the client this was ported from: no emotional level, no
 * conversation, no tools. An OCR request asks for a transcription against a schema and nothing
 * else (`40-backend.md` §7.3).
 *
 * **The table is the list of what may be sent, not of what is always sent.** A key absent from the
 * params never reaches the request, which is how `temperature` behaves: Gemini 3 asks for it to be
 * left at its default and warns that lowering it degrades the answer, so `AI_TEMPERATURE` defaults
 * to choosing nothing and the key is simply omitted (`ENV-042` `BaseGeminiAIProcessor`). It is in
 * the table so that an operator measuring the setting can send one, and sending `null` would not be
 * the same thing as not sending it.
 *
 * @extends {BasePayload}
 */
export default class SendMessageToGeminiPayload extends BasePayload {
  /**
   * get: Conversion table, from this system's keys to the SDK's.
   *
   * @override
   * @returns {{
   *   modelName: string
   *   contents: string
   *   instructionText: string
   *   mediaResolution: string
   *   thinkingLevel: string
   *   maxOutputTokens: string
   *   responseSchema: string
   *   temperature: string
   * }} - Key conversion table.
   */
  get conversionTable () {
    return {
      modelName: 'model',
      contents: 'contents',
      instructionText: 'systemInstruction',
      mediaResolution: 'mediaResolution',
      thinkingLevel: 'thinkingLevel',
      maxOutputTokens: 'maxOutputTokens',
      responseSchema: 'responseSchema',
      temperature: 'temperature',
    }
  }
}

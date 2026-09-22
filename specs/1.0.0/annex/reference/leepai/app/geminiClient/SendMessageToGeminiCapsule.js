import {
  BaseCapsule,
} from '@openreachtech/renchan-tools-external-api'

/**
 * Capsule wrapping a Gemini generateContent response.
 *
 * @extends {BaseCapsule}
 */
export default class SendMessageToGeminiCapsule extends BaseCapsule {
  /**
   * Extract content from response
   *
   * @returns {string}
   */
  extractContent () {
    return this.response.text ?? ''
  }

  /**
   * Extract content text
   *
   * @returns {string}
   */
  extractContentText () {
    return this.extractContent() ?? ''
  }

  /**
   * Extract function calls from response
   *
   * @returns {Array<{
   *   name: string
   *   arguments: object
   * }>}
   */
  extractFunctionCalls () {
    if (!this.response.functionCalls) {
      return []
    }

    return this.response.functionCalls
      .map(functionCall => ({
        name: functionCall.name,
        arguments: functionCall.args,
      }))
  }

  /**
   * Extract error message from response
   *
   * @returns {string}
   */
  extractErrorMessage () {
    try {
      const jsonPart = this.error.message.substring(this.error.message.indexOf('{'))
      const errorObj = JSON.parse(jsonPart)

      return errorObj.error.message
    } catch {
      return this.error.message
    }
  }

  /**
   * Check if the response has function call events
   *
   * @returns {boolean}
   */
  hasFunctionCallEvent () {
    if (!this.response.functionCalls) {
      return false
    }

    return this.response.functionCalls.length > 0
  }
}

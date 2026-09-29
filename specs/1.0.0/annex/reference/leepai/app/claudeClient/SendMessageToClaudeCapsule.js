import {
  require,
} from '../globals/_.js'

const {
  BaseCapsule,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Capsule wrapping a Claude `/messages` response.
 *
 * @extends {BaseCapsule}
 */
export default class SendMessageToClaudeCapsule extends BaseCapsule {
  /**
   * Extract first content
   *
   * @returns {object}
   */
  extractFirstContent () {
    if (
      !this.response.body.content
      || this.response.body.content.length === 0
    ) {
      return {}
    }

    return this.response.body.content[0] ?? {}
  }

  /**
   * Extract full content[] as returned by Claude
   *
   * @returns {Array<object>}
   */
  extractContent () {
    return this.response.body.content ?? []
  }

  /**
   * Check if the response has a function call event
   *
   * @returns {boolean}
   */
  hasFunctionCallEvent () {
    return this.extractContent()
      .some(contentBlock => contentBlock.type === 'tool_use')
  }

  /**
   * Extract function calls from the response
   *
   * @returns {Array<{
   *   name: string
   *   arguments: object
   * }>}
   */
  extractFunctionCalls () {
    return this.extractContent()
      .filter(contentBlock => contentBlock.type === 'tool_use')
      .map(contentBlock => ({
        name: contentBlock.name,
        arguments: contentBlock.input,
      }))
  }

  /**
   * Extract text-only content joined together
   *
   * @returns {string}
   */
  extractContentTextOnly () {
    const textChunks = this.extractContent()
      .filter(contentBlock => contentBlock.type === 'text')
      .map(contentBlock => contentBlock.text)

    return textChunks.join('')
  }

  /**
   * Extract content text
   *
   * @returns {string}
   */
  extractContentText () {
    return this.extractContentTextOnly() ?? ''
  }

  /**
   * Extract type
   *
   * @returns {string}
   */
  extractType () {
    return this.extractFirstContent().type ?? ''
  }

  /**
   * Extract error message
   *
   * @returns {string}
   */
  extractErrorMessage () {
    return this.error.response.data.error.message ?? ''
  }

  /**
   * Extract model
   *
   * @returns {string}
   */
  extractModel () {
    return this.response.body.model ?? ''
  }

  /**
   * Extract role
   *
   * @returns {string}
   */
  extractRole () {
    return this.response.body.role ?? ''
  }

  /**
   * Extract stop reason
   *
   * @returns {string}
   */
  extractStopReason () {
    return this.response.body.stop_reason ?? ''
  }

  /**
   * Extract input token number
   *
   * @returns {number}
   */
  extractInputTokenNumber () {
    return this.response.body.usage?.input_tokens ?? 0
  }

  /**
   * Extract output token number
   *
   * @returns {number}
   */
  extractOutputTokenNumber () {
    return this.response.body.usage?.output_tokens ?? 0
  }

  /**
   * Extract sum token number
   *
   * @returns {number}
   */
  extractSumTokenNumber () {
    return this.extractInputTokenNumber() + this.extractOutputTokenNumber()
  }
}

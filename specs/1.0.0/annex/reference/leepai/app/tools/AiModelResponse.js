/**
 * Normalized AI model response wrapping a provider response capsule.
 */
export default class AiModelResponse {
  /**
   * Constructor
   *
   * @param {{
   *   aiResponseCapsule: import('@openreachtech/renchan-tools-external-api').BaseCapsule | *
   * }} params
   */
  constructor ({
    aiResponseCapsule,
  }) {
    this.aiResponseCapsule = aiResponseCapsule
  }

  /**
   * Factory method to create an AiModelResponse instance
   *
   * @param {{
   *   aiResponseCapsule: import('@openreachtech/renchan-tools-external-api').BaseCapsule | *
   * }} params
   * @returns {AiModelResponse}
   */
  static create ({
    aiResponseCapsule,
  }) {
    return new this({
      aiResponseCapsule,
    })
  }

  /**
   * Extract content text
   *
   * @returns {string}
   * @throws {Error}
   */
  extractContentText () {
    if (!this.aiResponseCapsule?.extractContentText) {
      throw new Error('Must implement extractContentText method in aiResponseCapsule')
    }

    return this.aiResponseCapsule.extractContentText()
  }

  /**
   * Extract function calls from response
   *
   * @returns {Array<object>}
   * @throws {Error}
   */
  extractFunctionCalls () {
    if (!this.aiResponseCapsule?.extractFunctionCalls) {
      throw new Error('Must implement extractFunctionCalls method in aiResponseCapsule')
    }

    return this.aiResponseCapsule.extractFunctionCalls()
  }

  /**
   * Extract error message from response
   *
   * @returns {string}
   * @throws {Error}
   */
  extractErrorMessage () {
    if (!this.aiResponseCapsule?.extractErrorMessage) {
      throw new Error('Must implement extractErrorMessage method in aiResponseCapsule')
    }

    return this.aiResponseCapsule.extractErrorMessage()
  }

  /**
   * Whether the underlying capsule holds an error.
   *
   * @returns {boolean}
   */
  hasError () {
    return this.aiResponseCapsule.hasError()
  }
}

import {
  BaseCapsule,
} from '@openreachtech/renchan-tools-external-api'

const JSON_OBJECT_OPENING_BRACE = '{'

/**
 * What Gemini answered one OCR request with (`AI-01`).
 *
 * **Every reader here answers `null` rather than throwing or inventing** (`hoc-errors`). A model
 * that returned nothing usable is an ordinary outcome of asking a model something, and the layer
 * that decides what it means is `AI-02`; a capsule that threw would make the decision here, and a
 * capsule that returned `{}` would hide it (`DR-03`).
 *
 * @extends {BaseCapsule}
 */
export default class SendMessageToGeminiCapsule extends BaseCapsule {
  /**
   * Extract the text of the answer.
   *
   * @returns {string | null} - The answer, or null when there was none.
   */
  extractResponseText () {
    return this.response
      ?.text
      ?? null
  }

  /**
   * Extract the answer as the structure the request asked for.
   *
   * The request pins `responseMimeType` to JSON and states a schema, so an answer that will not
   * parse means the provider did not honor the contract. That is worth telling apart from an
   * empty answer, which is why this reads `null` rather than an empty object either way.
   *
   * @returns {*} - The parsed answer, or null when there is none to parse.
   */
  extractStructuredResponse () {
    const responseText = this.extractResponseText()

    if (!responseText) {
      return null
    }

    try {
      return JSON.parse(responseText)
    } catch {
      return null
    }
  }

  /**
   * Extract what went wrong.
   *
   * The SDK reports a rejected call as an `Error` whose message holds the provider's own JSON
   * after a prefix. The message inside it is what names the cause - a quota, an unsupported file,
   * a bad key - so it is dug out here rather than being stored as one long line (`FAIL-03`).
   *
   * @returns {string | null} - The message, or null when the request did not fail.
   */
  extractErrorMessage () {
    if (!this.error) {
      return null
    }

    const errorMessage = this.error.message

    try {
      const jsonPart = errorMessage.slice(
        errorMessage.indexOf(JSON_OBJECT_OPENING_BRACE)
      )

      return JSON.parse(jsonPart)
        .error
        .message
    } catch {
      return errorMessage
    }
  }
}

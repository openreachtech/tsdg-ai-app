import BaseGeminiApiRequestLauncher from './BaseGeminiApiRequestLauncher.js'
import StreamingMessageToGeminiCapsule from './StreamingMessageToGeminiCapsule.js'

/**
 * Fetcher for streaming a message from Gemini.
 *
 * @extends {BaseGeminiApiRequestLauncher}
 */
export default class StreamingMessageToGeminiFetcher extends BaseGeminiApiRequestLauncher {
  /**
   * Get CapsuleClass
   *
   * @returns {typeof StreamingMessageToGeminiCapsule}
   */
  get CapsuleClass () {
    return StreamingMessageToGeminiCapsule
  }

  /**
   * Launch stream request
   *
   * @param {object} actualParams
   * @param {{
   *   onText: (text: string) => void
   *   onFunctionCall: (functionCalls: Array<object>) => void
   *   onComplete: (message: string) => void
   *   onError?: (error: object) => void
   * }} callbacks
   * @returns {Promise<void>}
   */
  async launchStreamRequest (
    actualParams,
    {
      onText,
      onFunctionCall,
      onComplete,
      onError,
    }
  ) {
    try {
      const response = await this.client.streamMessageFromGemini({
        ...actualParams,
      })

      const chunks = []
      const functionCalls = []

      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of response) {
        if (!chunk.functionCalls) {
          chunks.push(chunk.text)
          onText(chunk.text)
        }

        if (chunk.functionCalls) {
          functionCalls.push(...chunk.functionCalls)
        }
      }

      if (functionCalls.length > 0) {
        await onFunctionCall(
          this.formatFunctionCalls({ functionCalls })
        )
      }

      if (chunks.length > 0) {
        onComplete(chunks.join(''))
      }
    } catch (error) {
      if (onError) {
        onError(this.formatGeminiError({
          error,
        }))

        return
      }

      throw error
    }
  }

  /**
   * Format function calls for sending to Gemini
   *
   * @param {{
   *   functionCalls: Array<{
   *     name: string
   *     args: Array<*>
   *   }>
   * }} params
   * @returns {Array<{
   *   name: string
   *   arguments: Array<*>
   * }>}
   */
  formatFunctionCalls ({
    functionCalls,
  }) {
    return functionCalls
      .map(functionCall => ({
        name: functionCall.name,
        arguments: functionCall.args,
      }))
  }

  /**
   * Format Gemini error
   *
   * @param {{
   *   error: Error
   * }} params
   * @returns {{
   *   type: string | null
   *   message: string | null
   *   requestId: string | null
   * }}
   */
  formatGeminiError ({
    error,
  }) {
    const fallback = {
      type: null,
      message: error?.message ?? null,
      requestId: null,
    }

    if (!error?.message) {
      return fallback
    }

    const jsonStartIndex = error.message.indexOf('{')

    if (jsonStartIndex === -1) {
      return fallback
    }

    try {
      const jsonPart = error.message.substring(jsonStartIndex)
      const errorObj = JSON.parse(jsonPart)

      return {
        type: errorObj.error?.code ?? null,
        message: errorObj.error?.message ?? null,
        requestId: errorObj.request_id ?? null,
      }
    } catch (parseError) {
      return fallback
    }
  }
}

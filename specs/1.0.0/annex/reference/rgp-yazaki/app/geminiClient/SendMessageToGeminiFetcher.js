import BaseGeminiApiRequestLauncher from './BaseGeminiApiRequestLauncher.js'
import SendMessageToGeminiCapsule from './SendMessageToGeminiCapsule.js'

/**
 * Sends one OCR request and answers with its capsule (`AI-01`).
 *
 * @extends {BaseGeminiApiRequestLauncher}
 */
export default class SendMessageToGeminiFetcher extends BaseGeminiApiRequestLauncher {
  /**
   * get: The capsule this answers with.
   *
   * @override
   * @returns {typeof SendMessageToGeminiCapsule} - Capsule class.
   */
  get CapsuleClass () {
    return SendMessageToGeminiCapsule
  }

  /**
   * Make the request.
   *
   * The parameters arrive already renamed into the SDK's vocabulary, because the payload's
   * conversion table has run by the time the framework base calls this.
   *
   * @override
   * @param {*} actualParams - Parameters of the request, in the SDK's keys.
   * @returns {Promise<import('@google/genai').GenerateContentResponse>} - Raw response.
   */
  async requestToClient (actualParams) {
    return this.client.sendMessageToGemini(actualParams)
  }
}

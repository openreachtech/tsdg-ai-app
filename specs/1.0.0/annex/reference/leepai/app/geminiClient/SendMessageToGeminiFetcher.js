import BaseGeminiApiRequestLauncher from './BaseGeminiApiRequestLauncher.js'
import SendMessageToGeminiCapsule from './SendMessageToGeminiCapsule.js'

/**
 * Fetcher for sending a message to Gemini.
 *
 * @extends {BaseGeminiApiRequestLauncher}
 */
export default class SendMessageToGeminiFetcher extends BaseGeminiApiRequestLauncher {
  /**
   * Get CapsuleClass
   *
   * @override
   * @returns {typeof SendMessageToGeminiCapsule}
   */
  get CapsuleClass () {
    return SendMessageToGeminiCapsule
  }

  /**
   * Request to client
   *
   * @override
   * @param {object} actualParams
   * @returns {Promise<*>}
   */
  async requestToClient (actualParams) {
    return this.client.sendMessageToGemini({
      ...actualParams,
    })
  }
}

import BaseGeminiApiRequestLauncher from './BaseGeminiApiRequestLauncher.js'
import UploadFileToGeminiCapsule from './UploadFileToGeminiCapsule.js'

/**
 * Hands one document to the Files API and answers with its capsule (`AI-01` `ADR-07`).
 *
 * **This is the call that sends client bytes off the host.** It runs only where `AI_PROVIDER` is
 * `gemini`; on the default `stub` nothing reaches this class at all (`ENV-030` `SEC-004`).
 *
 * @extends {BaseGeminiApiRequestLauncher}
 */
export default class UploadFileToGeminiFetcher extends BaseGeminiApiRequestLauncher {
  /**
   * get: The capsule this answers with.
   *
   * @override
   * @returns {typeof UploadFileToGeminiCapsule} - Capsule class.
   */
  get CapsuleClass () {
    return UploadFileToGeminiCapsule
  }

  /**
   * Make the request.
   *
   * @override
   * @param {*} actualParams - Parameters of the request, in the SDK's keys.
   * @returns {Promise<import('@google/genai').File>} - Raw response.
   */
  async requestToClient (actualParams) {
    return this.client.uploadFileToGemini(actualParams)
  }
}

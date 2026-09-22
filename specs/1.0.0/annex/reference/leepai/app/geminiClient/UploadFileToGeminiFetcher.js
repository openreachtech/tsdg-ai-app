import BaseGeminiApiRequestLauncher from './BaseGeminiApiRequestLauncher.js'
import UploadFileToGeminiCapsule from './UploadFileToGeminiCapsule.js'

/**
 * Fetcher for uploading a file to the Gemini File API.
 *
 * @extends {BaseGeminiApiRequestLauncher}
 */
export default class UploadFileToGeminiFetcher extends BaseGeminiApiRequestLauncher {
  /**
   * Get CapsuleClass
   *
   * @override
   * @returns {typeof UploadFileToGeminiCapsule}
   */
  get CapsuleClass () {
    return UploadFileToGeminiCapsule
  }

  /**
   * Request to client
   *
   * @override
   * @param {object} actualParams
   * @returns {Promise<*>}
   */
  async requestToClient (actualParams) {
    return this.client.uploadFileToGemini(actualParams)
  }
}

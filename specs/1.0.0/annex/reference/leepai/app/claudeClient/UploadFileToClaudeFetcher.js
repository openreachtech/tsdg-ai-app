import BaseClaudeApiRequestLauncher from './BaseClaudeApiRequestLauncher.js'
import UploadFileToClaudeCapsule from './UploadFileToClaudeCapsule.js'

/**
 * Fetcher for uploading a file to the Claude Files API.
 *
 * @extends {BaseClaudeApiRequestLauncher}
 */
export default class UploadFileToClaudeFetcher extends BaseClaudeApiRequestLauncher {
  /**
   * Get CapsuleClass
   *
   * @override
   * @returns {typeof UploadFileToClaudeCapsule}
   */
  get CapsuleClass () {
    return UploadFileToClaudeCapsule
  }

  /**
   * Request to client
   *
   * @override
   * @param {object} actualParams
   * @returns {Promise<*>}
   */
  async requestToClient (actualParams) {
    return this.client.uploadFileToClaude(actualParams)
  }
}

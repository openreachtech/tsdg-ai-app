import BaseClaudeApiRequestLauncher from './BaseClaudeApiRequestLauncher.js'
import SendMessageToClaudeCapsule from './SendMessageToClaudeCapsule.js'

/**
 * Fetcher for sending a message to Claude.
 *
 * @extends {BaseClaudeApiRequestLauncher}
 */
export default class SendMessageToClaudeFetcher extends BaseClaudeApiRequestLauncher {
  /**
   * Get CapsuleClass
   *
   * @override
   * @returns {typeof SendMessageToClaudeCapsule}
   */
  get CapsuleClass () {
    return SendMessageToClaudeCapsule
  }

  /**
   * Request to client
   *
   * @override
   * @param {object} actualParams
   * @returns {Promise<import('../tools/HttpRequestClient.js').HttpResponse>}
   */
  async requestToClient (actualParams) {
    return this.client.sendMessageToClaude({
      ...actualParams,
    })
  }
}

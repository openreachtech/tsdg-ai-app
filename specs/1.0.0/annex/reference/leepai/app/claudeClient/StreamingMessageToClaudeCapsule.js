import {
  BaseCapsule,
} from '@openreachtech/renchan-tools-external-api'

/**
 * Capsule for a streamed Claude message.
 *
 * @extends {BaseCapsule}
 */
export default class StreamingMessageToClaudeCapsule extends BaseCapsule {
  /**
   * Extract useful info from final message
   *
   * @param {*} finalMessage
   * @returns {string}
   */
  static extractFinalMessage (finalMessage) {
    return finalMessage?.content[0]?.text ?? ''
  }
}

import {
  require,
} from '../globals/_.js'

const {
  BasePayload,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Payload for uploading a file to the Claude Files API.
 *
 * @extends {BasePayload}
 */
export default class UploadFileToClaudePayload extends BasePayload {
  /**
   * Get conversion table
   *
   * @override
   * @returns {Record<string, string>}
   */
  get conversionTable () {
    return {
      fileBuffer: 'fileBuffer',
      fileName: 'fileName',
      fileType: 'fileType',
    }
  }
}

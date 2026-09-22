import {
  require,
} from '../globals/_.js'

const {
  BasePayload,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * What one Files API upload carries (`AI-01` `ADR-07`).
 *
 * The three keys the SDK wants are already this system's own words, so the conversion table maps
 * them onto themselves. It is declared rather than left inherited because it is the list of what
 * may be sent to the provider, and a list of that is worth being able to read in one place
 * (`SEC-003`).
 *
 * @extends {BasePayload}
 */
export default class UploadFileToGeminiPayload extends BasePayload {
  /**
   * get: Conversion table, from this system's keys to the SDK's.
   *
   * @override
   * @returns {{
   *   fileBuffer: string
   *   fileName: string
   *   mimeType: string
   * }} - Key conversion table.
   */
  get conversionTable () {
    return {
      fileBuffer: 'fileBuffer',
      fileName: 'fileName',
      mimeType: 'mimeType',
    }
  }
}

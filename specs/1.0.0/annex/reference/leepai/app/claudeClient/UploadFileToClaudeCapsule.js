import {
  require,
} from '../globals/_.js'

const {
  BaseCapsule,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Capsule wrapping a Claude Files API upload response.
 *
 * @extends {BaseCapsule}
 */
export default class UploadFileToClaudeCapsule extends BaseCapsule {
  /**
   * Extract uploaded file id.
   *
   * @returns {string | null}
   */
  extractUploadedFileId () {
    return this.response?.body?.id ?? null
  }

  /**
   * Extract uploaded file name.
   *
   * @returns {string | null}
   */
  extractUploadedFileName () {
    return this.response?.body?.filename ?? null
  }

  /**
   * Extract uploaded file mime type.
   *
   * @returns {string | null}
   */
  extractUploadedFileMimeType () {
    return this.response?.body?.mime_type ?? null
  }

  /**
   * Extract uploaded file size in bytes.
   *
   * @returns {number | null}
   */
  extractUploadedFileSizeBytes () {
    return this.response?.body?.size_bytes ?? null
  }

  /**
   * Extract uploaded file create time.
   *
   * @returns {string | null}
   */
  extractUploadedFileCreateTime () {
    return this.response?.body?.created_at ?? null
  }
}

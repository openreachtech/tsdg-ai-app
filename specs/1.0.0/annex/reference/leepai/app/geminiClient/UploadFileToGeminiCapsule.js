import {
  BaseCapsule,
} from '@openreachtech/renchan-tools-external-api'

/**
 * Capsule wrapping a Gemini File API upload response.
 *
 * @extends {BaseCapsule}
 */
export default class UploadFileToGeminiCapsule extends BaseCapsule {
  /**
   * Extract uploaded file name.
   *
   * @returns {string | null}
   */
  extractUploadedFileName () {
    return this.response?.name ?? null
  }

  /**
   * Extract uploaded file mime type.
   *
   * @returns {string | null}
   */
  extractUploadedFileMimeType () {
    return this.response?.mimeType ?? null
  }

  /**
   * Extract uploaded file create time.
   *
   * @returns {string | null}
   */
  extractUploadedFileCreateTime () {
    return this.response?.createTime ?? null
  }

  /**
   * Extract uploaded file expiration time.
   *
   * @returns {string | null}
   */
  extractUploadedFileExpirationTime () {
    return this.response?.expirationTime ?? null
  }

  /**
   * Extract uploaded file size in bytes.
   *
   * @returns {string | null}
   */
  extractUploadedFileSizeBytes () {
    return this.response?.sizeBytes ?? null
  }

  /**
   * Extract uploaded file uri.
   *
   * @returns {string | null}
   */
  extractUploadedFileUri () {
    return this.response?.uri ?? null
  }
}

import {
  BaseCapsule,
} from '@openreachtech/renchan-tools-external-api'

/**
 * What the provider answered one upload with (`AI-01` `ADR-07`).
 *
 * **Everything readable here becomes a column of `TBL-08`**, which is the only record that a
 * client document left the host (`OPS-08` `STORE-02`). The uri is what the OCR request then
 * points at, and the expiration is what tells `JOB-02` when the provider has already deleted it
 * (`ST-03`).
 *
 * @extends {BaseCapsule}
 */
export default class UploadFileToGeminiCapsule extends BaseCapsule {
  /**
   * Extract the provider's own handle for the file.
   *
   * @returns {string | null} - The handle, or null.
   */
  extractUploadedFileName () {
    return this.response
      ?.name
      ?? null
  }

  /**
   * Extract what an OCR request points at to send this file again.
   *
   * @returns {string | null} - The uri, or null.
   */
  extractUploadedFileUri () {
    return this.response
      ?.uri
      ?? null
  }

  /**
   * Extract when the provider deletes it.
   *
   * The provider states this rather than the system assuming 48 hours, so `TBL-08.expires_at`
   * records what was said instead of what was expected.
   *
   * @returns {string | null} - The expiration time, or null.
   */
  extractUploadedFileExpirationTime () {
    return this.response
      ?.expirationTime
      ?? null
  }

  /**
   * Extract when the provider took it.
   *
   * @returns {string | null} - The creation time, or null.
   */
  extractUploadedFileCreateTime () {
    return this.response
      ?.createTime
      ?? null
  }
}

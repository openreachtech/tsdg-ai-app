import path from 'path'

import BATCH_FILE_KIND_CONSTANT_HASH from '../constants/batchFileKind.js'
import UPLOAD_FILE_FORMAT_CONSTANT_HASH from '../constants/uploadFileFormat.js'

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH
const {
  UPLOAD_FILE_FORMAT,
} = UPLOAD_FILE_FORMAT_CONSTANT_HASH

/**
 * Format of an uploaded file, read from the name it arrived under.
 *
 * **It labels a file; it never refuses one** (`ADR-25`). 1.0.1 asked this class whether a file was
 * allowed in at all, and answered `ERR-101` when it was not. Nothing is refused for its kind now,
 * so the one question left is which of the three `TBL-12` kinds the file is stored under - and an
 * extension nobody recognizes is `other` rather than a reason to throw the file away.
 *
 * **The extension decides, and nothing else does.** The browser's reported MIME type is not
 * consulted: the same `.xlsx` arrives as a spreadsheet type from one browser and as
 * `application/octet-stream` from another. Nor is it a check on the bytes - a `.pdf` that is not a
 * PDF is labelled `debit_note_pdf` and fails when a worker opens it, which is where it was always
 * going to fail.
 */
export default class UploadedFileFormat {
  /**
   * Constructor.
   *
   * @param {{
   *   fileName: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    fileName,
  }) {
    this.fileName = fileName
  }

  /**
   * Factory method.
   *
   * @param {{
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {UploadedFileFormat} - Instance of this class.
   */
  static create ({
    fileName,
  }) {
    return new this({
      fileName,
    })
  }

  /**
   * get: Which kind each known extension names.
   *
   * Built from the format constants rather than restated here, so an extension added to
   * `UPLOAD_FILE_FORMAT` is an extension this hash already knows.
   *
   * @returns {Record<string, {
   *   ID: number
   *   NAME: string
   *   DISPLAY_NAME: string
   *   DISPLAY_ORDER: number
   * }>} - Extension including its dot, to the kind it names.
   */
  static get extensionBatchFileKindHash () {
    return {
      ...this.generateExtensionEntries({
        extensions: UPLOAD_FILE_FORMAT.EXCEL.EXTENSIONS,
        batchFileKind: BATCH_FILE_KIND.COVER_SHEET,
      }),
      ...this.generateExtensionEntries({
        extensions: UPLOAD_FILE_FORMAT.PDF.EXTENSIONS,
        batchFileKind: BATCH_FILE_KIND.DEBIT_NOTE_PDF,
      }),
    }
  }

  /**
   * Generate the entries one format contributes to the hash.
   *
   * @param {{
   *   extensions: Array<string>
   *   batchFileKind: {
   *     ID: number
   *     NAME: string
   *     DISPLAY_NAME: string
   *     DISPLAY_ORDER: number
   *   }
   * }} params - Parameters of this method.
   * @returns {Record<string, {
   *   ID: number
   *   NAME: string
   *   DISPLAY_NAME: string
   *   DISPLAY_ORDER: number
   * }>} - One entry per extension of this format.
   */
  static generateExtensionEntries ({
    extensions,
    batchFileKind,
  }) {
    return Object.fromEntries(
      extensions.map(extension => [
        extension,
        batchFileKind,
      ])
    )
  }

  /**
   * get: Extension of the uploaded name, lower-cased.
   *
   * Lower-cased because an operator's file manager writes `.XLSX` as readily as `.xlsx`, and the
   * two name the same format.
   *
   * @returns {string} - Extension including its dot, or an empty string.
   */
  get extension () {
    return path.extname(this.fileName)
      .toLowerCase()
  }

  /**
   * get: The kind this file is stored under (`TBL-12`).
   *
   * An extension the hash does not know is `other`, which is the whole of `ADR-25` in one line: the
   * file is kept and labelled rather than refused. `JOB-01` has no branch for that kind and will
   * not be asked for one until `OPEN-9` says what such files are.
   *
   * @returns {{
   *   ID: number
   *   NAME: string
   *   DISPLAY_NAME: string
   *   DISPLAY_ORDER: number
   * }} - The kind.
   */
  get batchFileKind () {
    return UploadedFileFormat.extensionBatchFileKindHash[this.extension]
      ?? BATCH_FILE_KIND.OTHER
  }
}

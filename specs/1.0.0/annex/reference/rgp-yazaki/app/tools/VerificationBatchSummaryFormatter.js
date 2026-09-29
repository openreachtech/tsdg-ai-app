/**
 * One batch, in the shape the operator schema declares for it.
 *
 * **`VerificationBatchSummary` is one type answered by three operations.** `API-Q001` lists the
 * batches of every upload on the page, `API-Q002` returns the one the operator opened, and
 * `API-M005` answers with the ones it has just derived. The three are reached in that order by one
 * operator in one sitting, so a field two of them filled differently would read as the screen
 * changing its mind about a batch that did not move. Formatting it in one place is what makes that
 * impossible rather than merely unlikely - the reasoning `BatchFileSummaryFormatter` was extracted
 * under, one type later.
 *
 * **The counts are handed in rather than read here**, because the three arrive at them by different
 * routes and each route is right where it stands: `API-Q001` groups them over a page of batches,
 * `API-Q002` takes the length of rows it has already read, and `API-M005` knows them because it
 * just wrote the files. A formatter that queried for them would ask the database to repeat what its
 * caller had already established.
 *
 * **`BatchUploadId` and `folderPath` are read straight, with no fallback.** Both columns are
 * nullable only while the schema is mid-move: every writer fills them, `MIG-03` fills the rows that
 * predate 1.0.2, and `TBL-03` makes them `NOT NULL` once it has. So a null reaching here means the
 * database was never upgraded, and a non-null field failing is the way that should surface - an
 * invented path would put a folder name in front of an operator who cannot find it on their disk,
 * which is the mistake `MIG-03` names when it refuses to guess one.
 */
export default class VerificationBatchSummaryFormatter {
  /**
   * Constructor.
   *
   * @param {{
   *   verificationBatch: VerificationBatchWithStatusEntity
   *   fileCount: number
   *   okCount: number
   *   ngCount: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    verificationBatch,
    fileCount,
    okCount,
    ngCount,
  }) {
    this.verificationBatch = verificationBatch
    this.fileCount = fileCount
    this.okCount = okCount
    this.ngCount = ngCount
  }

  /**
   * Factory method.
   *
   * @param {{
   *   verificationBatch: VerificationBatchWithStatusEntity
   *   fileCount: number
   *   okCount: number
   *   ngCount: number
   * }} params - Parameters of this method.
   * @returns {VerificationBatchSummaryFormatter} - Instance of this class.
   * @public
   */
  static create ({
    verificationBatch,
    fileCount,
    okCount,
    ngCount,
  }) {
    return new this({
      verificationBatch,
      fileCount,
      okCount,
      ngCount,
    })
  }

  /**
   * Format the batch.
   *
   * **`uploadedAt` and `uploaderName` are not here any more.** They described the drag rather than
   * the folder, and one drag now produces many folders - carrying them on a batch would write one
   * instant onto thirty rows and invite two answers to when it arrived. They are on
   * `BatchUploadSummary`, which on `SCR-02` is the row directly above this one.
   *
   * @returns {graphql.operator.VerificationBatchSummary} - One batch.
   */
  formatSummary () {
    return {
      verificationBatchId: this.verificationBatch.id,
      batchUploadId: this.verificationBatch.BatchUploadId,
      folderPath: this.verificationBatch.folderPath,
      statusName: this.verificationBatch.ProcessingStatus.name,
      fileCount: this.fileCount,
      okCount: this.okCount,
      ngCount: this.ngCount,
    }
  }
}

/**
 * A batch that carries the upload it was found in, the path it sits at, and where it stands.
 *
 * @typedef {import('../../sequelize/models/VerificationBatch.js').VerificationBatchEntity & {
 *   BatchUploadId: number
 *   folderPath: string
 *   ProcessingStatus: import('../../sequelize/models/ProcessingStatus.js').ProcessingStatusEntity
 * }} VerificationBatchWithStatusEntity
 */

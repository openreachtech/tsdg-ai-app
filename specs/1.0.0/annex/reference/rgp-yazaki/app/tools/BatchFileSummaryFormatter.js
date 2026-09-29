/**
 * One file of a batch, in the shape the operator schema declares for it.
 *
 * **`BatchFileSummary` is one type answered by two paths.** `API-Q002` lists every file of a batch
 * when the screen asks, and `API-S001` pushes one file as it changes state - and the second is the
 * path the screen normally reads, with the first as its fallback. `NFR-022` says the fallback must
 * lose nothing, which is only true while the two describe a file identically; formatting it in one
 * place is what makes that impossible to break rather than merely unlikely.
 *
 * The same reasoning `DebitNoteResultSummaryFormatter` was extracted under, one operation later.
 *
 * **`relativePath` is read straight, with no fallback.** The column is nullable only while the
 * schema is mid-move: every writer fills it, `MIG-03` fills the rows that predate 1.0.2, and
 * `TBL-04` makes it `NOT NULL` once it has. A null reaching here means the database was never
 * upgraded, and a non-null field failing is the way that should surface.
 */
export default class BatchFileSummaryFormatter {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFile: BatchFileWithKindEntity
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFile,
  }) {
    this.batchFile = batchFile
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFile: BatchFileWithKindEntity
   * }} params - Parameters of this method.
   * @returns {BatchFileSummaryFormatter} - Instance of this class.
   */
  static create ({
    batchFile,
  }) {
    return new this({
      batchFile,
    })
  }

  /**
   * Format the file.
   *
   * @returns {graphql.operator.BatchFileSummary} - One file.
   */
  formatSummary () {
    return {
      batchFileId: this.batchFile.id,
      fileName: this.batchFile.fileName,
      fileKindName: this.batchFile.BatchFileKind.name,
      relativePath: this.batchFile.relativePath,
      byteSize: this.formatByteSize(),
      statusName: this.batchFile.ProcessingStatus.name,
      failureReasonCode: this.batchFile.failureReasonCode,
      failureParameters: this.buildFailureParameters(),
      attemptCount: this.batchFile.attemptCount,
      pageCount: this.batchFile.pageCount,
      durationSeconds: this.batchFile.durationSeconds,
      readingCount: this.countReadings(),
    }
  }

  /**
   * Give the file's size as a decimal string (`TBL-04.byte_size`).
   *
   * **A decimal string for the same reason `minorUnits` is one** (30-api-contract.md §2.5): the
   * column is a `BIGINT`, which MariaDB returns as a string and SQLite as a number, so handing on
   * whichever arrived would make the field's type a property of the environment. `SCR-04` sums
   * these to say what an unstarted batch holds, and a client that added a string to a number would
   * produce a total by concatenation.
   *
   * **The size is per file rather than summed here** because a batch of 200 debit notes
   * (`NFR-001`) at `UPLOAD_MAX_FILE_BYTES` each is a figure no `Int` holds, and this type is
   * already answered in full for every file of the batch.
   *
   * @returns {string} - The size in bytes.
   */
  formatByteSize () {
    return String(this.batchFile.byteSize)
  }

  /**
   * Count the readings stored for this file (`TBL-06`).
   *
   * **How many arrived, not how many were asked for.** `OCR_REPEAT_COUNT` is what the job set out
   * to take and `FAIL-01` / `FAIL-03` name it as `targetReadingCount`; this is what is on the table
   * afterwards. On a failed file the two differ, and that difference is the finding (`FR-071`) - a
   * retried file showing four readings would be mixing two runs.
   *
   * Zero where nothing was read: a file still waiting, one that failed before its first call, or a
   * judgment carried over from 1.0.0 whose readings were never stored as rows.
   *
   * @returns {number} - How many readings there are.
   */
  countReadings () {
    return this.batchFile.OcrExtractions?.length
      ?? 0
  }

  /**
   * Build the values a failure's sentence has to substitute, or none.
   *
   * **All three codes have some in 1.0.1, and they are read from the column rather than rebuilt
   * here** (`TBL-04.failure_parameters`). 1.0.0 had only `FAIL-02` to answer for and rebuilt its two
   * numbers on the way out, which worked because the page cap is still readable long afterwards. The
   * readings a timed-out run got through are not: nothing on the row remembers them, and rule 14
   * leaves no `TBL-06` row to count. So the numbers are written down when the failure happens, and
   * this only carries them.
   *
   * The values travel rather than the sentence, so the operator's language stays out of this API
   * (`DR-09` `DR-13`). Null when the row has none - a failure from before 1.0.1, or one nobody
   * classified - and the renderer falls back to the code alone.
   *
   * @returns {string | null} - JSON of the values, or null.
   */
  buildFailureParameters () {
    const {
      failureParameters,
    } = this.batchFile

    if (!failureParameters) {
      return null
    }

    return JSON.stringify(failureParameters)
  }
}

/**
 * A file that carries the path it arrived at, its kind and where it stands.
 *
 * @typedef {import('../../sequelize/models/BatchFile.js').BatchFileEntity & {
 *   relativePath: string
 *   byteSize: number | string
 *   BatchFileKind: import('../../sequelize/models/BatchFileKind.js').BatchFileKindEntity
 *   ProcessingStatus: import('../../sequelize/models/ProcessingStatus.js').ProcessingStatusEntity
 *   OcrExtractions?: Array<import('../../sequelize/models/OcrExtraction.js').OcrExtractionEntity>
 * }} BatchFileWithKindEntity
 */

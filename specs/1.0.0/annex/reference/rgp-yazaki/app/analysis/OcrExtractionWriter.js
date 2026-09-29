import OcrExtraction from '../../sequelize/models/OcrExtraction.js'

/**
 * Stores the readings the AI layer produced, normalized (`TBL-06`).
 *
 * **What is kept is the normalized reading of §7.2, not the provider's envelope, and that reverses
 * 1.0.0.** The consensus has to be recomputable from this table and the currency master alone
 * (`NFR-031`); a raw provider envelope would make that recomputation provider-specific, which is the
 * opposite of what §10 claims about swapping providers. The provider's own answer carries nothing
 * the normalized form does not, and keeping it would be a second copy of client document content
 * (`SEC-010`).
 *
 * Each row is still stored beside the provider, model, prompt version and temperature that produced
 * it - a reading nobody can reproduce is not evidence of anything (`ADR-08` `FR-036`).
 *
 * **It takes the whole set of readings or none of it** (rule 14, `NFR-023` `FR-071`). One
 * transaction deletes every row this file has and writes the set that replaces it, so a retry cannot
 * leave a reading from the previous run beside the new ones and a failure part way through leaves
 * the file with no readings at all rather than with a smaller sample. An upsert per index could not
 * express that: lowering `OCR_REPEAT_COUNT` between two runs would leave the fourth row behind, and
 * a partial write would look exactly like a file that was read fewer times on purpose.
 *
 * **A reading's index is its position in the set**, which is only honest about a whole set - and is
 * the reason this class takes one rather than being called once per reading (`DR-06`).
 */
export default class OcrExtractionWriter {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFileId: number
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFileId,
    ocrExtractionOutcomes,
  }) {
    this.batchFileId = batchFileId
    this.ocrExtractionOutcomes = ocrExtractionOutcomes
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFileId: number
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   * }} params - Parameters of this method.
   * @returns {OcrExtractionWriter} - Instance of this class.
   */
  static create ({
    batchFileId,
    ocrExtractionOutcomes,
  }) {
    return new this({
      batchFileId,
      ocrExtractionOutcomes,
    })
  }

  /**
   * Write the set of readings, replacing whatever a previous run of this file left.
   *
   * @returns {Promise<void>}
   */
  async writeExtractions () {
    await OcrExtraction.beginTransaction(async transaction => {
      await OcrExtraction.destroy({
        where: {
          BatchFileId: this.batchFileId,
        },
        transaction,
      })

      await OcrExtraction.bulkCreate(
        this.buildExtractionAttributes(),
        {
          transaction,
        }
      )
    })
  }

  /**
   * Build one `TBL-06` row per reading, in the order they were taken.
   *
   * @returns {Array<{
   *   BatchFileId: number
   *   readingIndex: number
   *   providerName: string
   *   modelName: string
   *   promptVersion: string
   *   responseBody: string
   *   extractedAt: Date
   *   latencyMilliseconds: number
   *   temperature: number | null
   * }>} - The rows.
   */
  buildExtractionAttributes () {
    return this.ocrExtractionOutcomes
      .map((ocrExtractionOutcome, readingIndex) => ({
        BatchFileId: this.batchFileId,
        readingIndex,
        providerName: ocrExtractionOutcome.providerName,
        modelName: ocrExtractionOutcome.modelName,
        promptVersion: ocrExtractionOutcome.promptVersion,
        // The normalized reading as JSON, which is what `ENG-05` reduces and `NFR-031` requires be
        // enough on its own. The column keeps its name; what it holds is no longer a provider's words.
        responseBody: JSON.stringify(ocrExtractionOutcome.normalizedExtraction),
        extractedAt: ocrExtractionOutcome.extractedAt,
        latencyMilliseconds: ocrExtractionOutcome.latencyMilliseconds,
        // Null unless `AI_TEMPERATURE` chose one, which it does not by default: the OCR path leaves
        // Gemini 3 at its own. Recording `0.00` would put a number in the column that was never true
        // of the request - and `MIG-02` change 4 has already spent `0.00` marking pre-upgrade rows.
        temperature: ocrExtractionOutcome.temperature,
      }))
  }
}

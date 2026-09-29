import CurrencyResolver from '../verification/CurrencyResolver.js'

import ReadingFieldAgreement from '../../sequelize/models/ReadingFieldAgreement.js'

/**
 * Stores what a file's readings agreed on, field by field (`TBL-14`).
 *
 * **This is the table the evidence view reads** (`SCR-05` `FR-142`). Every number it shows comes
 * from here with its agreement level beside it and its region under it, which is why value,
 * agreement and provenance are one row rather than three tables.
 *
 * **It takes the whole set of fields or none of it**, the same rule `TBL-06` is written under
 * (rule 14, `NFR-023`). One transaction deletes every row this file has and writes the set that
 * replaces it, so a retry cannot leave an agreement from the previous run beside the new ones - and
 * a run that read fewer blocks than the last one cannot leave the block it no longer sees behind
 * (`DR-06`). An upsert per path could not express that.
 *
 * **Nothing here recomputes anything.** The counts arrive from `ENG-05` and are written down, which
 * is what makes `NFR-031` true: the same rows come back from the stored readings plus the currency
 * master, and no step between the two has an opinion.
 */
export default class ReadingFieldAgreementWriter {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFileId: number
   *   fieldConsensuses: Array<verification.ReadingFieldConsensus>
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFileId,
    fieldConsensuses,
    currencyResolver,
  }) {
    this.batchFileId = batchFileId
    this.fieldConsensuses = fieldConsensuses
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFileId: number
   *   fieldConsensuses: Array<verification.ReadingFieldConsensus>
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {ReadingFieldAgreementWriter} - Instance of this class.
   */
  static create ({
    batchFileId,
    fieldConsensuses,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      batchFileId,
      fieldConsensuses,
      currencyResolver,
    })
  }

  /**
   * Create the lookup the currency master is read through.
   *
   * @returns {CurrencyResolver} - The lookup.
   */
  static createCurrencyResolver () {
    return CurrencyResolver.create()
  }

  /**
   * Write the file's agreements, replacing whatever a previous run of it left.
   *
   * @returns {Promise<void>}
   */
  async writeAgreements () {
    await ReadingFieldAgreement.beginTransaction(async transaction => {
      await ReadingFieldAgreement.destroy({
        where: {
          BatchFileId: this.batchFileId,
        },
        transaction,
      })

      await ReadingFieldAgreement.bulkCreate(
        this.buildAgreementAttributes(),
        {
          transaction,
        }
      )
    })
  }

  /**
   * Build one `TBL-14` row per field, in the order `ENG-05` reduced them.
   *
   * @returns {Array<{
   *   BatchFileId: number
   *   fieldPath: string
   *   consensusValue: string | null
   *   CurrencyId: number | null
   *   agreedReadingCount: number
   *   totalReadingCount: number
   *   blockPageNumber: number | null
   *   pageNumber: number | null
   *   regionLeft: number | null
   *   regionTop: number | null
   *   regionRight: number | null
   *   regionBottom: number | null
   * }>} - The rows.
   */
  buildAgreementAttributes () {
    return this.fieldConsensuses
      .map(fieldConsensus => this.buildAgreementAttribute({
        fieldConsensus,
      }))
  }

  /**
   * Build one `TBL-14` row.
   *
   * **`field_path` is stored indexed**, because it is a storage key and has to stay unique per file.
   * What reaches a sentence is the stripped form plus its index, and `NG-008` carries that instead
   * (`DR-13`).
   *
   * @param {{
   *   fieldConsensus: verification.ReadingFieldConsensus
   * }} params - Parameters of this method.
   * @returns {{
   *   BatchFileId: number
   *   fieldPath: string
   *   consensusValue: string | null
   *   CurrencyId: number | null
   *   agreedReadingCount: number
   *   totalReadingCount: number
   *   blockPageNumber: number | null
   *   pageNumber: number | null
   *   regionLeft: number | null
   *   regionTop: number | null
   *   regionRight: number | null
   *   regionBottom: number | null
   * }} - The row.
   */
  buildAgreementAttribute ({
    fieldConsensus,
  }) {
    return {
      BatchFileId: this.batchFileId,
      fieldPath: fieldConsensus.fieldPath,
      consensusValue: fieldConsensus.consensusValue,
      CurrencyId: this.findCurrencyId({
        fieldConsensus,
      }),
      agreedReadingCount: fieldConsensus.agreedReadingCount,
      totalReadingCount: fieldConsensus.totalReadingCount,
      // Identity, not provenance: known from the match, and still known when every field of the
      // block came out with no consensus. Null on a field that belongs to no block.
      blockPageNumber: fieldConsensus.blockPageNumber,
      pageNumber: fieldConsensus.pageNumber,
      // The four are null together, which is what a value read without being located looks like
      // (`FR-131`). They hold the region of the first reading that produced the consensus value.
      regionLeft: fieldConsensus.region?.left ?? null,
      regionTop: fieldConsensus.region?.top ?? null,
      regionRight: fieldConsensus.region?.right ?? null,
      regionBottom: fieldConsensus.region?.bottom ?? null,
    }
  }

  /**
   * Find which `TBL-15` row a field's currency is, if the field has one at all.
   *
   * **A code the master does not carry stores as null**, and the reading keeps its own code in the
   * consensus either way. The column is a foreign key, so an unrecognized currency has no id to
   * hold - and it has already produced `NG-002`, because a code nothing in `TBL-15` matches cannot
   * equal the cover sheet's (`ENG-02` rule 4).
   *
   * @param {{
   *   fieldConsensus: verification.ReadingFieldConsensus
   * }} params - Parameters of this method.
   * @returns {number | null} - The id, or null on a field that is not an amount.
   */
  findCurrencyId ({
    fieldConsensus,
  }) {
    return this.currencyResolver.findCurrencyId({
      currencyCode: fieldConsensus.currencyCode,
    })
  }
}

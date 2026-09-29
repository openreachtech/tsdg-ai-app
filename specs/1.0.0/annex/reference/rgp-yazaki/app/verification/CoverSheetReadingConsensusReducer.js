import FIELD_PATH_CONSTANT_HASH from '../constants/fieldPath.js'

import CoverSheetFieldPath from './CoverSheetFieldPath.js'
import FieldConsensusResolver from './FieldConsensusResolver.js'
import ReadingValueCanonicalizer from './ReadingValueCanonicalizer.js'

const {
  FIELD_PATH,
} = FIELD_PATH_CONSTANT_HASH

/*
 * How `TBL-14.field_path` writes a field of a cover sheet.
 *
 * `CoverSheetFieldPath` owns the format because `ENG-04` reads these paths back, and a format
 * spelled in both places is a format that can come to differ in one of them.
 */
const {
  rowMemberName: COVER_SHEET_ROW_MEMBER_NAME,
  statedSubtotalMemberName: STATED_SUBTOTAL_MEMBER_NAME,
} = CoverSheetFieldPath

/**
 * `ENG-05` on the cover sheet: the readings of one workbook, reduced to one set of values with an
 * agreement level on each.
 *
 * **The same reduction its sibling performs, over the other branch of §7.2.** What comes out has the
 * shape of a reading with an agreement level where each envelope was, and `TBL-14` is the same rows
 * again, flat - so check ⑤ is handed one answer per field rather than three, exactly as checks ②③④
 * are (`FR-144`).
 *
 * **Rows are matched by their own row number and never by position** (§6.2). Each reading produces
 * its own array, so reducing `rows[1].*` positionally would compare whatever each reading happened
 * to list second - and a reading that missed one row would shift every row after it by one and
 * report a whole worksheet of disagreements. A reading that never listed row 7 contributes nothing
 * to row 7, which reduces exactly as a field it looked at and could not make out.
 *
 * **Subtotals are matched by currency for the same reason.** There is one per currency and nothing
 * else tells two of them apart, so the currency is identity here rather than a read value.
 *
 * **Nothing here is asked how sure it is** (`DR-14` `ADR-18`). The number that reaches the operator
 * is the output of counting stored readings, and `NFR-031` requires it to be recomputable from
 * `TBL-06` plus the currency master and nothing else.
 */
export default class CoverSheetReadingConsensusReducer {
  /**
   * Constructor.
   *
   * @param {{
   *   normalizedExtractions: Array<ai.NormalizedCoverSheetExtraction>
   *   readingValueCanonicalizer: ReadingValueCanonicalizer
   * }} params - Parameters of this constructor.
   */
  constructor ({
    normalizedExtractions,
    readingValueCanonicalizer,
  }) {
    this.normalizedExtractions = normalizedExtractions
    this.readingValueCanonicalizer = readingValueCanonicalizer
  }

  /**
   * Factory method.
   *
   * @param {{
   *   normalizedExtractions: Array<ai.NormalizedCoverSheetExtraction>
   *   readingValueCanonicalizer?: ReadingValueCanonicalizer
   * }} params - Parameters of this method.
   * @returns {CoverSheetReadingConsensusReducer} - Instance of this class.
   */
  static create ({
    normalizedExtractions,
    readingValueCanonicalizer = this.createReadingValueCanonicalizer(),
  }) {
    return new this({
      normalizedExtractions,
      readingValueCanonicalizer,
    })
  }

  /**
   * Create the canonicalization every value is compared through.
   *
   * @returns {ReadingValueCanonicalizer} - The canonicalization.
   */
  static createReadingValueCanonicalizer () {
    return ReadingValueCanonicalizer.create()
  }

  /**
   * Reduce every reading of this cover sheet to one consensus.
   *
   * @returns {verification.CoverSheetReadingConsensus} - The consensus, in the shape of a reading.
   */
  reduceReadings () {
    const reducedFields = {
      rows: this.reduceRows(),
      statedSubtotals: this.reduceStatedSubtotals(),
    }

    return {
      ...reducedFields,
      fieldConsensuses: this.collectFieldConsensuses({
        reducedFields,
      }),
    }
  }

  /**
   * Reduce every row the readings between them found, in worksheet order.
   *
   * @returns {Array<verification.ConsensusCoverSheetRow>} - The rows.
   */
  reduceRows () {
    return this.collectRowNumbers()
      .map(rowNumber => this.reduceRow({
        rowNumber,
      }))
  }

  /**
   * Collect every row number any reading reported, once each, in worksheet order.
   *
   * **Ascending rather than in the order they arrived.** The number is the row's identity, so
   * ordering by it is what makes the reduced set the same set however the readings happened to be
   * ordered - and it is the order the worksheet itself is in, which is the order an operator reads.
   *
   * @returns {Array<number>} - The row numbers.
   */
  collectRowNumbers () {
    const rowNumbers = this.normalizedExtractions
      .flatMap(normalizedExtraction =>
        normalizedExtraction.rows
          .map(row => row.rowNumber)
      )

    return Array.from(new Set(rowNumbers))
      .toSorted((one, another) => one - another)
  }

  /**
   * Reduce the three read fields of one row.
   *
   * @param {{
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {verification.ConsensusCoverSheetRow} - The row.
   */
  reduceRow ({
    rowNumber,
  }) {
    const readingRows = this.collectReadingRows({
      rowNumber,
    })

    return {
      rowNumber,
      debitNoteNumber: this.reduceRowText({
        rowNumber,
        readingRows,
        memberName: COVER_SHEET_ROW_MEMBER_NAME.DEBIT_NOTE_NUMBER,
        strippedFieldPath: FIELD_PATH.COVER_SHEET.ROW_DEBIT_NOTE_NUMBER,
      }),
      currencyCode: this.reduceRowText({
        rowNumber,
        readingRows,
        memberName: COVER_SHEET_ROW_MEMBER_NAME.CURRENCY_CODE,
        strippedFieldPath: FIELD_PATH.COVER_SHEET.ROW_CURRENCY_CODE,
      }),
      amount: this.reduceRowAmount({
        rowNumber,
        readingRows,
      }),
    }
  }

  /**
   * Collect what each reading made of one row, in reading order.
   *
   * **A reading that never listed the row contributes `null`**, and the position is kept rather than
   * dropped. The denominator of an agreement is how many readings were taken, not how many happened
   * to mention this row - a row two of three readings saw is `2/3` and not `2/2` (`TERM-15`).
   *
   * @param {{
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedCoverSheetRow | null>} - One entry per reading.
   */
  collectReadingRows ({
    rowNumber,
  }) {
    return this.normalizedExtractions
      .map(normalizedExtraction => this.findReadingRow({
        normalizedExtraction,
        rowNumber,
      }))
  }

  /**
   * Find what one reading made of one row, or nothing when it never listed it.
   *
   * @param {{
   *   normalizedExtraction: ai.NormalizedCoverSheetExtraction
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedCoverSheetRow | null} - The row, or null.
   */
  findReadingRow ({
    normalizedExtraction,
    rowNumber,
  }) {
    return normalizedExtraction.rows
      .find(row => row.rowNumber === rowNumber)
      ?? null
  }

  /**
   * Reduce one string field of one row.
   *
   * @param {{
   *   rowNumber: number
   *   readingRows: Array<ai.NormalizedCoverSheetRow | null>
   *   memberName: 'debitNoteNumber' | 'currencyCode'
   *   strippedFieldPath: string
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reduceRowText ({
    rowNumber,
    readingRows,
    memberName,
    strippedFieldPath,
  }) {
    return this.resolveFieldConsensus({
      fieldPath: this.buildRowFieldPath({
        rowNumber,
        memberName,
      }),
      strippedFieldPath,
      readingFieldValues: readingRows
        .map(readingRow => this.buildTextFieldValue({
          readingEnvelope: readingRow?.[memberName] ?? null,
        })),
    })
  }

  /**
   * Build the storage key one field of one row is written under.
   *
   * @param {{
   *   rowNumber: number
   *   memberName: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, such as `rows[4].amount`.
   */
  buildRowFieldPath ({
    rowNumber,
    memberName,
  }) {
    return CoverSheetFieldPath.createForRow({
      rowNumber,
    })
      .buildRowMemberPath({
        memberName,
      })
  }

  /**
   * Reduce the amount of one row.
   *
   * @param {{
   *   rowNumber: number
   *   readingRows: Array<ai.NormalizedCoverSheetRow | null>
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reduceRowAmount ({
    rowNumber,
    readingRows,
  }) {
    return this.resolveFieldConsensus({
      fieldPath: this.buildRowFieldPath({
        rowNumber,
        memberName: COVER_SHEET_ROW_MEMBER_NAME.AMOUNT,
      }),
      strippedFieldPath: FIELD_PATH.COVER_SHEET.ROW_AMOUNT,
      readingFieldValues: readingRows
        .map(readingRow => this.buildAmountFieldValue({
          readingEnvelope: readingRow?.amount ?? null,
        })),
    })
  }

  /**
   * Reduce every subtotal the readings between them found, one per currency.
   *
   * @returns {Array<verification.ConsensusStatedSubtotal>} - The subtotals.
   */
  reduceStatedSubtotals () {
    return this.collectSubtotalCurrencyCodes()
      .map(currencyCode => this.reduceStatedSubtotal({
        currencyCode,
      }))
  }

  /**
   * Collect every currency any reading stated a subtotal in, once each, in code order.
   *
   * @returns {Array<string>} - The currency codes.
   */
  collectSubtotalCurrencyCodes () {
    const currencyCodes = this.normalizedExtractions
      .flatMap(normalizedExtraction =>
        normalizedExtraction.statedSubtotals
          .map(statedSubtotal => statedSubtotal.currencyCode)
      )

    return Array.from(new Set(currencyCodes))
      .toSorted()
  }

  /**
   * Reduce the one read field of one stated subtotal.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {verification.ConsensusStatedSubtotal} - The subtotal.
   */
  reduceStatedSubtotal ({
    currencyCode,
  }) {
    return {
      currencyCode,
      amount: this.resolveFieldConsensus({
        fieldPath: this.buildStatedSubtotalFieldPath({
          currencyCode,
        }),
        strippedFieldPath: FIELD_PATH.COVER_SHEET.STATED_SUBTOTAL_AMOUNT,
        readingFieldValues: this.collectReadingSubtotals({
          currencyCode,
        })
          .map(readingSubtotal => this.buildAmountFieldValue({
            readingEnvelope: readingSubtotal?.amount ?? null,
          })),
      }),
    }
  }

  /**
   * Build the storage key the amount of one stated subtotal is written under.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, such as `statedSubtotals[JPY].amount`.
   */
  buildStatedSubtotalFieldPath ({
    currencyCode,
  }) {
    return CoverSheetFieldPath.createForStatedSubtotal({
      currencyCode,
    })
      .buildStatedSubtotalMemberPath({
        memberName: STATED_SUBTOTAL_MEMBER_NAME.AMOUNT,
      })
  }

  /**
   * Collect what each reading made of one currency's subtotal, in reading order.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedStatedSubtotal | null>} - One entry per reading.
   */
  collectReadingSubtotals ({
    currencyCode,
  }) {
    return this.normalizedExtractions
      .map(normalizedExtraction => this.findReadingSubtotal({
        normalizedExtraction,
        currencyCode,
      }))
  }

  /**
   * Find what one reading made of one currency's subtotal, or nothing when it stated none.
   *
   * @param {{
   *   normalizedExtraction: ai.NormalizedCoverSheetExtraction
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedStatedSubtotal | null} - The subtotal, or null.
   */
  findReadingSubtotal ({
    normalizedExtraction,
    currencyCode,
  }) {
    return normalizedExtraction.statedSubtotals
      .find(statedSubtotal => statedSubtotal.currencyCode === currencyCode)
      ?? null
  }

  /**
   * Count one field's readings and label the answer with the paths that name the field.
   *
   * `blockIndex` and `blockPageNumber` are null on every field of a cover sheet: both belong to an
   * approval block, and a spreadsheet has none. The index a cover-sheet finding travels with is the
   * row number or the currency code, and both are already inside `fieldPath` (§6.2).
   *
   * @param {{
   *   fieldPath: string
   *   strippedFieldPath: string
   *   readingFieldValues: Array<verification.ReadingFieldValue>
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  resolveFieldConsensus ({
    fieldPath,
    strippedFieldPath,
    readingFieldValues,
  }) {
    return {
      fieldPath,
      strippedFieldPath,
      blockIndex: null,
      blockPageNumber: null,
      ...this.createFieldConsensusResolver({
        readingFieldValues,
      })
        .resolveConsensus(),
    }
  }

  /**
   * Create the count one field's readings are reduced by.
   *
   * @param {{
   *   readingFieldValues: Array<verification.ReadingFieldValue>
   * }} params - Parameters of this method.
   * @returns {FieldConsensusResolver} - The count.
   */
  createFieldConsensusResolver ({
    readingFieldValues,
  }) {
    return FieldConsensusResolver.create({
      readingFieldValues,
    })
  }

  /**
   * Canonicalize what one reading made of a string field.
   *
   * **A null envelope is a row or a subtotal this reading never listed**, and it reduces exactly as
   * a field the reading looked at and could not make out: absent, with no page and no region.
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<string> | null
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - What this reading contributes.
   */
  buildTextFieldValue ({
    readingEnvelope,
  }) {
    return {
      canonicalValue: this.readingValueCanonicalizer.canonicalizeText({
        text: readingEnvelope?.value ?? null,
      }),
      currencyCode: null,
      pageNumber: readingEnvelope?.pageNumber ?? null,
      region: readingEnvelope?.region ?? null,
    }
  }

  /**
   * Canonicalize what one reading made of an amount, as an exact count of minor units.
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<ai.ReadingAmount> | null
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - What this reading contributes.
   */
  buildAmountFieldValue ({
    readingEnvelope,
  }) {
    const canonicalValue = this.readingValueCanonicalizer.canonicalizeAmount({
      readingAmount: readingEnvelope?.value ?? null,
    })

    return {
      canonicalValue,
      currencyCode: this.resolveAmountCurrencyCode({
        readingEnvelope,
        canonicalValue,
      }),
      pageNumber: readingEnvelope?.pageNumber ?? null,
      region: readingEnvelope?.region ?? null,
    }
  }

  /**
   * Read which currency one reading stated an amount in.
   *
   * **Null exactly when the figure is**, so a currency never outlives the amount it belongs to: a
   * code with no figure describes nothing, and two readings that both failed to get a figure off the
   * sheet agree that there was nothing to read whatever currency they thought they saw (`DR-05`).
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<ai.ReadingAmount> | null
   *   canonicalValue: string | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null when no figure was read.
   */
  resolveAmountCurrencyCode ({
    readingEnvelope,
    canonicalValue,
  }) {
    if (canonicalValue === null) {
      return null
    }

    return this.readingValueCanonicalizer.canonicalizeText({
      text: readingEnvelope?.value
        ?.currencyCode
        ?? null,
    })
  }

  /**
   * Flatten every reduced field into the rows `TBL-14` stores.
   *
   * @param {{
   *   reducedFields: {
   *     rows: Array<verification.ConsensusCoverSheetRow>
   *     statedSubtotals: Array<verification.ConsensusStatedSubtotal>
   *   }
   * }} params - Parameters of this method.
   * @returns {Array<verification.ReadingFieldConsensus>} - Every field, flat.
   */
  collectFieldConsensuses ({
    reducedFields,
  }) {
    return [
      ...reducedFields.rows
        .flatMap(consensusRow => this.collectRowFieldConsensuses({
          consensusRow,
        })),
      ...reducedFields.statedSubtotals
        .map(consensusStatedSubtotal => consensusStatedSubtotal.amount),
    ]
  }

  /**
   * List the three fields of one row.
   *
   * @param {{
   *   consensusRow: verification.ConsensusCoverSheetRow
   * }} params - Parameters of this method.
   * @returns {Array<verification.ReadingFieldConsensus>} - The fields.
   */
  collectRowFieldConsensuses ({
    consensusRow,
  }) {
    return [
      consensusRow.debitNoteNumber,
      consensusRow.currencyCode,
      consensusRow.amount,
    ]
  }
}

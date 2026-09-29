import FIELD_PATH_CONSTANT_HASH from '../constants/fieldPath.js'
import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

import ReadingValueCanonicalizer from './ReadingValueCanonicalizer.js'

const {
  FIELD_PATH,
} = FIELD_PATH_CONSTANT_HASH
const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

/*
 * What every reading said about a field of a row none of them listed.
 *
 * Nothing, and all of them said it - which is the count `ENG-05` would have arrived at had the row
 * appeared in any reading at all. See `#countAgreedReadings()`.
 */
const NO_READING_LISTED_THE_ROW = null

/**
 * `ENG-04`, check ⑤: what the AI read off the cover sheet against what the parse made of it.
 *
 * **Rows are matched by `row_number`, never by content** (§6.1). Matching on the debit note number
 * would pair a row the reading misread with whichever parsed row happens to share the misreading,
 * and then report agreement - the row number is the one key both sides derive from position rather
 * than from perception. A subtotal is matched by its currency code for the same reason: there is one
 * per currency, and nothing else tells two of them apart.
 *
 * **Nothing here writes an `is_*_passed` value and nothing here writes a `TBL-11` row** (`DR-01`
 * `FR-092`). The same batch judges identically with the cover-sheet read off, which is what makes
 * this a finding about the system rather than about the document - and `NG-007` lives in `TBL-16`
 * precisely so it can be said once about a worksheet row instead of once per debit note of a batch.
 *
 * **The reading side arrives canonical, and the parse side is made to match it** (§6.1 step 1).
 * `ENG-05` compared and kept every read value trimmed and upper-cased, with amounts as exact counts
 * of minor units, so what reaches here is already in that form - the workbook's own
 * `hib-002/yevmp26-003 ` is not. Canonicalizing the parse side through the same class is what keeps
 * check ⑤ a measurement of the document rather than of the two sides' punctuation, and comparing
 * amounts as minor units is what keeps it the figure `ENG-01` and `ENG-02` judged on (`DR-05`).
 *
 * **`ENG-02`'s normalization is deliberately not used here.** That one strips slashes, hyphens and
 * spaces so a sheet's `HIB-002/YEVMP26-003` matches a file's `HIB-002YEVMP26-003`, which is the
 * right rule for pairing a PDF with a row and the wrong one for this: a reading that dropped the
 * separator read something different from what the sheet prints, and check ⑤ exists to say so.
 *
 * **The parse is walked and the reading is looked up, never the reverse.** A row the reading never
 * returned is a disagreement about that row; a row the reading returned that the sheet does not have
 * is not a disagreement about anything the sheet says, and there is no parsed `row_number` for its
 * finding to name. `DR-01` read from the other end: the parse is the side that judged.
 */
export default class CoverSheetReadingAgreementVerifier {
  /**
   * Constructor.
   *
   * @param {{
   *   parsedRows: Array<verification.ParsedCoverSheetRow>
   *   parsedStatedSubtotals: Array<model.CoverSheetStatedSubtotal>
   *   readingConsensus: verification.CoverSheetReadingConsensus
   *   totalReadingCount: number
   *   fileName: string
   *   sheetName: string
   *   readingValueCanonicalizer: ReadingValueCanonicalizer
   * }} params - Parameters of this constructor.
   */
  constructor ({
    parsedRows,
    parsedStatedSubtotals,
    readingConsensus,
    totalReadingCount,
    fileName,
    sheetName,
    readingValueCanonicalizer,
  }) {
    this.parsedRows = parsedRows
    this.parsedStatedSubtotals = parsedStatedSubtotals
    this.readingConsensus = readingConsensus
    this.totalReadingCount = totalReadingCount
    this.fileName = fileName
    this.sheetName = sheetName
    this.readingValueCanonicalizer = readingValueCanonicalizer
  }

  /**
   * Factory method.
   *
   * @param {{
   *   parsedRows: Array<verification.ParsedCoverSheetRow>
   *   parsedStatedSubtotals: Array<model.CoverSheetStatedSubtotal>
   *   readingConsensus: verification.CoverSheetReadingConsensus
   *   totalReadingCount: number
   *   fileName: string
   *   sheetName: string
   *   readingValueCanonicalizer?: ReadingValueCanonicalizer
   * }} params - Parameters of this method.
   * @returns {CoverSheetReadingAgreementVerifier} - Instance of this class.
   * @public
   */
  static create ({
    parsedRows,
    parsedStatedSubtotals,
    readingConsensus,
    totalReadingCount,
    fileName,
    sheetName,
    readingValueCanonicalizer = this.createReadingValueCanonicalizer(),
  }) {
    return new this({
      parsedRows,
      parsedStatedSubtotals,
      readingConsensus,
      totalReadingCount,
      fileName,
      sheetName,
      readingValueCanonicalizer,
    })
  }

  /**
   * Create the canonicalization both sides are compared through.
   *
   * The same class `ENG-05` reduced the readings with, rather than a second spelling of the same
   * rules: a comparison made in one canonical form against a value stored in another would report
   * disagreements that exist only between the two implementations.
   *
   * @returns {ReadingValueCanonicalizer} - The canonicalization.
   */
  static createReadingValueCanonicalizer () {
    return ReadingValueCanonicalizer.create()
  }

  /**
   * Report every field the reading and the parse do not agree on.
   *
   * @returns {Array<verification.NgReason>} - One reason per disagreeing field, rows before subtotals.
   * @public
   */
  verifyReadingAgreement () {
    return this.verifyParsedRows()
      .concat(
        this.verifyParsedStatedSubtotals()
      )
  }

  /**
   * Compare every line item the parse read.
   *
   * @returns {Array<verification.NgReason>} - One reason per disagreeing field.
   */
  verifyParsedRows () {
    return this.parsedRows
      .flatMap(parsedRow => this.verifyParsedRow({
        parsedRow,
      }))
  }

  /**
   * Compare the three fields of one line item.
   *
   * @param {{
   *   parsedRow: verification.ParsedCoverSheetRow
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - One reason per disagreeing field.
   */
  verifyParsedRow ({
    parsedRow,
  }) {
    const consensusRow = this.findConsensusRow({
      rowNumber: parsedRow.rowNumber,
    })

    return this.buildRowComparisons({
      parsedRow,
      consensusRow,
    })
      .flatMap(fieldComparison => this.reportFieldComparison({
        fieldComparison,
      }))
  }

  /**
   * Find what the readings agreed one line item says.
   *
   * @param {{
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {verification.ConsensusCoverSheetRow | null} - The row, or null when no reading listed it.
   */
  findConsensusRow ({
    rowNumber,
  }) {
    return this.readingConsensus
      .rows
      .find(consensusRow => consensusRow.rowNumber === rowNumber)
      ?? null
  }

  /**
   * Pair each field of one line item with what the readings made of it.
   *
   * @param {{
   *   parsedRow: verification.ParsedCoverSheetRow
   *   consensusRow: verification.ConsensusCoverSheetRow | null
   * }} params - Parameters of this method.
   * @returns {Array<FieldComparison>} - The three fields, in the order §7.2 lists them.
   */
  buildRowComparisons ({
    parsedRow,
    consensusRow,
  }) {
    return [
      {
        strippedFieldPath: FIELD_PATH.COVER_SHEET.ROW_DEBIT_NOTE_NUMBER,
        rowNumber: parsedRow.rowNumber,
        currencyCode: null,
        parsedValue: this.canonicalizeText({
          text: parsedRow.debitNoteNumber,
        }),
        fieldConsensus: consensusRow?.debitNoteNumber ?? null,
      },
      {
        strippedFieldPath: FIELD_PATH.COVER_SHEET.ROW_CURRENCY_CODE,
        rowNumber: parsedRow.rowNumber,
        currencyCode: null,
        parsedValue: this.canonicalizeText({
          text: parsedRow.currencyCode,
        }),
        fieldConsensus: consensusRow?.currencyCode ?? null,
      },
      {
        strippedFieldPath: FIELD_PATH.COVER_SHEET.ROW_AMOUNT,
        rowNumber: parsedRow.rowNumber,
        currencyCode: null,
        parsedValue: this.canonicalizeMinorUnits({
          minorUnits: parsedRow.amountMinorUnits,
        }),
        fieldConsensus: consensusRow?.amount ?? null,
      },
    ]
  }

  /**
   * Compare every subtotal the parse read off the totals block.
   *
   * @returns {Array<verification.NgReason>} - One reason per disagreeing subtotal.
   */
  verifyParsedStatedSubtotals () {
    return this.parsedStatedSubtotals
      .flatMap(parsedStatedSubtotal => this.verifyParsedStatedSubtotal({
        parsedStatedSubtotal,
      }))
  }

  /**
   * Compare the one field a subtotal carries.
   *
   * A subtotal's currency code is its identity rather than one of its read values, so the amount is
   * all there is to compare - which is why `statedSubtotal.currencyCode` is not in §6.2's stripped
   * vocabulary either.
   *
   * @param {{
   *   parsedStatedSubtotal: model.CoverSheetStatedSubtotal
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - The reason, or nothing when the two agree.
   */
  verifyParsedStatedSubtotal ({
    parsedStatedSubtotal,
  }) {
    const consensusStatedSubtotal = this.findConsensusStatedSubtotal({
      currencyCode: parsedStatedSubtotal.currencyCode,
    })

    return this.reportFieldComparison({
      fieldComparison: {
        strippedFieldPath: FIELD_PATH.COVER_SHEET.STATED_SUBTOTAL_AMOUNT,
        rowNumber: null,
        currencyCode: parsedStatedSubtotal.currencyCode,
        parsedValue: this.canonicalizeMinorUnits({
          minorUnits: parsedStatedSubtotal.amountMinorUnits,
        }),
        fieldConsensus: consensusStatedSubtotal?.amount ?? null,
      },
    })
  }

  /**
   * Find what the readings agreed one currency's subtotal says.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {verification.ConsensusStatedSubtotal | null} - The subtotal, or null when no reading listed it.
   */
  findConsensusStatedSubtotal ({
    currencyCode,
  }) {
    return this.readingConsensus
      .statedSubtotals
      .find(consensusStatedSubtotal => consensusStatedSubtotal.currencyCode === currencyCode)
      ?? null
  }

  /**
   * Report one field, as the nothing-or-one-reason a caller can flatten.
   *
   * @param {{
   *   fieldComparison: FieldComparison
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - The reason, or nothing when the two sides agree.
   */
  reportFieldComparison ({
    fieldComparison,
  }) {
    const ngReason = this.buildDisagreementNgReason({
      fieldComparison,
    })

    return ngReason ?? []
  }

  /**
   * Build the reason one field is reported by, or nothing when the two sides say the same thing.
   *
   * **`fieldPath` travels stripped, with its index beside it** (`DR-13`). It lands inside a rendered
   * sentence, so a raw `rows[4].amount` would put an English identifier in the middle of a Japanese
   * one - and an indexed literal could never be a dictionary key, which is what makes the vocabulary
   * closed. `rowNumber` is the index of a row and `currencyCode` that of a subtotal; both are sent
   * with one of them null, so the shape of a reason does not depend on which it is about.
   *
   * **`parsedValue` and `readValue` carry the form the comparison was made in**, which for an amount
   * is its count of minor units. Sending a re-formatted figure would mean the finding no longer
   * shows what was actually compared, and `NFR-031` requires exactly that to be recomputable.
   *
   * @param {{
   *   fieldComparison: FieldComparison
   * }} params - Parameters of this method.
   * @returns {verification.NgReason | null} - The reason, or null when the reading matches the parse.
   */
  buildDisagreementNgReason ({
    fieldComparison: {
      strippedFieldPath,
      rowNumber,
      currencyCode,
      parsedValue,
      fieldConsensus,
    },
  }) {
    const readValue = fieldConsensus?.consensusValue ?? null

    if (readValue === parsedValue) {
      return null
    }

    return {
      NgReasonCodeId: NG_REASON_CODE.COVER_SHEET_DISAGREEMENT.ID,
      parameters: {
        fileName: this.fileName,
        sheetName: this.sheetName,
        fieldPath: strippedFieldPath,
        rowNumber,
        currencyCode,
        parsedValue,
        readValue,
        agreedReadingCount: this.countAgreedReadings({
          fieldConsensus,
        }),
        totalReadingCount: this.totalReadingCount,
      },
    }
  }

  /**
   * Count how many readings produced what the reading side says.
   *
   * **A field with no consensus at all belongs to a row every reading was silent about**, so every
   * reading agreed there was nothing there - the count `ENG-05` step 5 would have arrived at had the
   * row appeared anywhere. Reporting `0` instead would say the readings were never taken, which is
   * the one thing the denominator beside it already denies (`DR-14` `NFR-031`).
   *
   * @param {{
   *   fieldConsensus: verification.ReadingFieldConsensus | null
   * }} params - Parameters of this method.
   * @returns {number} - The numerator of `TERM-15`.
   */
  countAgreedReadings ({
    fieldConsensus,
  }) {
    if (fieldConsensus === NO_READING_LISTED_THE_ROW) {
      return this.totalReadingCount
    }

    return fieldConsensus.agreedReadingCount
  }

  /**
   * Canonicalize a string the parse read, as `ENG-05` canonicalized the readings.
   *
   * @param {{
   *   text: string
   * }} params - Parameters of this method.
   * @returns {string | null} - The canonical form.
   */
  canonicalizeText ({
    text,
  }) {
    return this.readingValueCanonicalizer.canonicalizeText({
      text,
    })
  }

  /**
   * Canonicalize an amount the parse read, which is already an exact count of minor units.
   *
   * The shift `ENG-05` makes on the reading side was made at parse time on this one (`ENG-01` step
   * 3), so only the spelling is left to align.
   *
   * @param {{
   *   minorUnits: number
   * }} params - Parameters of this method.
   * @returns {string | null} - The canonical form.
   */
  canonicalizeMinorUnits ({
    minorUnits,
  }) {
    return this.readingValueCanonicalizer.canonicalizeCount({
      countLike: minorUnits,
    })
  }
}

/**
 * One field of one row or one subtotal, with both sides of it.
 *
 * @typedef {{
 *   strippedFieldPath: string
 *   rowNumber: number | null
 *   currencyCode: string | null
 *   parsedValue: string | null
 *   fieldConsensus: verification.ReadingFieldConsensus | null
 * }} FieldComparison
 */

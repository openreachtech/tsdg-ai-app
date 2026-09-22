import NG_DETAIL_CODE_CONSTANT_HASH from '../constants/ngDetailCode.js'
import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

import CoverSheetRowMatcher from './CoverSheetRowMatcher.js'
import CurrencyResolver from './CurrencyResolver.js'
import DebitNoteNumberNormalizer from './DebitNoteNumberNormalizer.js'
import MinorUnitAmountConverter from './MinorUnitAmountConverter.js'

const {
  NG_DETAIL_CODE,
} = NG_DETAIL_CODE_CONSTANT_HASH

const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

const {
  UNMATCHED_DEBIT_NOTE,
} = NG_DETAIL_CODE

/*
 * A stored amount is already an exact count of minor units, so reading one back shifts by nothing.
 * The currency's own scale belongs to the parse that wrote the column, not to reading it.
 */
const STORED_AMOUNT_SCALE = 0

/*
 * The page both amount findings point the operator at (`ADR-22`).
 *
 * **It is a constant rather than a reading, and that is what makes it fillable here.** `ADR-22`
 * fixes the debit note's own total to page 1 and refuses to look anywhere else, so an amount that
 * was read came from page 1 (`NG-002`), and an amount that was not is a page 1 that did not yield
 * one (`NG-005`). Neither number is measured, so neither waits for provenance (`ADR-17`).
 *
 * If `OPEN-4` ever reverses `ADR-22`, this is one of the places that changes.
 */
const TOTAL_AMOUNT_PAGE_NUMBER = 1

/*
 * Which way a difference runs, from the debit note's side (`NG-002`).
 *
 * Keys rather than words: the sentence "the PDF is {difference} {higher|lower}" is composed by the
 * client from its own dictionary, and a parameter carrying the English word would be the same
 * `DR-13` breach `detailCode` was introduced to fix.
 */
const DIFFERENCE_DIRECTION = {
  HIGHER: 'higher',
  LOWER: 'lower',
}

/**
 * Check ③: does the amount read from the debit note equal its cover-sheet row (`ENG-02` `FR-031`)?
 *
 * Four things can go wrong, and each has its own reason because each sends the operator somewhere
 * different: the document matched no row or several (`NG-006`, open the cover sheet), its amount could
 * not be read (`NG-005`, open the PDF), the two amounts differ, or they are in different currencies
 * (`NG-002` for both, compare them). They are reported together when they apply together - `FR-041`
 * asks for every applicable reason, not the first one found.
 *
 * **A matched row in another currency is `NG-002`, never a conversion** (`ENG-02` rule 4 `DR-05`).
 * There is no rate in this system and there will not be one: the two figures are incomparable, and
 * reporting them side by side with their currencies is the honest answer. It is also why the
 * difference travels as null on that reason - there is no difference to state between USD and JPY.
 *
 * **Every comparison is between exact integers** (`FR-035` `DR-05`). An unreadable amount is refused
 * rather than converted, so no comparison is ever made against a value nobody could read.
 *
 * **It takes values, not a reading.** The figure arrives already counted in minor units and the
 * number already out of its envelope, so this class knows nothing about how many times the document
 * was read or what shape a provider answers in. That is what let `ENG-05` become the source of these
 * values without this file changing.
 *
 * **`isAgreedAmount` is the one thing it is told about the reading, and only to keep `NG-005`
 * truthful.** A null figure means either that nobody could get one off the page or that the readings
 * each got a different one, and `NG-005`'s sentence claims the first outright (§6.2). The second is
 * `NG-008`, raised once beside the checks - so this check stays failed either way and reports only
 * the finding that is true.
 */
export default class DebitNoteAmountVerifier {
  /**
   * Constructor.
   *
   * @param {{
   *   debitNoteNumber: string | null
   *   extractedAmountMinorUnits: number | null
   *   extractedCurrencyCode: string | null
   *   isAgreedAmount: boolean
   *   coverSheetRows: Array<verification.ComparedCoverSheetRow>
   *   fileName: string
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    debitNoteNumber,
    extractedAmountMinorUnits,
    extractedCurrencyCode,
    isAgreedAmount,
    coverSheetRows,
    fileName,
    currencyResolver,
  }) {
    this.debitNoteNumber = debitNoteNumber
    this.extractedAmountMinorUnits = extractedAmountMinorUnits
    this.extractedCurrencyCode = extractedCurrencyCode
    this.isAgreedAmount = isAgreedAmount
    this.coverSheetRows = coverSheetRows
    this.fileName = fileName
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   debitNoteNumber: string | null
   *   extractedAmountMinorUnits: number | null
   *   extractedCurrencyCode: string | null
   *   isAgreedAmount: boolean
   *   coverSheetRows: Array<verification.ComparedCoverSheetRow>
   *   fileName: string
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {DebitNoteAmountVerifier} - Instance of this class.
   */
  static create ({
    debitNoteNumber,
    extractedAmountMinorUnits,
    extractedCurrencyCode,
    isAgreedAmount,
    coverSheetRows,
    fileName,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      debitNoteNumber,
      extractedAmountMinorUnits,
      extractedCurrencyCode,
      isAgreedAmount,
      coverSheetRows,
      fileName,
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
   * Verify the amount against the cover sheet.
   *
   * The check passes when it produced no reason to fail, rather than by a condition of its own. The
   * two cannot then drift apart, which is what would let a debit note carry `NG-002` and still be
   * reported as having passed check ③. The one addition to that rule is an amount that was never
   * compared - see `#isComparedAmountPassed()`.
   *
   * @returns {verification.AmountCheckResult} - What check ③ concluded.
   */
  verifyAmount () {
    const matchedRows = this.collectMatchedRows()

    const matchedRow = this.findMatchedRow({
      matchedRows,
    })

    const ngReasons = [
      ...this.buildUnmatchedNgReasons({
        matchedRows,
      }),
      ...this.buildUnreadableAmountNgReasons(),
      ...this.buildMismatchNgReasons({
        matchedRow,
      }),
    ]

    return {
      isAmountPassed: this.isComparedAmountPassed({
        ngReasons,
      }),
      CoverSheetRowId: matchedRow?.id ?? null,
      ngReasons,
    }
  }

  /**
   * Answer whether the amount both was compared and came out equal.
   *
   * **A null amount never passes, whichever way it came to be null** (`FR-143`, 20-usecases §SEQ).
   * There was nothing to compare, and a check that did not run did not pass (`DR-03`). Where the
   * readings agreed there was nothing to read, `NG-005` above already says so; where they disagreed,
   * the reason is `NG-008` and it is raised beside the checks rather than inside this one - so the
   * condition is stated here instead of being inferred from a list this check does not own.
   *
   * @param {{
   *   ngReasons: Array<verification.NgReason>
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the amount equals its cover-sheet row.
   */
  isComparedAmountPassed ({
    ngReasons,
  }) {
    if (this.extractedAmountMinorUnits === null) {
      return false
    }

    return ngReasons.length === 0
  }

  /**
   * Collect the cover-sheet rows this debit note could belong to.
   *
   * @returns {Array<verification.ComparedCoverSheetRow>} - The candidates.
   */
  collectMatchedRows () {
    return this.createCoverSheetRowMatcher()
      .collectMatchedRows()
  }

  /**
   * Create the matching this check is built on.
   *
   * @returns {CoverSheetRowMatcher} - The matcher.
   */
  createCoverSheetRowMatcher () {
    return CoverSheetRowMatcher.create({
      debitNoteNumber: this.debitNoteNumber,
      coverSheetRows: this.coverSheetRows,
      fileName: this.fileName,
    })
  }

  /**
   * Find the one row this debit note belongs to.
   *
   * **Several candidates answer none.** Picking one of them - the first, the closest amount, the
   * longest number - would pair a document with a row on the strength of a guess, and the judgment
   * that followed would look exactly as confident as a correct one (`FR-037`).
   *
   * @param {{
   *   matchedRows: Array<verification.ComparedCoverSheetRow>
   * }} params - Parameters of this method.
   * @returns {verification.ComparedCoverSheetRow | null} - The row, or null when it is not the one.
   */
  findMatchedRow ({
    matchedRows,
  }) {
    return matchedRows.length === 1
      ? matchedRows[0]
      : null
  }

  /**
   * Build the reason of a debit note no single row claims (`NG-006`).
   *
   * Every candidate is listed, so an operator meeting an ambiguity is shown what was ambiguous rather
   * than being told the machine gave up (`FR-037` `FR-051`).
   *
   * **Both forms of the number are reported.** The key is what the rules compared and the verbatim
   * number is what the operator can search their own workbook for, and a reason carrying only one of
   * them makes the other's absence the operator's problem (`FR-038`).
   *
   * @param {{
   *   matchedRows: Array<verification.ComparedCoverSheetRow>
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - The reason, or none.
   */
  buildUnmatchedNgReasons ({
    matchedRows,
  }) {
    if (matchedRows.length === 1) {
      return []
    }

    return [
      {
        NgReasonCodeId: NG_REASON_CODE.UNMATCHED_DEBIT_NOTE.ID,
        parameters: {
          debitNoteNumber: this.debitNoteNumber,
          normalizedDebitNoteNumber: this.generateExtractedNormalizedNumber(),
          fileName: this.fileName,
          candidates: this.buildCandidateParameters({
            matchedRows,
          }),
          detailCode: this.generateUnmatchedDetailCode({
            matchedRows,
          }),
        },
      },
    ]
  }

  /**
   * Generate the key the rules looked this debit note up by (`FR-038`).
   *
   * @returns {string | null} - The key, or null when no number was read to make one from.
   */
  generateExtractedNormalizedNumber () {
    const {
      debitNoteNumber,
    } = this

    if (!debitNoteNumber) {
      return null
    }

    return this.createDebitNoteNumberNormalizer({
      debitNoteNumber,
    })
      .generateNormalizedNumber()
  }

  /**
   * Create the normalizer a matching key is generated by.
   *
   * @param {{
   *   debitNoteNumber: string
   * }} params - Parameters of this method.
   * @returns {DebitNoteNumberNormalizer} - The normalizer.
   */
  createDebitNoteNumberNormalizer ({
    debitNoteNumber,
  }) {
    return DebitNoteNumberNormalizer.create({
      debitNoteNumber,
    })
  }

  /**
   * Build what an operator is shown about each candidate row.
   *
   * @param {{
   *   matchedRows: Array<verification.ComparedCoverSheetRow>
   * }} params - Parameters of this method.
   * @returns {Array<{
   *   coverSheetRowId: number
   *   rowNumber: number
   *   debitNoteNumber: string
   *   normalizedDebitNoteNumber: string
   * }>} - The candidates.
   */
  buildCandidateParameters ({
    matchedRows,
  }) {
    return matchedRows.map(matchedRow => ({
      coverSheetRowId: matchedRow.id,
      rowNumber: matchedRow.rowNumber,
      debitNoteNumber: matchedRow.debitNoteNumber,
      normalizedDebitNoteNumber: matchedRow.normalizedDebitNoteNumber,
    }))
  }

  /**
   * Generate which kind of failure to match this was (`DR-13`).
   *
   * `candidates` says the same thing to a machine - it is empty for one case and holds two or more
   * rows for the other - but the client renders a sentence, and reading a count to choose which one
   * is the inference a code exists to remove.
   *
   * @param {{
   *   matchedRows: Array<verification.ComparedCoverSheetRow>
   * }} params - Parameters of this method.
   * @returns {string} - The detail code.
   */
  generateUnmatchedDetailCode ({
    matchedRows,
  }) {
    return matchedRows.length === 0
      ? UNMATCHED_DEBIT_NOTE.NO_ROW_MATCHED
      : UNMATCHED_DEBIT_NOTE.SEVERAL_ROWS_MATCHED
  }

  /**
   * Build the reason of a debit note whose amount could not be read (`NG-005`).
   *
   * Raised whether or not a row was matched: the amount is unreadable either way, and an operator
   * told only that the document did not match would open the wrong file.
   *
   * **`pageNumber` is 1, and it is not a guess about where the amount is.** It states where this
   * system looked and found nothing, which is the page `FR-051` has to open: the operator judges
   * from page 1 whether the scan is unreadable or the document simply states its total elsewhere,
   * and those are the two halves of this one code (`ADR-22`).
   *
   * **A figure the readings disagreed on is neither half, so nothing is raised here.** The check has
   * already failed on the null; what happened is reported once, as `NG-008`, by the one thing that
   * counted the readings (`FR-143`).
   *
   * @returns {Array<verification.NgReason>} - The reason, or none.
   */
  buildUnreadableAmountNgReasons () {
    if (this.extractedAmountMinorUnits !== null) {
      return []
    }

    if (!this.isAgreedAmount) {
      return []
    }

    return [
      {
        NgReasonCodeId: NG_REASON_CODE.UNREADABLE_AMOUNT.ID,
        parameters: {
          fileName: this.fileName,
          pageNumber: TOTAL_AMOUNT_PAGE_NUMBER,
        },
      },
    ]
  }

  /**
   * Build the reason of a matched row this debit note does not agree with (`NG-002`).
   *
   * **The currency is compared before the figures.** Two amounts in different currencies are not a
   * difference of some size; they are two things that cannot be subtracted, and computing a
   * difference first would produce a number whose only honest reading is "meaningless" (`DR-05`).
   *
   * @param {{
   *   matchedRow: verification.ComparedCoverSheetRow | null
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - The reason, or none.
   */
  buildMismatchNgReasons ({
    matchedRow,
  }) {
    if (!matchedRow) {
      return []
    }

    const {
      extractedAmountMinorUnits,
    } = this

    if (extractedAmountMinorUnits === null) {
      return []
    }

    const coverSheetCurrencyCode = this.findRowCurrencyCode({
      matchedRow,
    })

    if (this.extractedCurrencyCode !== coverSheetCurrencyCode) {
      return [
        this.buildCurrencyMismatchNgReason({
          matchedRow,
          extractedAmountMinorUnits,
          coverSheetCurrencyCode,
        }),
      ]
    }

    return this.buildFigureMismatchNgReasons({
      matchedRow,
      extractedAmountMinorUnits,
      coverSheetCurrencyCode,
    })
  }

  /**
   * Find which currency a cover-sheet row states (`TBL-15`).
   *
   * The id is compared as a number rather than by identity: a `BIGINT` reads back as a string from
   * MariaDB and as a number from SQLite, so `row.CurrencyId === CURRENCY.JPY.ID` would hold in the
   * tests and quietly stop holding in the environment that matters (`ADR-06`).
   *
   * @param {{
   *   matchedRow: verification.ComparedCoverSheetRow
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null for an id the master does not carry.
   */
  findRowCurrencyCode ({
    matchedRow,
  }) {
    return this.currencyResolver.findCurrencyCode({
      currencyId: matchedRow.CurrencyId,
    })
  }

  /**
   * Build the reason of two amounts that cannot be compared at all (`NG-002`, `ENG-02` rule 4).
   *
   * **Every difference field is null together.** §2.5 forbids the client subtracting, so the engine
   * states the difference or states that there is none to state - and a client handed a number here
   * would be shown the gap between a USD figure and a JPY one.
   *
   * @param {{
   *   matchedRow: verification.ComparedCoverSheetRow
   *   extractedAmountMinorUnits: number
   *   coverSheetCurrencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildCurrencyMismatchNgReason ({
    matchedRow,
    extractedAmountMinorUnits,
    coverSheetCurrencyCode,
  }) {
    return this.buildAmountMismatchNgReason({
      matchedRow,
      extractedAmountMinorUnits,
      coverSheetCurrencyCode,
      coverSheetAmountMinorUnits: this.readRowAmountMinorUnits({
        matchedRow,
      }),
      differenceMinorUnits: null,
      differenceDirection: null,
    })
  }

  /**
   * Build the reason of two amounts of one currency that differ (`NG-002`).
   *
   * @param {{
   *   matchedRow: verification.ComparedCoverSheetRow
   *   extractedAmountMinorUnits: number
   *   coverSheetCurrencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - The reason, or none when they agree.
   */
  buildFigureMismatchNgReasons ({
    matchedRow,
    extractedAmountMinorUnits,
    coverSheetCurrencyCode,
  }) {
    const coverSheetAmountMinorUnits = this.readRowAmountMinorUnits({
      matchedRow,
    })

    if (coverSheetAmountMinorUnits === extractedAmountMinorUnits) {
      return []
    }

    return [
      this.buildAmountMismatchNgReason({
        matchedRow,
        extractedAmountMinorUnits,
        coverSheetCurrencyCode,
        coverSheetAmountMinorUnits,
        differenceMinorUnits: this.generateDifferenceMinorUnits({
          extractedAmountMinorUnits,
          coverSheetAmountMinorUnits,
        }),
        differenceDirection: this.generateDifferenceDirection({
          extractedAmountMinorUnits,
          coverSheetAmountMinorUnits,
        }),
      }),
    ]
  }

  /**
   * Read the amount a cover-sheet row stores.
   *
   * @param {{
   *   matchedRow: verification.ComparedCoverSheetRow
   * }} params - Parameters of this method.
   * @returns {number | null} - The count of minor units, or null when the column holds no amount.
   */
  readRowAmountMinorUnits ({
    matchedRow,
  }) {
    return MinorUnitAmountConverter.create({
      amountLike: matchedRow.amountMinorUnits,
      minorUnitScale: STORED_AMOUNT_SCALE,
    })
      .generateMinorUnits()
  }

  /**
   * Generate how far apart two figures of one currency are.
   *
   * **The engine subtracts, once, and reports the absolute value** (§2.5). A client doing it would
   * be a second implementation of the comparison that produced this very reason, and the two would
   * eventually round differently.
   *
   * A row whose stored amount could not be read has no distance from anything, so the difference is
   * null - the same shape a currency mismatch produces, for the same reason.
   *
   * @param {{
   *   extractedAmountMinorUnits: number
   *   coverSheetAmountMinorUnits: number | null
   * }} params - Parameters of this method.
   * @returns {number | null} - The gap in minor units, or null when there is nothing to measure.
   */
  generateDifferenceMinorUnits ({
    extractedAmountMinorUnits,
    coverSheetAmountMinorUnits,
  }) {
    if (coverSheetAmountMinorUnits === null) {
      return null
    }

    return Math.abs(extractedAmountMinorUnits - coverSheetAmountMinorUnits)
  }

  /**
   * Generate which way the difference runs, from the debit note's side.
   *
   * @param {{
   *   extractedAmountMinorUnits: number
   *   coverSheetAmountMinorUnits: number | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The direction key, or null when there is nothing to measure.
   */
  generateDifferenceDirection ({
    extractedAmountMinorUnits,
    coverSheetAmountMinorUnits,
  }) {
    if (coverSheetAmountMinorUnits === null) {
      return null
    }

    return extractedAmountMinorUnits > coverSheetAmountMinorUnits
      ? DIFFERENCE_DIRECTION.HIGHER
      : DIFFERENCE_DIRECTION.LOWER
  }

  /**
   * Build one `NG-002`, whichever way the two sides disagreed.
   *
   * **Every amount carries its own scale, including the difference** (§2.5). The client places the
   * decimal point from the scale and keeps no currency table of its own, and a difference told to
   * borrow the scale of a neighbouring field is doing exactly the inference that rule removes.
   *
   * `pageNumber` is 1 because there is an amount to point at and `ADR-22` read it from page 1.
   *
   * @param {{
   *   matchedRow: verification.ComparedCoverSheetRow
   *   extractedAmountMinorUnits: number
   *   coverSheetCurrencyCode: string | null
   *   coverSheetAmountMinorUnits: number | null
   *   differenceMinorUnits: number | null
   *   differenceDirection: string | null
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildAmountMismatchNgReason ({
    matchedRow,
    extractedAmountMinorUnits,
    coverSheetCurrencyCode,
    coverSheetAmountMinorUnits,
    differenceMinorUnits,
    differenceDirection,
  }) {
    const {
      extractedCurrencyCode,
    } = this

    return {
      NgReasonCodeId: NG_REASON_CODE.AMOUNT_MISMATCH.ID,
      parameters: {
        extractedAmountMinorUnits,
        extractedCurrencyCode,
        extractedMinorUnitScale: this.generateMinorUnitScale({
          currencyCode: extractedCurrencyCode,
        }),
        coverSheetAmountMinorUnits,
        coverSheetCurrencyCode,
        coverSheetMinorUnitScale: this.generateMinorUnitScale({
          currencyCode: coverSheetCurrencyCode,
        }),
        differenceMinorUnits,
        differenceCurrencyCode: this.generateDifferenceCurrencyCode({
          differenceMinorUnits,
          extractedCurrencyCode,
        }),
        differenceMinorUnitScale: this.generateDifferenceMinorUnitScale({
          differenceMinorUnits,
          extractedCurrencyCode,
        }),
        differenceDirection,
        rowNumber: matchedRow.rowNumber,
        fileName: this.fileName,
        pageNumber: TOTAL_AMOUNT_PAGE_NUMBER,
      },
    }
  }

  /**
   * Generate which currency a stated difference is in.
   *
   * A difference only exists between two figures of one currency, so it is always in the currency
   * both sides were already in - and it is null exactly when the difference is.
   *
   * @param {{
   *   differenceMinorUnits: number | null
   *   extractedCurrencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null when there is no difference.
   */
  generateDifferenceCurrencyCode ({
    differenceMinorUnits,
    extractedCurrencyCode,
  }) {
    return differenceMinorUnits === null
      ? null
      : extractedCurrencyCode
  }

  /**
   * Generate the scale a stated difference is counted in.
   *
   * @param {{
   *   differenceMinorUnits: number | null
   *   extractedCurrencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {number | null} - The scale, or null when there is no difference.
   */
  generateDifferenceMinorUnitScale ({
    differenceMinorUnits,
    extractedCurrencyCode,
  }) {
    if (differenceMinorUnits === null) {
      return null
    }

    return this.generateMinorUnitScale({
      currencyCode: extractedCurrencyCode,
    })
  }

  /**
   * Generate how many decimal digits one currency's minor unit carries (`TBL-15`).
   *
   * @param {{
   *   currencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {number | null} - The scale, or null for a code the master does not carry.
   */
  generateMinorUnitScale ({
    currencyCode,
  }) {
    return this.currencyResolver.findMinorUnitScale({
      currencyCode,
    })
  }
}

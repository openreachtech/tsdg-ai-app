import NG_DETAIL_CODE_CONSTANT_HASH from '../constants/ngDetailCode.js'
import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

import CurrencyResolver from './CurrencyResolver.js'

const {
  NG_DETAIL_CODE,
} = NG_DETAIL_CODE_CONSTANT_HASH

const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

const {
  UNCHOSEN_WORKSHEET,
  UNREADABLE_COVER_SHEET,
} = NG_DETAIL_CODE

/*
 * How many visible worksheets make the choice ambiguous rather than merely unsuccessful.
 *
 * One visible worksheet that was not chosen can only mean it did not parse; two or more mean the
 * workbook offered candidates and nothing picked between them (§6.3).
 */
const SINGLE_VISIBLE_SHEET_COUNT = 1

/**
 * What check ② concluded about **one** debit note (`ENG-01` `FR-030` §5.3 DN branch step 7).
 *
 * **The check was run by the cover sheet's own job and is only read here.** `TBL-13.reconciliation`
 * holds one outcome per currency, written when the worksheet was parsed, so every debit note of a
 * batch reads the same figures rather than recomputing them - which is what stops two rows of one
 * report disagreeing about the same worksheet.
 *
 * **The answer is per currency, so two debit notes of one batch may legitimately differ** (`DR-05`).
 * A sheet whose JPY subtotal is wrong and whose USD subtotal is right fails check ② for the JPY
 * notes and passes it for the USD ones; 1.0.0's batch-wide verdict would have failed both.
 *
 * **A debit note whose own currency is unknown answers for every currency at once.** Not knowing
 * which entry applies is not a reason to pick the favourable one, so the note passes only if all of
 * them reconcile - the one statement true whichever currency it turns out to be (`DR-03`).
 *
 * **Why the reasons are derived rather than carried**: the cover sheet's job knows exactly why a
 * parse failed, but no column stores that, and a debit note processed hours later has only what was
 * written down. Stored state answers all three cases anyway - no worksheet rows at all is a workbook
 * that never opened, rows with none judged is `NG-009`, and a judged worksheet with an empty
 * reconciliation had no line items to sum.
 */
export default class DebitNoteExcelTotalVerifier {
  /**
   * Constructor.
   *
   * @param {{
   *   coverSheetSheets: Array<verification.ReconciledCoverSheetSheet>
   *   coverSheetFileName: string | null
   *   currencyCode: string | null
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    coverSheetSheets,
    coverSheetFileName,
    currencyCode,
    currencyResolver,
  }) {
    this.coverSheetSheets = coverSheetSheets
    this.coverSheetFileName = coverSheetFileName
    this.currencyCode = currencyCode
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   coverSheetSheets: Array<verification.ReconciledCoverSheetSheet>
   *   coverSheetFileName?: string | null
   *   currencyCode?: string | null
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {DebitNoteExcelTotalVerifier} - Instance of this class.
   */
  static create ({
    coverSheetSheets,
    coverSheetFileName = null,
    currencyCode = null,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      coverSheetSheets,
      coverSheetFileName,
      currencyCode,
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
   * Answer check ② for this debit note.
   *
   * @returns {verification.ExcelTotalCheckResult} - What check ② concluded.
   */
  verifyExcelTotal () {
    const judgedSheet = this.findJudgedSheet()

    if (!judgedSheet) {
      return this.buildUnjudgedWorkbookResult()
    }

    if (judgedSheet.reconciliation.length === 0) {
      return this.buildEmptyWorksheetResult({
        judgedSheet,
      })
    }

    return this.buildReconciledResult({
      judgedSheet,
    })
  }

  /**
   * Find the worksheet the judgment used (`TERM-16`).
   *
   * @returns {verification.ReconciledCoverSheetSheet | null} - The worksheet, or null when none was chosen.
   */
  findJudgedSheet () {
    return this.coverSheetSheets
      .find(coverSheetSheet => coverSheetSheet.isJudged)
      ?? null
  }

  /**
   * Answer for a batch whose cover sheet produced no worksheet to judge against.
   *
   * @returns {verification.ExcelTotalCheckResult} - The failure, and why.
   */
  buildUnjudgedWorkbookResult () {
    return {
      isExcelTotalPassed: false,
      ngReasons: [
        this.buildUnjudgedWorkbookNgReason(),
      ],
    }
  }

  /**
   * Build the reason a workbook offered nothing to judge against.
   *
   * **Two different findings, and the row count is what separates them.** No worksheet row at all
   * means the workbook never opened - or was never uploaded - which is `NG-004`. Worksheet rows with
   * none judged means the workbook opened and the rule of §6.3 could not choose, which is `NG-009`.
   *
   * @returns {verification.NgReason} - The reason.
   */
  buildUnjudgedWorkbookNgReason () {
    if (this.coverSheetSheets.length === 0) {
      return this.buildUnreadableNgReason({
        sheetName: null,
        detailCode: this.generateUnopenedWorkbookDetailCode(),
      })
    }

    return this.buildUnchosenWorksheetNgReason()
  }

  /**
   * Build the reason of a cover sheet that could not be read (`NG-004`).
   *
   * `fileName` is null rather than a stand-in when the batch holds no cover sheet. The parameter is
   * rendered into a sentence, so a placeholder would put an English phrase inside a Japanese one -
   * the `DR-13` breach `detailCode` exists to remove. `cover_sheet_unavailable` already says it.
   *
   * @param {{
   *   sheetName: string | null
   *   detailCode: string
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildUnreadableNgReason ({
    sheetName,
    detailCode,
  }) {
    return {
      NgReasonCodeId: NG_REASON_CODE.UNREADABLE_COVER_SHEET.ID,
      parameters: {
        fileName: this.coverSheetFileName,
        sheetName,
        detailCode,
      },
    }
  }

  /**
   * Generate which way a workbook produced no worksheet rows (`DR-13`).
   *
   * @returns {string} - The detail code.
   */
  generateUnopenedWorkbookDetailCode () {
    return this.coverSheetFileName === null
      ? UNREADABLE_COVER_SHEET.COVER_SHEET_UNAVAILABLE
      : UNREADABLE_COVER_SHEET.WORKBOOK_UNREADABLE
  }

  /**
   * Build the reason of a workbook whose worksheet could not be chosen (`NG-009` `FR-039`).
   *
   * @returns {verification.NgReason} - The reason.
   */
  buildUnchosenWorksheetNgReason () {
    const visibleSheetNames = this.collectVisibleSheetNames()

    return {
      NgReasonCodeId: NG_REASON_CODE.UNCHOSEN_WORKSHEET.ID,
      parameters: {
        fileName: this.coverSheetFileName,
        sheetCount: this.coverSheetSheets.length,
        candidateSheetNames: visibleSheetNames,
        detailCode: this.generateUnchosenWorksheetDetailCode({
          visibleSheetNames,
        }),
      },
    }
  }

  /**
   * Collect the worksheets a rule could have chosen.
   *
   * Hidden worksheets are stored but were never candidates (§6.3), so naming them would send an
   * operator to look at months nobody offered.
   *
   * @returns {Array<string>} - The visible worksheets' names, in workbook order.
   */
  collectVisibleSheetNames () {
    return this.coverSheetSheets
      .filter(coverSheetSheet => !coverSheetSheet.isHidden)
      .map(coverSheetSheet => coverSheetSheet.sheetName)
  }

  /**
   * Generate which way the worksheet rule declined to choose (`DR-13`).
   *
   * **Several visible worksheets reads as ambiguity, even when only one of them was active.** Which
   * worksheet the workbook marked active is not stored, so a run that got here with two candidates
   * cannot say whether the active one was unreadable or whether none was active at all - and
   * `several_candidate_sheets` is true of both, while `active_sheet_unreadable` would only be true
   * of one.
   *
   * @param {{
   *   visibleSheetNames: Array<string>
   * }} params - Parameters of this method.
   * @returns {string} - The detail code.
   */
  generateUnchosenWorksheetDetailCode ({
    visibleSheetNames,
  }) {
    if (visibleSheetNames.length === 0) {
      return UNCHOSEN_WORKSHEET.NO_VISIBLE_SHEET
    }

    if (visibleSheetNames.length > SINGLE_VISIBLE_SHEET_COUNT) {
      return UNCHOSEN_WORKSHEET.SEVERAL_CANDIDATE_SHEETS
    }

    return UNCHOSEN_WORKSHEET.ACTIVE_SHEET_UNREADABLE
  }

  /**
   * Answer for a worksheet that was judged but held nothing to reconcile.
   *
   * An empty reconciliation means the worksheet named no currency at all - no line item and no
   * stated subtotal - which is a sheet with no data rows rather than a sheet that balances at zero
   * (`DR-03`).
   *
   * @param {{
   *   judgedSheet: verification.ReconciledCoverSheetSheet
   * }} params - Parameters of this method.
   * @returns {verification.ExcelTotalCheckResult} - The failure, and why.
   */
  buildEmptyWorksheetResult ({
    judgedSheet,
  }) {
    return {
      isExcelTotalPassed: false,
      ngReasons: [
        this.buildUnreadableNgReason({
          sheetName: judgedSheet.sheetName,
          detailCode: UNREADABLE_COVER_SHEET.NO_DATA_ROWS,
        }),
      ],
    }
  }

  /**
   * Answer from the outcome the cover sheet's job wrote down.
   *
   * The check passes when it produced no reason to fail, rather than by a condition of its own. The
   * two cannot then drift apart, which is what would let a debit note carry `NG-001` and still be
   * reported as having passed check ②.
   *
   * @param {{
   *   judgedSheet: verification.ReconciledCoverSheetSheet
   * }} params - Parameters of this method.
   * @returns {verification.ExcelTotalCheckResult} - What check ② concluded.
   */
  buildReconciledResult ({
    judgedSheet,
  }) {
    const answerableReconciliations = this.collectAnswerableReconciliations({
      judgedSheet,
    })

    const ngReasons = this.buildMismatchNgReasons({
      judgedSheet,
      answerableReconciliations,
    })

    return {
      isExcelTotalPassed: ngReasons.length === 0,
      ngReasons,
    }
  }

  /**
   * Collect the currencies this debit note is answerable for.
   *
   * Its own currency when the worksheet reconciled that one, and every currency otherwise. The
   * fallback covers both a note whose amount was never read and a note in a currency the cover sheet
   * never mentions: neither can be told it passed on the strength of an entry that is not about it.
   *
   * @param {{
   *   judgedSheet: verification.ReconciledCoverSheetSheet
   * }} params - Parameters of this method.
   * @returns {Array<model.CoverSheetReconciliation>} - The outcomes to answer from.
   */
  collectAnswerableReconciliations ({
    judgedSheet,
  }) {
    const currencyReconciliation = judgedSheet.reconciliation
      .find(it => it.currencyCode === this.currencyCode)

    if (!currencyReconciliation) {
      return judgedSheet.reconciliation
    }

    return [
      currencyReconciliation,
    ]
  }

  /**
   * Build one reason per currency that did not reconcile (`NG-001`).
   *
   * @param {{
   *   judgedSheet: verification.ReconciledCoverSheetSheet
   *   answerableReconciliations: Array<model.CoverSheetReconciliation>
   * }} params - Parameters of this method.
   * @returns {Array<verification.NgReason>} - The reasons, empty when every currency reconciled.
   */
  buildMismatchNgReasons ({
    judgedSheet,
    answerableReconciliations,
  }) {
    return answerableReconciliations
      .filter(reconciliation => !reconciliation.isReconciled)
      .map(reconciliation =>
        this.buildMismatchNgReason({
          judgedSheet,
          reconciliation,
        })
      )
  }

  /**
   * Build the reason of one currency that does not add up (`NG-001`).
   *
   * **Both figures are recorded, and either may be null** - a currency stated with no rows behind
   * it, or rows the totals block forgot, is this reason with the missing side reported rather than
   * a pass by absence (`ENG-01` rule 4). `minorUnitScale` travels with them because the client
   * places the decimal point from the scale and keeps no currency table of its own (§2.5).
   *
   * @param {{
   *   judgedSheet: verification.ReconciledCoverSheetSheet
   *   reconciliation: model.CoverSheetReconciliation
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildMismatchNgReason ({
    judgedSheet,
    reconciliation,
  }) {
    return {
      NgReasonCodeId: NG_REASON_CODE.EXCEL_TOTAL_MISMATCH.ID,
      parameters: {
        currencyCode: reconciliation.currencyCode,
        minorUnitScale: this.generateMinorUnitScale({
          currencyCode: reconciliation.currencyCode,
        }),
        statedTotalMinorUnits: reconciliation.statedMinorUnits,
        computedTotalMinorUnits: reconciliation.computedMinorUnits,
        fileName: this.coverSheetFileName,
        sheetName: judgedSheet.sheetName,
      },
    }
  }

  /**
   * Generate how many decimal digits one currency's minor unit carries (`TBL-15`).
   *
   * @param {{
   *   currencyCode: string
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

import NG_DETAIL_CODE_CONSTANT_HASH from '../constants/ngDetailCode.js'
import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

const {
  NG_DETAIL_CODE,
} = NG_DETAIL_CODE_CONSTANT_HASH

const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

const {
  UNCHOSEN_WORKSHEET,
} = NG_DETAIL_CODE

/**
 * Which worksheet of a cover sheet workbook the judgment uses (`FR-039` `TERM-16`, the rule of
 * `40-backend.md` §6.3).
 *
 * **The first worksheet is never a default.** The real workbook holds seven worksheets and six of
 * them are hidden months, so a parser taking `worksheets[0]` would have judged July's documents
 * against January's rows and reported a clean batch of mismatches with no way to see why.
 *
 * **The rule refuses rather than guesses.** A cleverer heuristic - most rows, latest month in the
 * name, most recently edited - would be right most of the time, and the times it was wrong would
 * look exactly like the times it was right. When neither of the two rules names a readable
 * worksheet the answer is `NG-009` and **no rows are parsed at all**.
 *
 * **A hidden worksheet is never chosen**, not even when it is the one the workbook says was active.
 * The visibility filter is applied first, so every later rule reasons over candidates only.
 *
 * No AI and no network (`DR-02`): this is a decision about the workbook's own structure.
 */
export default class JudgedSheetResolver {
  /**
   * Constructor.
   *
   * @param {{
   *   worksheets: Array<verification.CoverSheetWorksheet>
   *   activeSheetIndex: number | null
   *   coverSheetFileName: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    worksheets,
    activeSheetIndex,
    coverSheetFileName,
  }) {
    this.worksheets = worksheets
    this.activeSheetIndex = activeSheetIndex
    this.coverSheetFileName = coverSheetFileName
  }

  /**
   * Factory method.
   *
   * `activeSheetIndex` has no default on purpose. It is the workbook's own `activeTab`, a 0-based
   * position in the same tab order `sheetIndex` counts, and a workbook that names none answers
   * null - which is a fact about the file rather than a value a caller may leave out.
   *
   * @param {{
   *   worksheets: Array<verification.CoverSheetWorksheet>
   *   activeSheetIndex: number | null
   *   coverSheetFileName: string
   * }} params - Parameters of this method.
   * @returns {JudgedSheetResolver} - Instance of this class.
   */
  static create ({
    worksheets,
    activeSheetIndex,
    coverSheetFileName,
  }) {
    return new this({
      worksheets,
      activeSheetIndex,
      coverSheetFileName,
    })
  }

  /**
   * Resolve which worksheet is judged, or why none is.
   *
   * @returns {verification.JudgedSheetResolution} - The worksheet to judge, or `NG-009`.
   */
  resolveJudgedSheet () {
    const visibleWorksheets = this.collectVisibleWorksheets()

    const judgedWorksheet = this.findJudgedWorksheet({
      visibleWorksheets,
    })

    if (judgedWorksheet !== null) {
      return {
        judgedSheetIndex: judgedWorksheet.sheetIndex,
        ngReasons: [],
      }
    }

    return {
      judgedSheetIndex: null,
      ngReasons: [
        this.buildUnchosenNgReason({
          visibleWorksheets,
        }),
      ],
    }
  }

  /**
   * Collect the worksheets a rule is allowed to choose from.
   *
   * @returns {Array<verification.CoverSheetWorksheet>} - The visible worksheets, in workbook order.
   */
  collectVisibleWorksheets () {
    return this.worksheets
      .filter(worksheet => !worksheet.isHidden)
  }

  /**
   * Find the worksheet to judge.
   *
   * **"Parses" is half of the rule, not a detail of it.** A visible but empty worksheet must not win
   * over nothing: the sheet it would contribute is no rows, and no rows compared against a stated
   * subtotal is `NG-001` on a worksheet nobody meant to judge.
   *
   * @param {{
   *   visibleWorksheets: Array<verification.CoverSheetWorksheet>
   * }} params - Parameters of this method.
   * @returns {verification.CoverSheetWorksheet | null} - The worksheet, or null when none was named.
   */
  findJudgedWorksheet ({
    visibleWorksheets,
  }) {
    const unambiguousWorksheet = this.findUnambiguousWorksheet({
      visibleWorksheets,
    })

    if (unambiguousWorksheet === null) {
      return null
    }

    if (!unambiguousWorksheet.isParsable) {
      return null
    }

    return unambiguousWorksheet
  }

  /**
   * Find the one worksheet the rule of §6.3 points at.
   *
   * Rule 1 is the workbook's own active worksheet when it is visible - what the person who sent the
   * file was last looking at. Rule 2 is the single visible worksheet.
   *
   * **Rule 2 cannot rescue rule 1 on readability, which is why falling through is enough.** Rule 2
   * requires exactly one visible worksheet, so where the active worksheet is visible it *is* that
   * one - and an unreadable active worksheet reaching rule 2 would meet itself. Rule 2 only ever
   * gets a turn when the active worksheet is hidden or the workbook names none, which is exactly
   * when rule 1 answers null.
   *
   * @param {{
   *   visibleWorksheets: Array<verification.CoverSheetWorksheet>
   * }} params - Parameters of this method.
   * @returns {verification.CoverSheetWorksheet | null} - The worksheet, or null when none is.
   */
  findUnambiguousWorksheet ({
    visibleWorksheets,
  }) {
    const activeWorksheet = this.findActiveWorksheet({
      visibleWorksheets,
    })

    if (activeWorksheet !== null) {
      return activeWorksheet
    }

    return this.findSoleVisibleWorksheet({
      visibleWorksheets,
    })
  }

  /**
   * Find the worksheet the workbook says was active, if it is one a rule may choose.
   *
   * The search runs over the visible worksheets rather than over all of them, so an `activeTab`
   * pointing at a hidden worksheet answers null - which is rule 1's own "if it is visible". An
   * index past the end of the workbook answers null the same way, because a workbook can carry one.
   *
   * @param {{
   *   visibleWorksheets: Array<verification.CoverSheetWorksheet>
   * }} params - Parameters of this method.
   * @returns {verification.CoverSheetWorksheet | null} - The worksheet, or null when there is none.
   */
  findActiveWorksheet ({
    visibleWorksheets,
  }) {
    if (this.activeSheetIndex === null) {
      return null
    }

    return visibleWorksheets
      .find(worksheet => worksheet.sheetIndex === this.activeSheetIndex)
      ?? null
  }

  /**
   * Find the only visible worksheet, if there is exactly one.
   *
   * Readability is deliberately not checked here. This rule is about the count, and refusing the
   * one worksheet there is belongs to the caller so that both rules refuse in the same place.
   *
   * @param {{
   *   visibleWorksheets: Array<verification.CoverSheetWorksheet>
   * }} params - Parameters of this method.
   * @returns {verification.CoverSheetWorksheet | null} - The worksheet, or null when it is not one.
   */
  findSoleVisibleWorksheet ({
    visibleWorksheets,
  }) {
    if (visibleWorksheets.length !== 1) {
      return null
    }

    return visibleWorksheets[0]
  }

  /**
   * Build the reason of a workbook whose worksheet could not be chosen (`NG-009`).
   *
   * `sheetCount` counts every worksheet, hidden ones included, because that is the number the
   * operator sees in their own file. `candidateSheetNames` names the visible ones only - the ones a
   * rule could have chosen - so the operator is asked about a choice that was really available.
   *
   * @param {{
   *   visibleWorksheets: Array<verification.CoverSheetWorksheet>
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildUnchosenNgReason ({
    visibleWorksheets,
  }) {
    return {
      NgReasonCodeId: NG_REASON_CODE.UNCHOSEN_WORKSHEET.ID,
      parameters: {
        fileName: this.coverSheetFileName,
        sheetCount: this.worksheets.length,
        candidateSheetNames: visibleWorksheets
          .map(worksheet => worksheet.sheetName),
        detailCode: this.generateUnchosenDetailCode({
          visibleWorksheets,
        }),
      },
    }
  }

  /**
   * Generate which way the rule failed to choose (`DR-13`).
   *
   * The three exits are the three ways §6.3 runs out, and the operator's next action differs for
   * each: unhide a worksheet, look at the one worksheet's columns, or say which month to judge.
   *
   * **`ACTIVE_SHEET_UNREADABLE` also covers the sole visible worksheet**, which the vocabulary has
   * no separate key for. Both are "one worksheet was named and could not be read", and they call
   * for the same action; `SEVERAL_CANDIDATE_SHEETS` would misstate the count and
   * `NO_VISIBLE_SHEET` would misstate the visibility. Worth a key of its own if the case is ever
   * seen in practice - `40-backend.md` §6.2 closes this vocabulary, so it is a spec change rather
   * than a new string here.
   *
   * @param {{
   *   visibleWorksheets: Array<verification.CoverSheetWorksheet>
   * }} params - Parameters of this method.
   * @returns {string} - The detail code.
   */
  generateUnchosenDetailCode ({
    visibleWorksheets,
  }) {
    if (visibleWorksheets.length === 0) {
      return UNCHOSEN_WORKSHEET.NO_VISIBLE_SHEET
    }

    const unambiguousWorksheet = this.findUnambiguousWorksheet({
      visibleWorksheets,
    })

    if (unambiguousWorksheet !== null) {
      return UNCHOSEN_WORKSHEET.ACTIVE_SHEET_UNREADABLE
    }

    return UNCHOSEN_WORKSHEET.SEVERAL_CANDIDATE_SHEETS
  }
}

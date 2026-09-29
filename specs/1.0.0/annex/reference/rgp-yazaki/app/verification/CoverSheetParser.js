import ExcelJS from 'exceljs'

import NG_DETAIL_CODE_CONSTANT_HASH from '../constants/ngDetailCode.js'

import CoverSheetWorksheetParser from './CoverSheetWorksheetParser.js'
import JudgedSheetResolver from './JudgedSheetResolver.js'

const {
  NG_DETAIL_CODE,
} = NG_DETAIL_CODE_CONSTANT_HASH

const {
  UNREADABLE_COVER_SHEET,
} = NG_DETAIL_CODE

/**
 * Reads a cover sheet workbook: every worksheet it holds, and which one the judgment may use.
 *
 * **Every worksheet is read, not only the one that gets judged** (`TBL-13` `ADR-20`). The observed
 * workbook holds seven and six of them are hidden (00-overview §2.1), and 1.0.0 had nowhere to
 * record which one a judgment used - so a parser reading the first would have judged July's
 * documents against January's rows and reported a clean batch of mismatches with no way to see why.
 * Reading them all is also what lets the preview state how many there are (`FR-121`).
 *
 * **Choosing is a separate decision from reading** (`JudgedSheetResolver`, §6.3). This class hands
 * the resolver what each worksheet is - visible or hidden, parsable or not - and the resolver
 * answers with one index or with `NG-009`. Nothing here falls back to the first worksheet: that
 * default is the defect `FR-039` exists to prevent.
 *
 * **A workbook this cannot open is an answer, not an exception** (`FR-033` `DR-03`). The caller
 * gets a reason instead of rows, the file still reaches `completed`, and the batch's debit notes
 * carry `NG-004`.
 */
export default class CoverSheetParser {
  /**
   * Constructor.
   *
   * @param {{
   *   workbook: ExcelJS.Workbook
   * }} params - Parameters of this constructor.
   */
  constructor ({
    workbook,
  }) {
    this.workbook = workbook
  }

  /**
   * Factory method.
   *
   * @param {{
   *   workbook?: ExcelJS.Workbook
   * }} [params] - Parameters of this method.
   * @returns {CoverSheetParser} - Instance of this class.
   */
  static create ({
    workbook = new ExcelJS.Workbook(),
  } = {}) {
    return new this({
      workbook,
    })
  }

  /**
   * Read one cover sheet from disk.
   *
   * @param {{
   *   filePath: string
   *   coverSheetFileName: string
   * }} params - Parameters of this method.
   * @returns {Promise<verification.CoverSheetParseResult>} - Every worksheet, and which one may be judged.
   */
  async parseFile ({
    filePath,
    coverSheetFileName,
  }) {
    const isOpenedWorkbook = await this.openWorkbook({
      filePath,
    })

    if (!isOpenedWorkbook) {
      return this.buildUnopenedResult()
    }

    return this.parseWorkbook({
      coverSheetFileName,
    })
  }

  /**
   * Open the file as a workbook.
   *
   * A file that is not a workbook at all reaches here as readily as one that is: an operator can
   * upload a PDF renamed `.xlsx`, and the format check on upload reads the extension rather than
   * the bytes. It is answered as an unreadable sheet rather than as a thrown error, because that is
   * what it is (`NG-004`).
   *
   * @param {{
   *   filePath: string
   * }} params - Parameters of this method.
   * @returns {Promise<boolean>} - true: the workbook is open.
   */
  async openWorkbook ({
    filePath,
  }) {
    try {
      await this.workbook.xlsx.readFile(filePath)

      return true
    } catch {
      return false
    }
  }

  /**
   * Read every worksheet of the open workbook, and decide which one may be judged.
   *
   * @param {{
   *   coverSheetFileName: string
   * }} params - Parameters of this method.
   * @returns {verification.CoverSheetParseResult} - Every worksheet, and which one may be judged.
   */
  parseWorkbook ({
    coverSheetFileName,
  }) {
    const parsedWorksheets = this.collectParsedWorksheets()

    const judgedSheetResolution = this.resolveJudgedSheet({
      parsedWorksheets,
      coverSheetFileName,
    })

    return {
      parsedWorksheets,
      judgedSheetIndex: judgedSheetResolution.judgedSheetIndex,
      unreadableDetailCode: this.findJudgedDetailCode({
        parsedWorksheets,
        judgedSheetIndex: judgedSheetResolution.judgedSheetIndex,
      }),
    }
  }

  /**
   * Read every worksheet, in the workbook's own tab order.
   *
   * @returns {Array<verification.ParsedCoverSheetWorksheet>} - The worksheets.
   */
  collectParsedWorksheets () {
    return this.workbook.worksheets
      .map((worksheet, sheetIndex) =>
        this.createCoverSheetWorksheetParser({
          worksheet,
          sheetIndex,
        })
          .parseWorksheet()
      )
  }

  /**
   * Create the parser one worksheet is read by.
   *
   * @param {{
   *   worksheet: ExcelJS.Worksheet
   *   sheetIndex: number
   * }} params - Parameters of this method.
   * @returns {CoverSheetWorksheetParser} - The parser.
   */
  createCoverSheetWorksheetParser ({
    worksheet,
    sheetIndex,
  }) {
    return CoverSheetWorksheetParser.create({
      worksheet,
      sheetIndex,
    })
  }

  /**
   * Decide which worksheet the judgment may use (§6.3).
   *
   * @param {{
   *   parsedWorksheets: Array<verification.ParsedCoverSheetWorksheet>
   *   coverSheetFileName: string
   * }} params - Parameters of this method.
   * @returns {verification.JudgedSheetResolution} - The worksheet to judge, or `NG-009`.
   */
  resolveJudgedSheet ({
    parsedWorksheets,
    coverSheetFileName,
  }) {
    return this.createJudgedSheetResolver({
      parsedWorksheets,
      coverSheetFileName,
    })
      .resolveJudgedSheet()
  }

  /**
   * Create the resolver the rule of §6.3 is applied by.
   *
   * @param {{
   *   parsedWorksheets: Array<verification.ParsedCoverSheetWorksheet>
   *   coverSheetFileName: string
   * }} params - Parameters of this method.
   * @returns {JudgedSheetResolver} - The resolver.
   */
  createJudgedSheetResolver ({
    parsedWorksheets,
    coverSheetFileName,
  }) {
    return JudgedSheetResolver.create({
      worksheets: parsedWorksheets,
      activeSheetIndex: this.findActiveSheetIndex(),
      coverSheetFileName,
    })
  }

  /**
   * Find which worksheet the workbook itself was last left on.
   *
   * **A workbook naming none answers null, never 0.** `activeTab` is absent from `<workbookView>`
   * on a file nobody scrolled through, and defaulting it to the first worksheet would reinstate the
   * exact "judge whichever sheet comes first" behavior `FR-039` was written to remove.
   *
   * @returns {number | null} - The 0-based position, or null when the workbook names none.
   */
  findActiveSheetIndex () {
    const activeSheetIndex = this.workbook.views?.[0]?.activeTab ?? null

    if (typeof activeSheetIndex !== 'number') {
      return null
    }

    return activeSheetIndex
  }

  /**
   * Find why the judged worksheet could not be read, if it could not.
   *
   * Only the judged worksheet's reason is reported. Every other worksheet in the workbook is a
   * month nobody asked about, and stating that January's sheet has no total row would send the
   * operator to correct a sheet the judgment never touched.
   *
   * @param {{
   *   parsedWorksheets: Array<verification.ParsedCoverSheetWorksheet>
   *   judgedSheetIndex: number | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The detail code, or null when there is no judged worksheet to blame.
   */
  findJudgedDetailCode ({
    parsedWorksheets,
    judgedSheetIndex,
  }) {
    const judgedWorksheet = parsedWorksheets.find(
      parsedWorksheet => parsedWorksheet.sheetIndex === judgedSheetIndex
    )

    return judgedWorksheet?.unreadableDetailCode ?? null
  }

  /**
   * Build the answer for a file that could not be opened as a workbook.
   *
   * @returns {verification.CoverSheetParseResult} - No worksheets, and the reason.
   */
  buildUnopenedResult () {
    return {
      parsedWorksheets: [],
      judgedSheetIndex: null,
      unreadableDetailCode: UNREADABLE_COVER_SHEET.WORKBOOK_UNREADABLE,
    }
  }
}

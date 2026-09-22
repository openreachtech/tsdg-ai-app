import ExcelJS from 'exceljs'

/*
 * The cell that states the worksheet's own tab label, and the gap it sits below the table in.
 *
 * **A spreadsheet does not show a reader its tab labels.** Measured against Gemini on 2026-08-27:
 * asked point blank for the tab label of an `.xlsx`, the model answers that it cannot see one, and
 * a reading of a cover sheet therefore came back with `sheetName` null every time. The name is
 * structure rather than content, and the provider reads content.
 *
 * That is fatal on its own, because `MismatchedSheetReadingReplacer` replaces every reading whose
 * `sheetName` does not match the judged worksheet with one that read nothing (`SEC-009`). A guard
 * that can never be satisfied throws away every reading there is, so `ENV-043` produced three
 * stored readings and no usable value from any of them.
 *
 * Writing the label into a cell makes it content, and the model then reports it exactly - including
 * a trailing space and a stray paren, which is what the observed tabs carry and what the guard
 * compares. Three readings of a worksheet labelled `Jul.2026 )` returned it verbatim, three times.
 *
 * **It does not weaken what the guard is for.** The label written here is the label of the
 * worksheet this class actually copied, so an extraction that took the wrong month writes the wrong
 * month's name and is caught exactly as before. What changes is that the right answer is now
 * reachable; the wrong one is still refused. It is also not the rejected alternative named below:
 * the model is told nothing about which worksheet it should be looking at, and there is only one.
 *
 * The gap keeps it clear of the table so it is not read as a line item - measured at three rows,
 * where the readings returned the same row count as before.
 */
const TAB_LABEL_MARKER = {
  LABEL_TEXT: 'WORKSHEET TAB LABEL',
  ROW_GAP: 3,
  LABEL_COLUMN_NUMBER: 1,
  VALUE_COLUMN_NUMBER: 2,
}

/**
 * Extracts the judged worksheet into a workbook of its own, which is the only thing that is ever
 * sent to a provider (`ADR-23` `SEC-009`).
 *
 * **Six sevenths of the disclosure is removed here, and that is the whole point of the class.** The
 * observed workbook holds seven worksheets and six of them are previous months (00-overview §2.1),
 * so handing over the file as it stands would put seven months of every debit note number and every
 * amount outside the host in order to read one. `OPEN-3` is open precisely because the cover sheet
 * is the most concentrated client data in the system; narrowing the payload this far is the largest
 * reduction available without answering that question.
 *
 * **Naming the worksheet in the prompt was the rejected alternative.** It is simpler and it makes
 * the model's job easier, and it trades a security property for an implementation convenience - a
 * prompt instruction is not an access control.
 *
 * **A formula is copied as the value it last resolved to, never as the formula.** The worksheets it
 * referenced are the ones this class just removed, so carrying the expression across would produce
 * `#REF!` where the operator sees a number - a disagreement the extraction itself caused, which is
 * the stated cost of `ADR-23` and the one worth spending code to avoid. A cell whose cached result
 * is itself an error travels as that error, because that is what the operator sees too.
 *
 * **It opens the file a second time rather than borrowing the parse's workbook.** One extra read of
 * one workbook inside a background job buys a class that can be pointed at a fixture and asserted
 * on with no parse, no job and no outbound call - which is how `SEC-009` asks for the artifact to be
 * checked.
 */
export default class JudgedSheetWorkbookExtractor {
  /**
   * Constructor.
   *
   * @param {{
   *   sourceWorkbook: ExcelJS.Workbook
   *   extractedWorkbook: ExcelJS.Workbook
   * }} params - Parameters of this constructor.
   */
  constructor ({
    sourceWorkbook,
    extractedWorkbook,
  }) {
    this.sourceWorkbook = sourceWorkbook
    this.extractedWorkbook = extractedWorkbook
  }

  /**
   * Factory method.
   *
   * @param {{
   *   sourceWorkbook?: ExcelJS.Workbook
   *   extractedWorkbook?: ExcelJS.Workbook
   * }} [params] - Parameters of this method.
   * @returns {JudgedSheetWorkbookExtractor} - Instance of this class.
   */
  static create ({
    sourceWorkbook = new ExcelJS.Workbook(),
    extractedWorkbook = new ExcelJS.Workbook(),
  } = {}) {
    return new this({
      sourceWorkbook,
      extractedWorkbook,
    })
  }

  /**
   * Write the judged worksheet out as a workbook holding nothing else.
   *
   * **Answers the worksheet's name, and that answer is load-bearing.** It is what the reading's own
   * `sheetName` is checked against: a mismatch means the model read a different month from the one
   * the judgment used, and the reading is discarded rather than compared (`ADR-23` `SEC-009`).
   *
   * Answers `null` when the workbook could not be opened or the index names no worksheet. Both are
   * states the caller can act on - it skips the reading and the file is analyzed exactly as it is
   * with the read switched off - and neither is an error worth failing a file over.
   *
   * @param {{
   *   filePath: string
   *   sheetIndex: number
   *   destinationPath: string
   * }} params - Parameters of this method.
   * @returns {Promise<string | null>} - The extracted worksheet's name, or null when there is none.
   */
  async extractJudgedSheet ({
    filePath,
    sheetIndex,
    destinationPath,
  }) {
    const isOpenedWorkbook = await this.openSourceWorkbook({
      filePath,
    })

    if (!isOpenedWorkbook) {
      return null
    }

    const sourceWorksheet = this.findSourceWorksheet({
      sheetIndex,
    })

    if (!sourceWorksheet) {
      return null
    }

    await this.writeExtractedWorkbook({
      sourceWorksheet,
      destinationPath,
    })

    return sourceWorksheet.name
  }

  /**
   * Open the stored file as a workbook.
   *
   * Answered rather than thrown, exactly as `CoverSheetParser` answers it: a file that is not a
   * workbook reaches here as readily as one that is, and it is already being reported as `NG-004`
   * by the parse that ran before this (`FR-033` `DR-03`).
   *
   * @param {{
   *   filePath: string
   * }} params - Parameters of this method.
   * @returns {Promise<boolean>} - true: the workbook is open.
   */
  async openSourceWorkbook ({
    filePath,
  }) {
    try {
      await this.sourceWorkbook.xlsx.readFile(filePath)

      return true
    } catch {
      return false
    }
  }

  /**
   * Find the worksheet the judgment used, by its position in the workbook's own tab order.
   *
   * **By index rather than by name**, because the index is what §6.3 chose and what `TBL-13` stored.
   * Looking the worksheet up by name would re-decide here, in a class that knows nothing about the
   * rule, what the resolver already decided.
   *
   * @param {{
   *   sheetIndex: number
   * }} params - Parameters of this method.
   * @returns {ExcelJS.Worksheet | null} - The worksheet, or null when the index names none.
   */
  findSourceWorksheet ({
    sheetIndex,
  }) {
    return this.sourceWorkbook.worksheets[sheetIndex]
      ?? null
  }

  /**
   * Build the one-worksheet workbook and write it to disk.
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   *   destinationPath: string
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async writeExtractedWorkbook ({
    sourceWorksheet,
    destinationPath,
  }) {
    const extractedWorksheet = this.extractedWorkbook.addWorksheet(sourceWorksheet.name)

    this.copyCells({
      sourceWorksheet,
      extractedWorksheet,
    })

    this.copyMerges({
      sourceWorksheet,
      extractedWorksheet,
    })

    this.writeTabLabelMarker({
      sourceWorksheet,
      extractedWorksheet,
    })

    await this.extractedWorkbook.xlsx.writeFile(destinationPath)
  }

  /**
   * Copy every cell of the used range across.
   *
   * The range is walked by address rather than through `Worksheet#eachRow()`, which is a sequential
   * iteration this codebase does not use - and walking it also copies the blanks inside the range,
   * so a row the source leaves empty stays empty here rather than closing up.
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   *   extractedWorksheet: ExcelJS.Worksheet
   * }} params - Parameters of this method.
   * @returns {void}
   */
  copyCells ({
    sourceWorksheet,
    extractedWorksheet,
  }) {
    this.buildRowNumbers({
      sourceWorksheet,
    })
      .map(rowNumber =>
        this.buildColumnNumbers({
          sourceWorksheet,
        })
          .map(columnNumber => this.copyCell({
            sourceWorksheet,
            extractedWorksheet,
            rowNumber,
            columnNumber,
          }))
      )
  }

  /**
   * Build every row number of the used range, counted from one as a spreadsheet counts.
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   * }} params - Parameters of this method.
   * @returns {Array<number>} - The row numbers.
   */
  buildRowNumbers ({
    sourceWorksheet,
  }) {
    return Array.from(
      {
        length: sourceWorksheet.rowCount,
      },
      (unusedValue, rowOffset) => rowOffset + 1
    )
  }

  /**
   * Build every column number of the used range, counted from one.
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   * }} params - Parameters of this method.
   * @returns {Array<number>} - The column numbers.
   */
  buildColumnNumbers ({
    sourceWorksheet,
  }) {
    return Array.from(
      {
        length: sourceWorksheet.columnCount,
      },
      (unusedValue, columnOffset) => columnOffset + 1
    )
  }

  /**
   * Copy one cell's value.
   *
   * **A cell covered by a merge is left alone.** `ExcelJS` fills those from the anchor when the
   * merge is re-declared, and assigning to one directly is how a merged block ends up holding the
   * same text several times over.
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   *   extractedWorksheet: ExcelJS.Worksheet
   *   rowNumber: number
   *   columnNumber: number
   * }} params - Parameters of this method.
   * @returns {void}
   */
  copyCell ({
    sourceWorksheet,
    extractedWorksheet,
    rowNumber,
    columnNumber,
  }) {
    const sourceCell = sourceWorksheet.getCell(rowNumber, columnNumber)

    if (sourceCell.type === ExcelJS.ValueType.Merge) {
      return
    }

    const extractedCell = extractedWorksheet.getCell(rowNumber, columnNumber)

    extractedCell.value = this.readCellValue({
      sourceCell,
    })
  }

  /**
   * Read what one cell holds, as the value a reader of the sheet would see.
   *
   * **A formula becomes its cached result** - the number printed in the cell - because the
   * worksheets its expression referenced have just been removed. Copying the expression instead
   * would put `#REF!` in front of the model where the operator sees a figure, and check ⑤ would
   * then report a disagreement this class manufactured.
   *
   * A formula the workbook never calculated has no result to copy, and an empty cell is the honest
   * answer: guessing one would be arithmetic, which is not what an extraction does.
   *
   * @param {{
   *   sourceCell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {*} - The value to write.
   */
  readCellValue ({
    sourceCell,
  }) {
    if (sourceCell.type !== ExcelJS.ValueType.Formula) {
      return sourceCell.value
    }

    return /** @type {*} */ (sourceCell.value)
      ?.result
      ?? null
  }

  /**
   * Re-declare the source worksheet's merges on the extracted one.
   *
   * A merged caption is what tells a reader that one heading covers three columns, so a workbook
   * that lost its merges would be asking the model to read a different-looking sheet from the one
   * the parse read (`ADR-23`).
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   *   extractedWorksheet: ExcelJS.Worksheet
   * }} params - Parameters of this method.
   * @returns {void}
   */
  copyMerges ({
    sourceWorksheet,
    extractedWorksheet,
  }) {
    const mergeRanges = sourceWorksheet.model
      ?.merges
      ?? []

    mergeRanges.map(mergeRange => extractedWorksheet.mergeCells(mergeRange))
  }

  /**
   * State the worksheet's own tab label in a cell, because a reader of the file cannot see it.
   *
   * The label comes from the worksheet that was copied rather than from the caller's idea of which
   * one that was, which is what keeps the guard honest: a wrong extraction writes the wrong name.
   * See `TAB_LABEL_MARKER`.
   *
   * @param {{
   *   sourceWorksheet: ExcelJS.Worksheet
   *   extractedWorksheet: ExcelJS.Worksheet
   * }} params - Parameters of this method.
   * @returns {void}
   */
  writeTabLabelMarker ({
    sourceWorksheet,
    extractedWorksheet,
  }) {
    const markerRowNumber = sourceWorksheet.rowCount + TAB_LABEL_MARKER.ROW_GAP

    const markerRow = extractedWorksheet.getRow(markerRowNumber)

    markerRow.getCell(TAB_LABEL_MARKER.LABEL_COLUMN_NUMBER).value = TAB_LABEL_MARKER.LABEL_TEXT
    markerRow.getCell(TAB_LABEL_MARKER.VALUE_COLUMN_NUMBER).value = sourceWorksheet.name
  }
}

import ExcelJS from 'exceljs'

/*
 * What a cell holds, as the closed vocabulary of §2.3.
 *
 * There is deliberately no `empty` member. An empty cell is omitted from the grid, so a key for it
 * would describe a cell that never reaches the client.
 */
const CELL_KIND = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  FORMULA: 'formula',
  ERROR: 'error',
}

/*
 * The spreadsheet errors the client's dictionary renders, keyed by what the workbook stores.
 *
 * A closed set (`DR-13`): the client resolves each key through its own dictionary, so an error this
 * system has not met is stored as `UNKNOWN` with the workbook's own text beside it - a defect to
 * report rather than a key to invent.
 */
const ERROR_CODE_BY_ERROR_TEXT = {
  '#REF!': 'REF',
  '#DIV/0!': 'DIV0',
  '#VALUE!': 'VALUE',
  '#NAME?': 'NAME',
  '#NUM!': 'NUM',
  '#N/A': 'NA',
  '#NULL!': 'NULL',
  '#SPILL!': 'SPILL',
}

const UNKNOWN_ERROR_CODE = 'UNKNOWN'

const MERGE_RANGE_SEPARATOR = ':'

const FROZEN_VIEW_STATE = 'frozen'

/**
 * Turns one worksheet into the grid the preview renders (`TBL-13.grid` `FR-120` `ADR-20`).
 *
 * **Written by the parse, never re-derived per request.** `API-Q005` opens no workbook (`NFR-012`),
 * so the picture the operator sees and the rows the judgment used come from one read of the file -
 * which is what stops the preview from disagreeing with the verdict it sits beside.
 *
 * **Content and structure, never appearance.** No colors, no fonts, no widths. Reproducing a
 * workbook's formatting is a rendering project of its own, and nothing in `FR-120` needs it.
 *
 * **An empty cell is omitted rather than emitted as an empty one.** A real worksheet is mostly
 * empty, and a grid carrying every address of its used range would be an order of magnitude larger
 * for no information. A merge anchor is the one exception: it carries its span even when it holds
 * nothing, because the span is structure rather than content.
 */
export default class WorksheetGridNormalizer {
  /**
   * Constructor.
   *
   * @param {{
   *   worksheet: ExcelJS.Worksheet
   *   headerRowNumber: number | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    worksheet,
    headerRowNumber,
  }) {
    this.worksheet = worksheet
    this.headerRowNumber = headerRowNumber
  }

  /**
   * Factory method.
   *
   * `headerRowNumber` is answered by the parse rather than found again here. It states which row
   * labels the columns, and the parse is what decided that; looking for it a second time would give
   * the preview a chance to point at a different row than the judgment used.
   *
   * @param {{
   *   worksheet: ExcelJS.Worksheet
   *   headerRowNumber: number | null
   * }} params - Parameters of this method.
   * @returns {WorksheetGridNormalizer} - Instance of this class.
   */
  static create ({
    worksheet,
    headerRowNumber,
  }) {
    return new this({
      worksheet,
      headerRowNumber,
    })
  }

  /**
   * Generate the grid of this worksheet.
   *
   * @returns {model.CoverSheetGrid} - The grid, as §2.3 shapes it.
   */
  generateGrid () {
    return {
      cells: this.collectCells(),
      frozenRowCount: this.generateFrozenRowCount(),
      headerRowNumber: this.headerRowNumber,
    }
  }

  /**
   * Collect every cell worth describing, in reading order.
   *
   * @returns {Array<model.CoverSheetGridCell>} - The cells.
   */
  collectCells () {
    const mergeSpanHash = this.buildMergeSpanHash()

    return this.generateCellPositions()
      .map(cellPosition =>
        this.buildCell({
          rowNumber: cellPosition.rowNumber,
          columnNumber: cellPosition.columnNumber,
          mergeSpanHash,
        })
      )
      .filter(cell => cell !== null)
  }

  /**
   * Generate every address of the used range, row by row.
   *
   * @returns {Array<{
   *   rowNumber: number
   *   columnNumber: number
   * }>} - The addresses.
   */
  generateCellPositions () {
    const columnNumbers = Array.from(
      {
        length: this.worksheet.columnCount,
      },
      (unusedValue, columnIndex) => columnIndex + 1
    )

    return Array.from(
      {
        length: this.worksheet.rowCount,
      },
      (unusedValue, rowIndex) => rowIndex + 1
    )
      .flatMap(rowNumber =>
        columnNumbers.map(columnNumber => ({
          rowNumber,
          columnNumber,
        }))
      )
  }

  /**
   * Build one cell, or answer that it is not worth describing.
   *
   * **A cell covered by a merge is dropped rather than emitted.** The client spans from the
   * anchor's `mergeRowSpan` and `mergeColumnSpan`, and emitting the covered addresses would leave
   * it unable to tell a covered cell from a blank one. Reading one is also unsafe: `ExcelJS` throws
   * from `Cell#get:text` when the merge the cell belongs to holds nothing.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number
   *   mergeSpanHash: Record<string, {
   *     rowSpan: number
   *     columnSpan: number
   *   }>
   * }} params - Parameters of this method.
   * @returns {model.CoverSheetGridCell | null} - The cell, or null when it says nothing.
   */
  buildCell ({
    rowNumber,
    columnNumber,
    mergeSpanHash,
  }) {
    const cell = this.worksheet.getCell(rowNumber, columnNumber)

    if (cell.type === ExcelJS.ValueType.Merge) {
      return null
    }

    const mergeSpan = mergeSpanHash[cell.address] ?? null

    if (cell.type === ExcelJS.ValueType.Null && mergeSpan === null) {
      return null
    }

    return {
      address: cell.address,
      rowNumber,
      columnNumber,
      kind: this.generateCellKind({
        cell,
      }),
      text: this.generateCellText({
        cell,
      }),
      rawValue: this.generateRawValue({
        cell,
      }),
      formula: this.generateFormula({
        cell,
      }),
      errorCode: this.generateErrorCode({
        cell,
      }),
      isMerged: mergeSpan !== null,
      mergeAnchor: mergeSpan === null
        ? null
        : cell.address,
      mergeRowSpan: mergeSpan?.rowSpan ?? null,
      mergeColumnSpan: mergeSpan?.columnSpan ?? null,
    }
  }

  /**
   * Build how far each merge reaches, keyed by the address it is anchored at.
   *
   * @returns {Record<string, {
   *   rowSpan: number
   *   columnSpan: number
   * }>} - The spans.
   */
  buildMergeSpanHash () {
    const mergeRanges = this.worksheet.model?.merges ?? []

    return Object.fromEntries(
      mergeRanges.map(mergeRange =>
        this.buildMergeSpanEntry({
          mergeRange,
        })
      )
    )
  }

  /**
   * Build one merge's anchor address and span, from the range the workbook states.
   *
   * The two corners are resolved through `Worksheet#getCell()` rather than by decoding the column
   * letters here, so the A1 notation is read by the library that wrote it.
   *
   * @param {{
   *   mergeRange: string
   * }} params - Parameters of this method.
   * @returns {[string, {
   *   rowSpan: number
   *   columnSpan: number
   * }]} - The anchor address, and how far the merge reaches from it.
   */
  buildMergeSpanEntry ({
    mergeRange,
  }) {
    const [anchorAddress, lastAddress] = mergeRange.split(MERGE_RANGE_SEPARATOR)

    const anchorCell = this.worksheet.getCell(anchorAddress)
    const lastCell = this.worksheet.getCell(lastAddress)

    return [
      anchorAddress,
      {
        rowSpan: Number(lastCell.row) - Number(anchorCell.row) + 1,
        columnSpan: Number(lastCell.col) - Number(anchorCell.col) + 1,
      },
    ]
  }

  /**
   * Generate how many rows the workbook itself keeps pinned.
   *
   * A fact about the file, not a rendering decision: which rows stay in view while scrolling is
   * `CMP-12`'s choice, made from this and from `headerRowNumber` (§2.3).
   *
   * @returns {number} - The count, 0 when the worksheet freezes nothing.
   */
  generateFrozenRowCount () {
    const worksheetView = this.worksheet.views?.[0] ?? null

    if (worksheetView?.state !== FROZEN_VIEW_STATE) {
      return 0
    }

    return worksheetView.ySplit ?? 0
  }

  /**
   * Generate which of the five kinds this cell is.
   *
   * **A formula whose cached result is an error is an error cell**, not a formula cell. What the
   * operator sees there is `#REF!`, and the source is still carried in `formula` - so nothing is
   * lost by naming the cell after what it displays, and the four `#REF!` cells of the observed
   * workbook are exactly the case that would otherwise render as ordinary computed cells.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {string} - One member of `CELL_KIND`.
   */
  generateCellKind ({
    cell,
  }) {
    const errorText = this.findErrorText({
      cell,
    })

    if (errorText !== null) {
      return CELL_KIND.ERROR
    }

    if (cell.type === ExcelJS.ValueType.Formula) {
      return CELL_KIND.FORMULA
    }

    if (this.findDateValue({ cell }) !== null) {
      return CELL_KIND.DATE
    }

    if (typeof this.readResolvedValue({ cell }) === 'number') {
      return CELL_KIND.NUMBER
    }

    return CELL_KIND.TEXT
  }

  /**
   * Generate what the cell displays.
   *
   * **A date is written as its ISO instant rather than through `Cell#get:text`.** `ExcelJS` formats
   * a date with the running process's own locale and time zone, so one workbook would produce a
   * different grid on a developer's machine and on the host - and the grid is stored, so that
   * difference would be persisted rather than transient.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {string} - The text, empty when the cell holds nothing.
   */
  generateCellText ({
    cell,
  }) {
    const errorText = this.findErrorText({
      cell,
    })

    if (errorText !== null) {
      return errorText
    }

    const dateValue = this.findDateValue({
      cell,
    })

    if (dateValue !== null) {
      return dateValue.toISOString()
    }

    return cell.text
  }

  /**
   * Generate what the cell holds, so nothing downstream has to un-format a rendered string.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {string | null} - The value, or null when the cell holds none to state.
   */
  generateRawValue ({
    cell,
  }) {
    const dateValue = this.findDateValue({
      cell,
    })

    if (dateValue !== null) {
      return dateValue.toISOString()
    }

    const resolvedValue = this.readResolvedValue({
      cell,
    })

    if (typeof resolvedValue !== 'number') {
      return null
    }

    return String(resolvedValue)
  }

  /**
   * Generate the formula behind the cell.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {string | null} - The source, or null when the cell is not computed.
   */
  generateFormula ({
    cell,
  }) {
    return cell.formula ?? null
  }

  /**
   * Generate which spreadsheet error the cell holds.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null when the cell holds no error.
   */
  generateErrorCode ({
    cell,
  }) {
    const errorText = this.findErrorText({
      cell,
    })

    if (errorText === null) {
      return null
    }

    return ERROR_CODE_BY_ERROR_TEXT[errorText]
      ?? UNKNOWN_ERROR_CODE
  }

  /**
   * Find the error the cell holds, whether it holds one outright or computed one.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {string | null} - What the workbook stores, such as `#REF!`, or null when none.
   */
  findErrorText ({
    cell,
  }) {
    const resolvedValue = this.readResolvedValue({
      cell,
    })

    if (typeof resolvedValue !== 'object' || resolvedValue === null) {
      return null
    }

    if (!('error' in resolvedValue)) {
      return null
    }

    return String(resolvedValue.error)
  }

  /**
   * Find the date the cell holds.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {Date | null} - The date, or null when the cell holds none.
   */
  findDateValue ({
    cell,
  }) {
    const resolvedValue = this.readResolvedValue({
      cell,
    })

    if (!(resolvedValue instanceof Date)) {
      return null
    }

    return resolvedValue
  }

  /**
   * Read what the cell amounts to, looking through a formula to the result it was saved with.
   *
   * @param {{
   *   cell: ExcelJS.Cell
   * }} params - Parameters of this method.
   * @returns {*} - The value, or null when the cell is empty.
   */
  readResolvedValue ({
    cell,
  }) {
    const cellValue = cell.value ?? null

    if (typeof cellValue !== 'object' || cellValue === null) {
      return cellValue
    }

    if (!('result' in cellValue)) {
      return cellValue
    }

    return cellValue.result ?? null
  }
}

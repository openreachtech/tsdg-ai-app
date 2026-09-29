import ExcelJS from 'exceljs'

import CURRENCY_CONSTANT_HASH from '../constants/currency.js'
import NG_DETAIL_CODE_CONSTANT_HASH from '../constants/ngDetailCode.js'

import MinorUnitAmountConverter from './MinorUnitAmountConverter.js'
import WorksheetGridNormalizer from './WorksheetGridNormalizer.js'

/*
 * How the header is found. The sheet is read by looking for these words rather than by counting to
 * a known row, because layouts vary between subsidiaries (`OPEN-4`).
 *
 * **Each column accepts more than one wording**, because the observed workbook and the fixtures
 * this system was built against label the same column differently: the real header row reads
 * `Company` `Issue Date` `DM No.` `Cur` `DM Amount` `Description` (00-overview §2.1), and `DM No.`
 * shares no word with `Debit Note No.`. A parser knowing only one of the two would fail to find the
 * column on whichever sheet it was not written against.
 */
const HEADER_LABELS = {
  DEBIT_NOTE_NUMBER: [
    'debit note',
    'dm no',
  ],
  DESCRIPTION: [
    'description',
  ],
  CURRENCY: [
    'cur',
  ],
  AMOUNT: [
    'amount',
  ],
}

/*
 * How many of the four labels a row has to carry before it is taken for the header.
 *
 * **Two, and the debit-note-number label has to be one of them.** It was one, and that read a
 * sentence as a header: the observed workbook writes an instruction three rows above its table -
 * *"please confirm attaching the signed AFAP and evidence to your debit note(invoice)"* - and the
 * first row mentioning a debit note is therefore that sentence. Every one of its seven worksheets
 * then reported `amount_column_not_found`, naming a column that was there all along, three rows
 * below where the parse was looking.
 *
 * A sentence carries the phrase. A header row carries the phrase **and the words beside it**, which
 * is the difference this asks about. Two rather than four, because a header naming no amount column
 * is a real sheet that has to answer `amount_column_not_found` rather than `header_row_not_found` -
 * the two are different findings and the operator acts on them differently.
 */
const HEADER_LABEL_QUORUM = 2

/*
 * How the totals block is found: by shape, and no longer by what it is called.
 *
 * **The label rule could not survive the observed workbook.** It looked for a row saying `total`
 * below the header, and that sheet has two of them - a block labelled `CURR. SUBTOTAL` against its
 * **third** row, and below it a row labelled `TOTAL` whose figure is `COUNTA(...)`, a count of
 * documents. The label rule found the second: a block beginning at a piece count, running to the end
 * of the sheet, and taking in a stale `breakdown` block of `#REF!` cells on the way. Widening the
 * pattern to match `CURR. SUBTOTAL` would have made it start two rows into its own block and miss
 * the only currency stating an amount; narrowing it further would have kept reading `12 pcs.` as
 * money.
 *
 * What the block is, in every workbook seen so far, is **the run of rows stating a currency that
 * follows the line items** - and it ends where that run ends. Both of those are observable without
 * reading a word, which is why nothing here is spelled any more.
 */

/*
 * What a cell naming a currency looks like, before the master is consulted at all.
 *
 * ISO 4217 codes are exactly three letters, and the shape is what separates the two answers this
 * parser must keep apart: a cell of some other shape means **this row states no currency**, while
 * three letters the master does not carry means **this row states a currency nobody checked** -
 * which is `NG-004` rather than a row to skip (`TBL-15`). Without the shape test, the footer text
 * under a totals block would read as an unknown currency and take a readable sheet down with it.
 */
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u

/*
 * What is dropped from an amount written as text before it is read as a number.
 *
 * Whitespace, thousand separators, and the symbols the five currencies of `TBL-15` render as.
 * **The symbol is ornament and never the answer**: which currency a row is in comes from the `Cur`
 * column, so a cell reading `$1,234.56` in a row whose currency says `USD` is the same amount as
 * one reading `1234.56` (`DR-05`). Where the two disagree the column wins, because a symbol is a
 * formatting choice and the column is data.
 */
const AMOUNT_ORNAMENT_PATTERN = /[\s,¥￥$€£]/gu

const VISIBLE_WORKSHEET_STATE = 'visible'

const {
  CURRENCY,
} = CURRENCY_CONSTANT_HASH

const {
  NG_DETAIL_CODE,
} = NG_DETAIL_CODE_CONSTANT_HASH

const {
  UNREADABLE_COVER_SHEET,
} = NG_DETAIL_CODE

/**
 * Reads one worksheet of a cover sheet workbook (`TBL-05` `TBL-13` `ENG-01`).
 *
 * **No AI touches this path** (`DR-01` `ADR-03`). The Excel side is parsed deterministically so
 * that when a check disagrees with the operator, the disagreement is about a rule rather than about
 * what the sheet said.
 *
 * **A worksheet this cannot read is an answer, not an exception.** The caller gets a reason instead
 * of rows, and the job continues: the file still reaches `completed` and the batch's debit notes
 * carry `NG-004` (`FR-033` `DR-03`). Throwing here would make an unreadable sheet look like a
 * crashed job, which is a different thing with a different runbook.
 *
 * **The subtotals are read, never computed.** Check ② compares what the sheet claims against the
 * sum of its rows (`ENG-01`); a parser that summed the rows and called them the total would make
 * the check compare a number with itself and pass always.
 *
 * **Every worksheet is read, including the ones no rule could ever judge.** The grid and the used
 * range are what the preview renders (`FR-120` `FR-121`), and a hidden worksheet that was never a
 * candidate is still one the operator is told exists.
 */
export default class CoverSheetWorksheetParser {
  /**
   * Constructor.
   *
   * @param {{
   *   worksheet: ExcelJS.Worksheet
   *   sheetIndex: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    worksheet,
    sheetIndex,
  }) {
    this.worksheet = worksheet
    this.sheetIndex = sheetIndex
  }

  /**
   * Factory method.
   *
   * @param {{
   *   worksheet: ExcelJS.Worksheet
   *   sheetIndex: number
   * }} params - Parameters of this method.
   * @returns {CoverSheetWorksheetParser} - Instance of this class.
   */
  static create ({
    worksheet,
    sheetIndex,
  }) {
    return new this({
      worksheet,
      sheetIndex,
    })
  }

  /**
   * Read this worksheet.
   *
   * @returns {verification.ParsedCoverSheetWorksheet} - What the worksheet holds, or why it could not be read.
   */
  parseWorksheet () {
    const headerRowNumber = this.findHeaderRowNumber()

    const columnNumberHash = this.buildColumnNumberHash({
      headerRowNumber,
    })

    return {
      sheetIndex: this.sheetIndex,
      sheetName: this.worksheet.name,
      isHidden: this.isHiddenWorksheet(),
      isParsable: this.isParsableWorksheet({
        headerRowNumber,
        columnNumberHash,
      }),
      grid: this.generateGrid({
        headerRowNumber,
      }),
      rowCount: this.worksheet.rowCount,
      columnCount: this.worksheet.columnCount,
      ...this.buildWorksheetContents({
        headerRowNumber,
        columnNumberHash,
      }),
    }
  }

  /**
   * Find the row that labels the columns.
   *
   * @returns {number | null} - Row number of the header, or null when no row labels one.
   */
  findHeaderRowNumber () {
    const headerRowNumber = this.generateRowNumbers()
      .find(rowNumber =>
        this.isHeaderRow({
          rowNumber,
        })
      )

    return headerRowNumber ?? null
  }

  /**
   * Check whether one row labels the columns, rather than merely mentioning one of them.
   *
   * @param {{
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the row is the header.
   */
  isHeaderRow ({
    rowNumber,
  }) {
    const cellTexts = this.generateCellTexts({
      rowNumber,
    })

    const isDebitNoteNumberLabelled = this.isLabelledRow({
      cellTexts,
      headerLabels: HEADER_LABELS.DEBIT_NOTE_NUMBER,
    })

    if (!isDebitNoteNumberLabelled) {
      return false
    }

    return this.countLabelledColumns({
      cellTexts,
    }) >= HEADER_LABEL_QUORUM
  }

  /**
   * Count how many of the four columns one row puts a name to.
   *
   * @param {{
   *   cellTexts: Array<string>
   * }} params - Parameters of this method.
   * @returns {number} - How many.
   */
  countLabelledColumns ({
    cellTexts,
  }) {
    return Object.values(HEADER_LABELS)
      .filter(headerLabels =>
        this.isLabelledRow({
          cellTexts,
          headerLabels,
        })
      )
      .length
  }

  /**
   * Check whether any cell of a row holds any of the wordings one column is known by.
   *
   * @param {{
   *   cellTexts: Array<string>
   *   headerLabels: Array<string>
   * }} params - Parameters of this method.
   * @returns {boolean} - true: a cell holds one.
   */
  isLabelledRow ({
    cellTexts,
    headerLabels,
  }) {
    return cellTexts.some(cellText =>
      headerLabels.some(headerLabel => cellText.includes(headerLabel))
    )
  }

  /**
   * Build which column holds what, from the labels of the header row.
   *
   * The row number column is deliberately not looked for. `TBL-05.row_number` is the worksheet's
   * own row, so that an NG reason points at the cell the operator opens; a sheet's internal
   * numbering is its own data and says nothing about where to look.
   *
   * @param {{
   *   headerRowNumber: number | null
   * }} params - Parameters of this method.
   * @returns {verification.CoverSheetColumnNumberHash} - Column number of each, or null where the header labels none.
   */
  buildColumnNumberHash ({
    headerRowNumber,
  }) {
    if (headerRowNumber === null) {
      return {
        debitNoteNumber: null,
        description: null,
        currency: null,
        amount: null,
      }
    }

    const cellTexts = this.generateCellTexts({
      rowNumber: headerRowNumber,
    })

    return {
      debitNoteNumber: this.findColumnNumber({
        cellTexts,
        headerLabels: HEADER_LABELS.DEBIT_NOTE_NUMBER,
      }),
      description: this.findColumnNumber({
        cellTexts,
        headerLabels: HEADER_LABELS.DESCRIPTION,
      }),
      currency: this.findColumnNumber({
        cellTexts,
        headerLabels: HEADER_LABELS.CURRENCY,
      }),
      amount: this.findColumnNumber({
        cellTexts,
        headerLabels: HEADER_LABELS.AMOUNT,
      }),
    }
  }

  /**
   * Find the column whose label holds any of the wordings one column is known by.
   *
   * @param {{
   *   cellTexts: Array<string>
   *   headerLabels: Array<string>
   * }} params - Parameters of this method.
   * @returns {number | null} - Column number, or null when no cell holds one.
   */
  findColumnNumber ({
    cellTexts,
    headerLabels,
  }) {
    const cellIndex = cellTexts.findIndex(cellText =>
      headerLabels.some(headerLabel => cellText.includes(headerLabel))
    )

    if (cellIndex < 0) {
      return null
    }

    return cellIndex + 1
  }

  /**
   * Check whether the workbook keeps this worksheet out of sight.
   *
   * `veryHidden` counts as hidden. It is a worksheet Excel will not even offer to unhide, so
   * treating it as visible would let a rule of §6.3 choose one nobody could open.
   *
   * @returns {boolean} - true: the worksheet is hidden.
   */
  isHiddenWorksheet () {
    return this.worksheet.state !== VISIBLE_WORKSHEET_STATE
  }

  /**
   * Check whether a rule of §6.3 is allowed to choose this worksheet.
   *
   * "Parses" means the header row and the required columns were found, not merely that the
   * worksheet opened. A visible but empty worksheet is not parsable, so it loses to nothing rather
   * than winning by being the only thing there.
   *
   * @param {{
   *   headerRowNumber: number | null
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the worksheet may be judged.
   */
  isParsableWorksheet ({
    headerRowNumber,
    columnNumberHash,
  }) {
    if (headerRowNumber === null) {
      return false
    }

    if (columnNumberHash.amount === null) {
      return false
    }

    return columnNumberHash.currency !== null
  }

  /**
   * Generate the grid the preview renders.
   *
   * @param {{
   *   headerRowNumber: number | null
   * }} params - Parameters of this method.
   * @returns {model.CoverSheetGrid} - The grid.
   */
  generateGrid ({
    headerRowNumber,
  }) {
    return this.createWorksheetGridNormalizer({
      headerRowNumber,
    })
      .generateGrid()
  }

  /**
   * Create the normalizer this worksheet's grid is built by.
   *
   * @param {{
   *   headerRowNumber: number | null
   * }} params - Parameters of this method.
   * @returns {WorksheetGridNormalizer} - The normalizer.
   */
  createWorksheetGridNormalizer ({
    headerRowNumber,
  }) {
    return WorksheetGridNormalizer.create({
      worksheet: this.worksheet,
      headerRowNumber,
    })
  }

  /**
   * Build the rows and the subtotals, or the one reason neither could be read.
   *
   * The checks run in the order a reader meets the sheet - header, columns, rows, totals - so the
   * reason names the first thing that was missing rather than the last.
   *
   * @param {{
   *   headerRowNumber: number | null
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {verification.ParsedCoverSheetContents} - The contents, or the reason.
   */
  buildWorksheetContents ({
    headerRowNumber,
    columnNumberHash,
  }) {
    const structureDetailCode = this.findStructureDetailCode({
      headerRowNumber,
      columnNumberHash,
    })

    if (structureDetailCode !== null) {
      return this.buildUnreadableContents({
        unreadableDetailCode: structureDetailCode,
      })
    }

    return this.buildReadableContents({
      headerRowNumber: /** @type {number} */ (headerRowNumber),
      columnNumberHash,
    })
  }

  /**
   * Find what the worksheet's own layout is missing, before a single value is read.
   *
   * @param {{
   *   headerRowNumber: number | null
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {string | null} - The detail code, or null when the layout is complete.
   */
  findStructureDetailCode ({
    headerRowNumber,
    columnNumberHash,
  }) {
    if (headerRowNumber === null) {
      return UNREADABLE_COVER_SHEET.HEADER_ROW_NOT_FOUND
    }

    if (columnNumberHash.amount === null) {
      return UNREADABLE_COVER_SHEET.AMOUNT_COLUMN_NOT_FOUND
    }

    if (columnNumberHash.currency === null) {
      return UNREADABLE_COVER_SHEET.CURRENCY_COLUMN_NOT_FOUND
    }

    return null
  }

  /**
   * Build the contents of a worksheet that could not be read.
   *
   * The rows and the subtotals are dropped together rather than kept alongside the reason. Half a
   * reading is what `DR-03` forbids: a stated total with no rows would reconcile against a sum of
   * nothing, and rows with no stated total would look like a sheet that simply balances.
   *
   * @param {{
   *   unreadableDetailCode: string
   * }} params - Parameters of this method.
   * @returns {verification.ParsedCoverSheetContents} - No rows, no subtotals, and the reason.
   */
  buildUnreadableContents ({
    unreadableDetailCode,
  }) {
    return {
      coverSheetRows: [],
      statedSubtotals: [],
      unreadableDetailCode,
    }
  }

  /**
   * Build the contents of a worksheet whose layout was complete.
   *
   * @param {{
   *   headerRowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {verification.ParsedCoverSheetContents} - The contents, or the reason.
   */
  buildReadableContents ({
    headerRowNumber,
    columnNumberHash,
  }) {
    const rowsReading = this.readCoverSheetRows({
      headerRowNumber,
      columnNumberHash,
    })

    if (rowsReading.unreadableDetailCode !== null) {
      return this.buildUnreadableContents({
        unreadableDetailCode: rowsReading.unreadableDetailCode,
      })
    }

    if (rowsReading.coverSheetRows.length === 0) {
      return this.buildUnreadableContents({
        unreadableDetailCode: UNREADABLE_COVER_SHEET.NO_DATA_ROWS,
      })
    }

    const subtotalsReading = this.readStatedSubtotals({
      lastCoverSheetRowNumber: this.findLastCoverSheetRowNumber({
        coverSheetRows: rowsReading.coverSheetRows,
      }),
      columnNumberHash,
    })

    if (subtotalsReading.unreadableDetailCode !== null) {
      return this.buildUnreadableContents({
        unreadableDetailCode: subtotalsReading.unreadableDetailCode,
      })
    }

    if (subtotalsReading.statedSubtotals.length === 0) {
      return this.buildUnreadableContents({
        unreadableDetailCode: UNREADABLE_COVER_SHEET.SUBTOTAL_ROW_NOT_FOUND,
      })
    }

    return {
      coverSheetRows: rowsReading.coverSheetRows,
      statedSubtotals: subtotalsReading.statedSubtotals,
      unreadableDetailCode: null,
    }
  }

  /**
   * Find the worksheet row the last line item sits on.
   *
   * Where the table ends is where the totals block may begin, and the rows themselves are the only
   * thing that knows it: the collection stops at the first row that is not a line item, which is not
   * always the row after the last one it kept.
   *
   * @param {{
   *   coverSheetRows: Array<verification.ParsedCoverSheetRow>
   * }} params - Parameters of this method.
   * @returns {number} - The row number.
   */
  findLastCoverSheetRowNumber ({
    coverSheetRows,
  }) {
    return coverSheetRows[coverSheetRows.length - 1]
      .rowNumber
  }

  /**
   * Read the line items below the header, stopping at the first row that is not one.
   *
   * A row whose amount or currency cannot be read ends the collection rather than being stored as
   * zero: `TBL-05.amount_minor_units` is what check ③ compares against, and a zero there would pass
   * a comparison it never earned (`DR-05` `ADR-09`).
   *
   * **The row that ends the collection is looked at once more.** A row naming a currency the master
   * does not carry is not an absence but a value that was read, and inventing a scale for it would
   * multiply an amount by the wrong power of ten - so that one row turns the whole worksheet into
   * `NG-004 unknown_currency` (`TBL-15`).
   *
   * @param {{
   *   headerRowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {{
   *   coverSheetRows: Array<verification.ParsedCoverSheetRow>
   *   unreadableDetailCode: string | null
   * }} - The line items, or the reason none of them can be trusted.
   */
  readCoverSheetRows ({
    headerRowNumber,
    columnNumberHash,
  }) {
    const candidateRows = this.generateRowNumbers()
      .filter(rowNumber => rowNumber > headerRowNumber)
      .map(rowNumber =>
        this.buildCoverSheetRow({
          rowNumber,
          columnNumberHash,
        })
      )

    const stopIndex = candidateRows.findIndex(candidateRow => candidateRow.coverSheetRow === null)

    if (stopIndex >= 0 && candidateRows[stopIndex].isUnknownCurrency) {
      return {
        coverSheetRows: [],
        unreadableDetailCode: UNREADABLE_COVER_SHEET.UNKNOWN_CURRENCY,
      }
    }

    return {
      coverSheetRows: this.collectLeadingRows({
        candidateRows,
        stopIndex,
      }),
      unreadableDetailCode: null,
    }
  }

  /**
   * Build one line item, or answer that this row is not one.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {verification.CandidateCoverSheetRow} - The line item, or why the row is not one.
   */
  buildCoverSheetRow ({
    rowNumber,
    columnNumberHash,
  }) {
    const debitNoteNumber = this.readCellText({
      rowNumber,
      columnNumber: columnNumberHash.debitNoteNumber,
    })

    const currency = this.findRowCurrency({
      rowNumber,
      columnNumber: columnNumberHash.currency,
    })

    if (debitNoteNumber === null) {
      return {
        coverSheetRow: null,
        isUnknownCurrency: false,
      }
    }

    if (currency.isUnknownCurrency) {
      return {
        coverSheetRow: null,
        isUnknownCurrency: true,
      }
    }

    return {
      coverSheetRow: this.buildCoverSheetRowOfCurrency({
        rowNumber,
        columnNumberHash,
        debitNoteNumber,
        currency: currency.currency,
      }),
      isUnknownCurrency: false,
    }
  }

  /**
   * Build one line item whose currency the master carries.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   *   debitNoteNumber: string
   *   currency: verification.MasterCurrency | null
   * }} params - Parameters of this method.
   * @returns {verification.ParsedCoverSheetRow | null} - The line item, or null when the row is not one.
   */
  buildCoverSheetRowOfCurrency ({
    rowNumber,
    columnNumberHash,
    debitNoteNumber,
    currency,
  }) {
    if (currency === null) {
      return null
    }

    const amountMinorUnits = this.readCellMinorUnits({
      rowNumber,
      columnNumber: columnNumberHash.amount,
      minorUnitScale: currency.MINOR_UNIT_SCALE,
    })

    if (amountMinorUnits === null) {
      return null
    }

    return {
      rowNumber,
      debitNoteNumber,
      description: this.readCellText({
        rowNumber,
        columnNumber: columnNumberHash.description,
      }),
      currencyCode: currency.CODE,
      amountMinorUnits,
    }
  }

  /**
   * Collect the candidates that run unbroken from below the header row.
   *
   * @param {{
   *   candidateRows: Array<verification.CandidateCoverSheetRow>
   *   stopIndex: number
   * }} params - Parameters of this method.
   * @returns {Array<verification.ParsedCoverSheetRow>} - The line items, in worksheet order.
   */
  collectLeadingRows ({
    candidateRows,
    stopIndex,
  }) {
    const leadingRows = stopIndex < 0
      ? candidateRows
      : candidateRows.slice(0, stopIndex)

    return leadingRows.map(candidateRow =>
      /** @type {verification.ParsedCoverSheetRow} */ (candidateRow.coverSheetRow)
    )
  }

  /**
   * Read the subtotals the worksheet states, one per currency.
   *
   * **The block is the run of currency-stating rows below the line items.** The observed workbook
   * states one `SUMIFS` per currency rather than a single figure (00-overview §2.1), and nothing
   * sums across currencies (`DR-05`), so what is read here is a set rather than a number.
   *
   * A row of the block whose amount is simply missing is an absence check ② reports as `NG-001` with
   * the stated side null - the observed sheet states four such currencies, whose `SUMIFS` was never
   * evaluated because the month used none of them. A **cell error** is not that: it is a positive
   * finding that the workbook's own arithmetic is broken, and it stops the worksheet.
   *
   * @param {{
   *   lastCoverSheetRowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {{
   *   statedSubtotals: Array<model.CoverSheetStatedSubtotal>
   *   unreadableDetailCode: string | null
   * }} - The subtotals, or the reason they cannot be trusted.
   */
  readStatedSubtotals ({
    lastCoverSheetRowNumber,
    columnNumberHash,
  }) {
    const candidateSubtotals = this.collectSubtotalBlockRowNumbers({
      lastCoverSheetRowNumber,
      columnNumberHash,
    })
      .map(rowNumber =>
        this.buildStatedSubtotal({
          rowNumber,
          columnNumberHash,
        })
      )

    const blockDetailCode = this.findSubtotalBlockDetailCode({
      candidateSubtotals,
    })

    if (blockDetailCode !== null) {
      return {
        statedSubtotals: [],
        unreadableDetailCode: blockDetailCode,
      }
    }

    return {
      statedSubtotals: candidateSubtotals
        .map(candidateSubtotal => candidateSubtotal.statedSubtotal)
        .filter(statedSubtotal => statedSubtotal !== null),
      unreadableDetailCode: null,
    }
  }

  /**
   * Collect the rows of the totals block: the run stating a currency that follows the line items.
   *
   * **It stops at the first row that states none.** A block with no lower boundary reaches whatever
   * a sheet keeps below it, and the observed workbook keeps a stale breakdown of `#REF!` cells there
   * - which refused the whole worksheet over cells the check was never going to read.
   *
   * The search begins after the **last line item** rather than after the header, so a row of the
   * table cannot open the block. Blank rows before the block are passed over: every workbook seen so
   * far leaves one, and it says nothing either way.
   *
   * **It assumes the table is contiguous**, and that assumption is worth stating because nothing
   * here checks it. A worksheet with a blank row through the middle of its line items would end the
   * collection there, and the items below it state currencies like any other row - so they would be
   * read as the block. No workbook seen so far does that, and the rule it replaced would have
   * misread the same sheet differently rather than correctly (`OPEN-4`).
   *
   * @param {{
   *   lastCoverSheetRowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {Array<number>} - The row numbers, in sheet order, or none when the sheet states no total.
   */
  collectSubtotalBlockRowNumbers ({
    lastCoverSheetRowNumber,
    columnNumberHash,
  }) {
    const followingRowNumbers = this.generateRowNumbers()
      .filter(rowNumber => rowNumber > lastCoverSheetRowNumber)

    const blockStartIndex = followingRowNumbers.findIndex(rowNumber =>
      this.isCurrencyStatingRow({
        rowNumber,
        columnNumber: columnNumberHash.currency,
      })
    )

    if (blockStartIndex < 0) {
      return []
    }

    const blockRowNumbers = followingRowNumbers.slice(blockStartIndex)

    const blockEndIndex = blockRowNumbers.findIndex(rowNumber =>
      !this.isCurrencyStatingRow({
        rowNumber,
        columnNumber: columnNumberHash.currency,
      })
    )

    if (blockEndIndex < 0) {
      return blockRowNumbers
    }

    return blockRowNumbers.slice(0, blockEndIndex)
  }

  /**
   * Check whether one row names a currency in the column the header gave to currencies.
   *
   * A code the master does not carry still counts as one named. It is the block's business to report
   * that as `unknown_currency`, and a row dropped here for it would end the block early instead.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the row names one.
   */
  isCurrencyStatingRow ({
    rowNumber,
    columnNumber,
  }) {
    const currencyCode = this.readCellCurrencyCode({
      rowNumber,
      columnNumber,
    })

    return currencyCode !== null
  }

  /**
   * Build one subtotal, or answer that this row of the block states none.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumberHash: verification.CoverSheetColumnNumberHash
   * }} params - Parameters of this method.
   * @returns {verification.CandidateStatedSubtotal} - The subtotal, or why the row states none.
   */
  buildStatedSubtotal ({
    rowNumber,
    columnNumberHash,
  }) {
    const currency = this.findRowCurrency({
      rowNumber,
      columnNumber: columnNumberHash.currency,
    })

    if (currency.isUnknownCurrency) {
      return {
        statedSubtotal: null,
        isUnknownCurrency: true,
        isCellError: false,
      }
    }

    if (currency.currency === null) {
      return {
        statedSubtotal: null,
        isUnknownCurrency: false,
        isCellError: false,
      }
    }

    return {
      statedSubtotal: this.buildStatedSubtotalOfCurrency({
        rowNumber,
        columnNumber: columnNumberHash.amount,
        currency: currency.currency,
      }),
      isUnknownCurrency: false,
      isCellError: this.isErrorCell({
        rowNumber,
        columnNumber: columnNumberHash.amount,
      }),
    }
  }

  /**
   * Build the subtotal one row of the block states, in the currency it names.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   *   currency: verification.MasterCurrency
   * }} params - Parameters of this method.
   * @returns {model.CoverSheetStatedSubtotal | null} - The subtotal, or null when the amount cannot be read.
   */
  buildStatedSubtotalOfCurrency ({
    rowNumber,
    columnNumber,
    currency,
  }) {
    const amountMinorUnits = this.readCellMinorUnits({
      rowNumber,
      columnNumber,
      minorUnitScale: currency.MINOR_UNIT_SCALE,
    })

    if (amountMinorUnits === null) {
      return null
    }

    return {
      currencyCode: currency.CODE,
      amountMinorUnits,
      rowNumber,
    }
  }

  /**
   * Find what makes a totals block unusable as a whole.
   *
   * The unknown currency is answered before the cell error, so that a block carrying both names the
   * one that would have produced a wrong number rather than the one that produced none.
   *
   * @param {{
   *   candidateSubtotals: Array<verification.CandidateStatedSubtotal>
   * }} params - Parameters of this method.
   * @returns {string | null} - The detail code, or null when the block is usable.
   */
  findSubtotalBlockDetailCode ({
    candidateSubtotals,
  }) {
    const isUnknownCurrencyFound = candidateSubtotals.some(
      candidateSubtotal => candidateSubtotal.isUnknownCurrency
    )

    if (isUnknownCurrencyFound) {
      return UNREADABLE_COVER_SHEET.UNKNOWN_CURRENCY
    }

    const isCellErrorFound = candidateSubtotals.some(
      candidateSubtotal => candidateSubtotal.isCellError
    )

    if (isCellErrorFound) {
      return UNREADABLE_COVER_SHEET.CELL_ERROR_IN_SUBTOTAL
    }

    return null
  }

  /**
   * Find which currency one row names, and whether it named one nobody checked.
   *
   * The two null answers are deliberately different. A cell of some other shape means the row
   * states no currency at all, which is an ordinary row to skip; three letters the master does not
   * carry means the row states one this system has never scaled, which is `NG-004`.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   * }} params - Parameters of this method.
   * @returns {{
   *   currency: verification.MasterCurrency | null
   *   isUnknownCurrency: boolean
   * }} - The currency, or which kind of absence this is.
   */
  findRowCurrency ({
    rowNumber,
    columnNumber,
  }) {
    const currencyCode = this.readCellCurrencyCode({
      rowNumber,
      columnNumber,
    })

    if (currencyCode === null) {
      return {
        currency: null,
        isUnknownCurrency: false,
      }
    }

    if (!Object.hasOwn(CURRENCY, currencyCode)) {
      return {
        currency: null,
        isUnknownCurrency: true,
      }
    }

    return {
      currency: CURRENCY[currencyCode],
      isUnknownCurrency: false,
    }
  }

  /**
   * Read one cell as a currency code.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, upper-cased, or null when the cell is not shaped like one.
   */
  readCellCurrencyCode ({
    rowNumber,
    columnNumber,
  }) {
    const cellText = this.readCellText({
      rowNumber,
      columnNumber,
    })

    if (cellText === null) {
      return null
    }

    const currencyCode = cellText.toUpperCase()

    if (!CURRENCY_CODE_PATTERN.test(currencyCode)) {
      return null
    }

    return currencyCode
  }

  /**
   * Generate the row numbers the worksheet holds, in order.
   *
   * @returns {Array<number>} - Row numbers.
   */
  generateRowNumbers () {
    return Array.from(
      {
        length: this.worksheet.rowCount,
      },
      (unusedValue, rowIndex) => rowIndex + 1
    )
  }

  /**
   * Generate the text of every cell of one row, lower-cased and trimmed for matching.
   *
   * @param {{
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {Array<string>} - Cell texts, the first entry being column 1.
   */
  generateCellTexts ({
    rowNumber,
  }) {
    const cellTexts = Array.from(
      {
        length: this.worksheet.getRow(rowNumber).cellCount,
      },
      (unusedValue, cellIndex) =>
        this.readCellText({
          rowNumber,
          columnNumber: cellIndex + 1,
        })
    )

    return cellTexts.map(cellText => cellText?.toLowerCase() ?? '')
  }

  /**
   * Read one cell as text.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The text, or null when the cell holds nothing.
   */
  readCellText ({
    rowNumber,
    columnNumber,
  }) {
    if (columnNumber === null) {
      return null
    }

    const cellValue = this.readCellValue({
      rowNumber,
      columnNumber,
    })

    if (cellValue === null || typeof cellValue === 'object') {
      return null
    }

    const cellText = String(cellValue)
      .trim()

    if (cellText === '') {
      return null
    }

    return cellText
  }

  /**
   * Read one cell as an exact count of a currency's minor unit.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   *   minorUnitScale: number
   * }} params - Parameters of this method.
   * @returns {number | null} - The count, or null when the cell is not an amount.
   */
  readCellMinorUnits ({
    rowNumber,
    columnNumber,
    minorUnitScale,
  }) {
    if (columnNumber === null) {
      return null
    }

    return MinorUnitAmountConverter.create({
      amountLike: this.readAmountText({
        rowNumber,
        columnNumber,
      }),
      minorUnitScale,
    })
      .generateMinorUnits()
  }

  /**
   * Read one cell as the decimal digits of an amount.
   *
   * **A number is handed on as its own shortest text, not as a float.** `String(897.95)` is
   * `'897.95'`, and those digits are what `MinorUnitAmountConverter` moves the point on - so no
   * arithmetic happens at a precision the amount does not have (`FR-035` `ADR-19`).
   *
   * A magnitude a workbook could only state in exponential notation is refused by the converter,
   * because those digits cannot be re-cut. No amount in this domain reaches one.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number
   * }} params - Parameters of this method.
   * @returns {string | null} - The digits, or null when the cell holds no amount.
   */
  readAmountText ({
    rowNumber,
    columnNumber,
  }) {
    const cellValue = this.readCellValue({
      rowNumber,
      columnNumber,
    })

    if (typeof cellValue === 'number') {
      return String(cellValue)
    }

    if (typeof cellValue !== 'string') {
      return null
    }

    return cellValue.replace(AMOUNT_ORNAMENT_PATTERN, '')
  }

  /**
   * Check whether one cell holds a spreadsheet error, computed or stated outright.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number | null
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the cell holds an error.
   */
  isErrorCell ({
    rowNumber,
    columnNumber,
  }) {
    if (columnNumber === null) {
      return false
    }

    const cellValue = this.readCellValue({
      rowNumber,
      columnNumber,
    })

    if (typeof cellValue !== 'object' || cellValue === null) {
      return false
    }

    return 'error' in cellValue
  }

  /**
   * Read the value behind one cell.
   *
   * A cell holding a formula answers with an object rather than a value, and a real cover sheet
   * states its subtotals with `SUMIFS`. What matters here is the result the workbook was saved
   * with.
   *
   * A cell covered by a merge is answered as empty. Reading one is unsafe - `ExcelJS` throws from
   * `Cell#get:text` when the merge holds nothing - and its content belongs to the anchor anyway.
   *
   * @param {{
   *   rowNumber: number
   *   columnNumber: number
   * }} params - Parameters of this method.
   * @returns {*} - The value, or null when the cell is empty.
   */
  readCellValue ({
    rowNumber,
    columnNumber,
  }) {
    const cell = this.worksheet.getCell(rowNumber, columnNumber)

    if (cell.type === ExcelJS.ValueType.Merge) {
      return null
    }

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

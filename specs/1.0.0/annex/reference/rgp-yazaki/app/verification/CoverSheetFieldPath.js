/*
 * The two arrays a cover sheet's fields hang off in `TBL-14.field_path`.
 *
 * Module-local because nothing outside builds a path: callers name a member and an index, and this
 * class is the only place that knows how the two are spelled together.
 */
const COVER_SHEET_ROWS_ARRAY_NAME = 'rows'
const STATED_SUBTOTALS_ARRAY_NAME = 'statedSubtotals'

/**
 * How `TBL-14.field_path` names one field of one cover-sheet row or one stated subtotal.
 *
 * **The index is the row's own number, never its position in the array** (§6.2). `ENG-04` matches a
 * read row to a parsed row by `TBL-05.row_number` and **never by content**, so the stored key has to
 * be reachable from that number alone - `rows[4].amount` can be looked up by a check that knows only
 * which worksheet row it is examining, where `rows[0].amount` would need the reading's own array to
 * be replayed first. A subtotal is indexed by its currency code for the same reason: there is one
 * per currency, and the currency is the only thing that tells two of them apart.
 *
 * **The indexed form is a storage key, and the stripped form is a dictionary key.** `constants/
 * fieldPath` owns the stripped vocabulary (`coverSheetRow.amount`) that `NG-007` carries into a
 * rendered sentence; this class owns the indexed one, and neither is derived from the other by
 * string surgery (`DR-13`).
 *
 * A sibling of `ApprovalBlockFieldPath`, which does the same job for the other branch of §7.2.
 */
export default class CoverSheetFieldPath {
  /**
   * Constructor.
   *
   * @param {{
   *   rowNumber: number | null
   *   currencyCode: string | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    rowNumber,
    currencyCode,
  }) {
    this.rowNumber = rowNumber
    this.currencyCode = currencyCode
  }

  /**
   * Factory method for one line item row.
   *
   * @param {{
   *   rowNumber: number
   * }} params - Parameters of this method.
   * @returns {CoverSheetFieldPath} - Instance of this class.
   * @public
   */
  static createForRow ({
    rowNumber,
  }) {
    return new this({
      rowNumber,
      currencyCode: null,
    })
  }

  /**
   * Factory method for one stated subtotal.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {CoverSheetFieldPath} - Instance of this class.
   * @public
   */
  static createForStatedSubtotal ({
    currencyCode,
  }) {
    return new this({
      rowNumber: null,
      currencyCode,
    })
  }

  /**
   * get: The three members a line item row carries, as `TBL-14` spells them.
   *
   * @returns {{
   *   DEBIT_NOTE_NUMBER: string
   *   CURRENCY_CODE: string
   *   AMOUNT: string
   * }} - Member name by role.
   * @public
   */
  static get rowMemberName () {
    return {
      DEBIT_NOTE_NUMBER: 'debitNoteNumber',
      CURRENCY_CODE: 'currencyCode',
      AMOUNT: 'amount',
    }
  }

  /**
   * get: The one member a stated subtotal carries.
   *
   * A subtotal's own currency code is its index rather than one of its fields, so the amount is all
   * there is to read - which is why `statedSubtotal.currencyCode` is not in the stripped vocabulary
   * either (§6.2).
   *
   * @returns {{
   *   AMOUNT: string
   * }} - Member name by role.
   * @public
   */
  static get statedSubtotalMemberName () {
    return {
      AMOUNT: 'amount',
    }
  }

  /**
   * Build the stored path of one member of this row.
   *
   * @param {{
   *   memberName: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, as `TBL-14` stores it.
   * @public
   */
  buildRowMemberPath ({
    memberName,
  }) {
    return `${COVER_SHEET_ROWS_ARRAY_NAME}[${this.rowNumber}].${memberName}`
  }

  /**
   * Build the stored path of one member of this stated subtotal.
   *
   * @param {{
   *   memberName: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, as `TBL-14` stores it.
   * @public
   */
  buildStatedSubtotalMemberPath ({
    memberName,
  }) {
    return `${STATED_SUBTOTALS_ARRAY_NAME}[${this.currencyCode}].${memberName}`
  }
}

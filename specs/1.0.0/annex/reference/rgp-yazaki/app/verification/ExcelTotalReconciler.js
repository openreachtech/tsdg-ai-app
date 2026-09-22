import CurrencyResolver from './CurrencyResolver.js'

/*
 * Where a currency the master does not carry is ordered.
 *
 * It cannot arise from a parse - a row naming an unknown code stops the worksheet with `NG-004`
 * before any of this runs - so this is a guard rather than a case. Sorting it last keeps the output
 * a total order instead of leaving two such entries in whatever order the inputs happened to be in.
 */
const UNKNOWN_CURRENCY_DISPLAY_ORDER = Number.MAX_SAFE_INTEGER

/**
 * Check ②: does each currency's stated subtotal equal the sum of the rows in that currency
 * (`ENG-01` `FR-030`)?
 *
 * **One answer per currency, and nothing that spans two** (`DR-05` rule 5). The observed workbook's
 * `TOTAL` row is a per-currency `SUMIFS`, and a single figure spanning USD and JPY would be
 * arithmetic on incomparable units - so there is no grand total here, and no currency's outcome
 * depends on another's.
 *
 * **A currency present on one side only is `NG-001` with the missing side null, never a pass by
 * absence** (rule 4). Rows in a currency the totals block forgot, and a subtotal for a currency no
 * row carries, are both defects of the sheet; answering either with "nothing to compare, so fine"
 * is the silent OK `DR-03` exists to forbid.
 *
 * Pure arithmetic over integers, no AI and no network (`DR-02`). It runs against the parse rather
 * than against what was stored, so the outcome written beside a worksheet is by construction the
 * outcome of that worksheet's own rows - a read-back could only differ from them by being stale.
 */
export default class ExcelTotalReconciler {
  /**
   * Constructor.
   *
   * @param {{
   *   coverSheetRows: Array<verification.ParsedCoverSheetRow>
   *   statedSubtotals: Array<model.CoverSheetStatedSubtotal>
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    coverSheetRows,
    statedSubtotals,
    currencyResolver,
  }) {
    this.coverSheetRows = coverSheetRows
    this.statedSubtotals = statedSubtotals
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   coverSheetRows: Array<verification.ParsedCoverSheetRow>
   *   statedSubtotals: Array<model.CoverSheetStatedSubtotal>
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {ExcelTotalReconciler} - Instance of this class.
   */
  static create ({
    coverSheetRows,
    statedSubtotals,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      coverSheetRows,
      statedSubtotals,
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
   * Reconcile every currency the worksheet mentions.
   *
   * @returns {Array<model.CoverSheetReconciliation>} - One outcome per currency, in master order.
   */
  reconcileCurrencies () {
    return this.collectCurrencyCodes()
      .map(currencyCode =>
        this.reconcileCurrency({
          currencyCode,
        })
      )
  }

  /**
   * Collect every currency either side names, in the order the master displays them.
   *
   * **The union of both sides, not the rows alone.** A subtotal whose currency no row carries has
   * to reach the output to be reported at all, and taking the currencies from the rows would drop
   * exactly the half of rule 4 that a sheet is most likely to get wrong.
   *
   * @returns {Array<string>} - The currency codes, each once.
   */
  collectCurrencyCodes () {
    const mentionedCodes = [
      ...this.coverSheetRows.map(it => it.currencyCode),
      ...this.statedSubtotals.map(it => it.currencyCode),
    ]

    return Array.from(new Set(mentionedCodes))
      .toSorted((formerCode, latterCode) =>
        this.generateDisplayOrder({
          currencyCode: formerCode,
        })
        - this.generateDisplayOrder({
          currencyCode: latterCode,
        })
      )
  }

  /**
   * Generate where the master places one currency.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {number} - The display order.
   */
  generateDisplayOrder ({
    currencyCode,
  }) {
    const displayOrder = this.currencyResolver.findDisplayOrder({
      currencyCode,
    })

    return displayOrder
      ?? UNKNOWN_CURRENCY_DISPLAY_ORDER
  }

  /**
   * Reconcile one currency.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {model.CoverSheetReconciliation} - What this currency reconciles to.
   */
  reconcileCurrency ({
    currencyCode,
  }) {
    const statedMinorUnits = this.findStatedMinorUnits({
      currencyCode,
    })

    const computedMinorUnits = this.computeRowTotalMinorUnits({
      currencyCode,
    })

    return {
      currencyCode,
      statedMinorUnits,
      computedMinorUnits,
      isReconciled: this.isReconciledCurrency({
        statedMinorUnits,
        computedMinorUnits,
      }),
    }
  }

  /**
   * Find what the totals block states for one currency.
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {number | null} - The subtotal, or null when the block states none for it.
   */
  findStatedMinorUnits ({
    currencyCode,
  }) {
    const statedSubtotal = this.statedSubtotals
      .find(it => it.currencyCode === currencyCode)

    return statedSubtotal?.amountMinorUnits ?? null
  }

  /**
   * Sum the rows carrying one currency.
   *
   * **Only the rows of this currency**, and nothing converted into it. Every amount reaching here is
   * already an exact count of its own currency's minor unit, so the sum is integer addition within
   * one unit rather than arithmetic across two (`DR-05`).
   *
   * @param {{
   *   currencyCode: string
   * }} params - Parameters of this method.
   * @returns {number | null} - The sum, or null when no row carries this currency.
   */
  computeRowTotalMinorUnits ({
    currencyCode,
  }) {
    const currencyRows = this.coverSheetRows
      .filter(it => it.currencyCode === currencyCode)

    if (currencyRows.length === 0) {
      return null
    }

    return currencyRows
      .reduce((total, coverSheetRow) => total + coverSheetRow.amountMinorUnits, 0)
  }

  /**
   * Decide whether one currency reconciles.
   *
   * **Equal, in minor units, is the whole condition** - which is how the observed float total
   * `5002.6899999999996` reconciles against `500269`: the parse rounded the stated value to the
   * currency's scale once on the way in, and every comparison after that is between integers
   * (`OPEN-6`).
   *
   * @param {{
   *   statedMinorUnits: number | null
   *   computedMinorUnits: number | null
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the two sides agree.
   */
  isReconciledCurrency ({
    statedMinorUnits,
    computedMinorUnits,
  }) {
    if (statedMinorUnits === null) {
      return false
    }

    return statedMinorUnits === computedMinorUnits
  }
}

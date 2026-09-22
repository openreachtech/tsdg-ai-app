import AmountFormatter from './AmountFormatter.js'

/**
 * One currency's subtotal, in the shape the operator schema declares for it.
 *
 * **`CurrencySubtotal` is one type answered by three paths.** `API-Q002` carries what the judged
 * worksheet reconciled to, and `API-Q005` carries it again for the worksheet it opens - which is
 * the judged one when nothing was asked for, and any other worksheet when one was, where nothing
 * was computed and the stated figures stand alone. Three copies of the shape would eventually
 * disagree about the same worksheet, which is the reasoning `BatchFileSummaryFormatter` and
 * `DebitNoteResultSummaryFormatter` were extracted under.
 *
 * **The verdict the wire carries says less than the stored one, deliberately.** `ENG-01` stores
 * `false` where a side is missing, because it has to decide something to raise `NG-001`. Here that
 * becomes null: a currency with rows and no stated subtotal was never compared, and a client told
 * `false` would render "not reconciled" for a comparison that never happened (30-api-contract.md
 * §2.5).
 *
 * **The currency is resolved by the caller.** `CurrencyResolver` lives with the engine, and nothing
 * under `app/tools/` reaches into it - that direction of the boundary `DR-02` describes is the one
 * a lint rule can check, so it is kept empty rather than crossed for two lines. The stored code
 * still reaches the wire when the master carries no such row, because it is what says which
 * currency the worksheet named.
 */
export default class CurrencySubtotalFormatter {
  /**
   * Constructor.
   *
   * @param {{
   *   subtotalOutcome: verification.CurrencySubtotalOutcome
   *   currency: verification.MasterCurrency | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    subtotalOutcome,
    currency,
  }) {
    this.subtotalOutcome = subtotalOutcome
    this.currency = currency
  }

  /**
   * Factory method.
   *
   * @param {{
   *   subtotalOutcome: verification.CurrencySubtotalOutcome
   *   currency: verification.MasterCurrency | null
   * }} params - Parameters of this method.
   * @returns {CurrencySubtotalFormatter} - Instance of this class.
   */
  static create ({
    subtotalOutcome,
    currency,
  }) {
    return new this({
      subtotalOutcome,
      currency,
    })
  }

  /**
   * Format the subtotal.
   *
   * @returns {graphql.operator.CurrencySubtotal} - One currency.
   */
  formatSubtotal () {
    return {
      currencyCode: this.subtotalOutcome.currencyCode,
      statedTotal: this.formatAmount({
        amountLike: this.subtotalOutcome.statedMinorUnits,
      }),
      computedTotal: this.formatAmount({
        amountLike: this.subtotalOutcome.computedMinorUnits,
      }),
      isReconciled: this.findReconciledFlag(),
    }
  }

  /**
   * Format one side of the comparison.
   *
   * @param {{
   *   amountLike: number | string | null
   *   AmountFormatterCtor?: typeof AmountFormatter
   * }} params - Parameters of this method.
   * @returns {graphql.operator.Amount | null} - The figure, or null where that side is absent.
   */
  formatAmount ({
    amountLike,
    AmountFormatterCtor = AmountFormatter,
  }) {
    return AmountFormatterCtor.create({
      amountLike,
      currency: this.currency,
    })
      .formatAmount()
  }

  /**
   * Find whether the two sides agreed, or whether that was answerable at all.
   *
   * Null on three cases, and they are one statement: there was no comparison. A currency stated but
   * absent from the rows, a currency in the rows but stated nowhere, and a worksheet nothing was
   * judged on all leave one side missing or the engine unrun.
   *
   * @returns {boolean | null} - What the comparison concluded, or null when there was none.
   */
  findReconciledFlag () {
    if (this.subtotalOutcome.statedMinorUnits === null) {
      return null
    }

    if (this.subtotalOutcome.computedMinorUnits === null) {
      return null
    }

    return this.subtotalOutcome.isReconciled
  }
}

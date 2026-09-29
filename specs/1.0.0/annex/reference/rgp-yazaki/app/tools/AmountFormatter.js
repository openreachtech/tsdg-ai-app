/*
 * An exact integer, optionally signed, and nothing else.
 *
 * Deliberately stricter than `Number()`: a `BIGINT` column holds a whole count of minor units, so
 * a fraction, an empty string or a hexadecimal literal arriving here means something other than
 * that column is being formatted, and answering null says so. `MinorUnitAmountConverter` is where a
 * decimal figure becomes minor units; by the time an amount reaches the wire that has happened.
 */
const MINOR_UNITS_TEXT_PATTERN = /^-?\d+$/u

/**
 * One stored amount, in the shape the operator schema declares for it (30-api-contract.md §2.5).
 *
 * **The digits never pass through a float.** A `BIGINT` comes back from MariaDB as a string and
 * from SQLite as a number (`ADR-06`), and the string is handed on as it arrived rather than read
 * into a `Number` and written back out. That is the whole reason `minorUnits` is a decimal string:
 * §2.5 forbids a value that has passed through a float, and routing 19 digits through a double
 * would reintroduce at 2^53 exactly the ceiling the string encoding exists to remove.
 *
 * **The currency is resolved by the caller, not here.** Which master row an amount belongs to is
 * read from a `CurrencyId` on one table and from a stored code on another, and `CurrencyResolver`
 * already owns crossing between the two. This class holds no lookup, so it cannot be a second
 * place where an id is compared against `TBL-15` without the dialect in mind.
 *
 * **A currency the master does not carry answers null, and so does an unreadable figure.** Both
 * are the same statement - there is no amount to show - and the schema makes every field that can
 * be absent nullable for it. A zero would be rendered as an amount somebody could compare against
 * (`ADR-09` `DR-03`).
 */
export default class AmountFormatter {
  /**
   * Constructor.
   *
   * @param {{
   *   amountLike: number | string | null
   *   currency: verification.MasterCurrency | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    amountLike,
    currency,
  }) {
    this.amountLike = amountLike
    this.currency = currency
  }

  /**
   * Factory method.
   *
   * @param {{
   *   amountLike: number | string | null
   *   currency: verification.MasterCurrency | null
   * }} params - Parameters of this method.
   * @returns {AmountFormatter} - Instance of this class.
   */
  static create ({
    amountLike,
    currency,
  }) {
    return new this({
      amountLike,
      currency,
    })
  }

  /**
   * Format the amount.
   *
   * @returns {graphql.operator.Amount | null} - The amount, or null when there is none to show.
   */
  formatAmount () {
    if (!this.currency) {
      return null
    }

    const minorUnits = this.generateMinorUnitsText()

    if (minorUnits === null) {
      return null
    }

    return {
      minorUnits,
      currencyCode: this.currency.CODE,
      minorUnitScale: this.currency.MINOR_UNIT_SCALE,
    }
  }

  /**
   * Generate the count of minor units as the digits it is stored as.
   *
   * @returns {string | null} - The digits, or null when the column holds no whole count.
   */
  generateMinorUnitsText () {
    const candidateText = this.generateCandidateText()

    if (candidateText === null) {
      return null
    }

    if (!MINOR_UNITS_TEXT_PATTERN.test(candidateText)) {
      return null
    }

    return candidateText
  }

  /**
   * Generate the text the stored value would be written as, whichever way the dialect returned it.
   *
   * A number is refused unless it is a safe integer, because past 2^53 the double no longer names
   * one count rather than its neighbour - and a figure that has already lost a digit is worse on
   * the wire than an absent one, since the client cannot tell it apart from an exact figure.
   *
   * @returns {string | null} - The text, or null when the value is neither dialect's answer.
   */
  generateCandidateText () {
    if (typeof this.amountLike === 'string') {
      return this.amountLike
    }

    if (!Number.isSafeInteger(this.amountLike)) {
      return null
    }

    return String(this.amountLike)
  }
}

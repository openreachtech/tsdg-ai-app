import CURRENCY_CONSTANT_HASH from '../constants/currency.js'

const {
  CURRENCY,
} = CURRENCY_CONSTANT_HASH

/**
 * One lookup over the currency master, for everything that has to cross between a code and a row
 * (`TBL-15` `DR-05`).
 *
 * **The id direction is the reason this is a class rather than a hash read at each call site.** A
 * `BIGINT` reads back as a string from MariaDB and as a number from SQLite, so
 * `row.CurrencyId === CURRENCY.JPY.ID` holds in the tests and quietly stops holding in the
 * environment that matters (`ADR-06`). Comparing as a number is one line, and one line repeated at
 * five call sites is one line somebody eventually writes without it.
 *
 * **An unknown code or id answers null, and never throws.** A currency nobody checked reaching the
 * engine is a reading defect the checks already report - `ENG-02` rule 4 turns it into `NG-002`
 * because a code the master does not carry cannot equal a cover sheet's - and turning it into a
 * failed file instead would replace a stated NG with a different runbook (`DR-03`).
 */
export default class CurrencyResolver {
  /**
   * Constructor.
   *
   * @param {{
   *   currencyHash: Record<string, verification.MasterCurrency>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    currencyHash,
  }) {
    this.currencyHash = currencyHash
  }

  /**
   * Factory method.
   *
   * @param {{
   *   currencyHash?: Record<string, verification.MasterCurrency>
   * }} [params] - Parameters of this method.
   * @returns {CurrencyResolver} - Instance of this class.
   */
  static create ({
    currencyHash = CURRENCY,
  } = {}) {
    return new this({
      currencyHash,
    })
  }

  /**
   * Find which currency an id names.
   *
   * @param {{
   *   currencyId: number | string | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null for an id the master does not carry.
   */
  findCurrencyCode ({
    currencyId,
  }) {
    return this.findCurrencyById({
      currencyId,
    })
      ?.CODE
      ?? null
  }

  /**
   * Find the master row an id names.
   *
   * @param {{
   *   currencyId: number | string | null
   * }} params - Parameters of this method.
   * @returns {verification.MasterCurrency | null} - The row, or null when there is none.
   */
  findCurrencyById ({
    currencyId,
  }) {
    if (currencyId === null) {
      return null
    }

    const comparedId = Number(currencyId)

    return Object.values(this.currencyHash)
      .find(currency => currency.ID === comparedId)
      ?? null
  }

  /**
   * Find which id a currency code has.
   *
   * @param {{
   *   currencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {number | null} - The id, or null for a code the master does not carry.
   */
  findCurrencyId ({
    currencyCode,
  }) {
    return this.findCurrencyByCode({
      currencyCode,
    })
      ?.ID
      ?? null
  }

  /**
   * Find how many decimal digits a currency's minor unit carries.
   *
   * @param {{
   *   currencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {number | null} - The scale, or null for a code the master does not carry.
   */
  findMinorUnitScale ({
    currencyCode,
  }) {
    return this.findCurrencyByCode({
      currencyCode,
    })
      ?.MINOR_UNIT_SCALE
      ?? null
  }

  /**
   * Find where the master places a currency.
   *
   * @param {{
   *   currencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {number | null} - The display order, or null for a code the master does not carry.
   */
  findDisplayOrder ({
    currencyCode,
  }) {
    return this.findCurrencyByCode({
      currencyCode,
    })
      ?.DISPLAY_ORDER
      ?? null
  }

  /**
   * Find the master row a code names.
   *
   * @param {{
   *   currencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {verification.MasterCurrency | null} - The row, or null when there is none.
   */
  findCurrencyByCode ({
    currencyCode,
  }) {
    if (currencyCode === null) {
      return null
    }

    if (!Object.hasOwn(this.currencyHash, currencyCode)) {
      return null
    }

    return this.currencyHash[currencyCode]
  }
}

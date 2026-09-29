import CANONICAL_BOOLEAN_TEXT_CONSTANT_HASH from '../constants/canonicalBooleanText.js'

import CurrencyResolver from './CurrencyResolver.js'
import MinorUnitAmountConverter from './MinorUnitAmountConverter.js'

const {
  CANONICAL_BOOLEAN_TEXT,
} = CANONICAL_BOOLEAN_TEXT_CONSTANT_HASH

/*
 * How far an amount is shifted when the master carries no scale for its currency.
 *
 * Nothing, so the figure is counted exactly as the document wrote it. See `#findMinorUnitScale()` -
 * this is what keeps an unrecognized currency an `NG-002` rather than an `NG-005`.
 */
const UNKNOWN_CURRENCY_MINOR_UNIT_SCALE = 0

/**
 * Step 1 of `ENG-05`: what a read value has to be turned into before two readings can be compared.
 *
 * **Comparison is the only reason this exists.** `ENG-05` counts identical values, and two readings
 * that wrote the same fact differently - `897.95` against `897.950`, `Approved By` against
 * `APPROVED BY` - would be counted as a disagreement and reported as `NG-008`. Canonicalizing first
 * is what makes an agreement level a measurement of the document rather than of the model's
 * punctuation (`DR-14`).
 *
 * **What comes out is also what is stored.** `TBL-14.consensus_value` holds the canonical form
 * precisely because it is what the comparison was made on; a column holding one form while the
 * count was taken on another could not be recomputed from `TBL-06`, which `NFR-031` requires.
 *
 * **A string is upper-cased with no exception for a name.** `approverLastName` therefore stores as
 * `FAKE FUJITA`, and that is the rule doing its job rather than an oversight: a per-field exception
 * would be exactly the unwritten convention this project refuses, and two readings that differ only
 * in case are the same reading.
 *
 * **The amount conversion moved here from `DebitNoteJudge`** (§7.2). The model reports the figure as
 * the document prints it and the engine counts minor units, so the shift belongs to the step §7.2
 * names for it - and it has to happen before the count, because `897.95` and `897.950` are one
 * amount and two strings.
 */
export default class ReadingValueCanonicalizer {
  /**
   * Constructor.
   *
   * @param {{
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    currencyResolver,
  }) {
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   currencyResolver?: CurrencyResolver
   * }} [params] - Parameters of this method.
   * @returns {ReadingValueCanonicalizer} - Instance of this class.
   */
  static create ({
    currencyResolver = this.createCurrencyResolver(),
  } = {}) {
    return new this({
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
   * Canonicalize a string a reading returned.
   *
   * @param {{
   *   text: string | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The canonical form, or null when nothing was read.
   */
  canonicalizeText ({
    text,
  }) {
    if (text === null) {
      return null
    }

    return text
      .trim()
      .toUpperCase()
  }

  /**
   * Canonicalize a boolean a reading returned.
   *
   * **Null stays null rather than becoming a third word.** A signature field the model could not
   * make out is not a value the readings can agree on; it is the absence `ENG-03` rule 5 answers
   * `NG-010` to, and spelling it would let it be compared as though somebody had seen something
   * (`DR-03`).
   *
   * @param {{
   *   booleanLike: boolean | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The canonical form, or null when nothing was read.
   */
  canonicalizeBoolean ({
    booleanLike,
  }) {
    if (booleanLike === null) {
      return null
    }

    if (booleanLike) {
      return CANONICAL_BOOLEAN_TEXT.TRUE
    }

    return CANONICAL_BOOLEAN_TEXT.FALSE
  }

  /**
   * Canonicalize a plain count a reading returned, such as the page count.
   *
   * @param {{
   *   countLike: number | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The canonical form, or null when nothing was read.
   */
  canonicalizeCount ({
    countLike,
  }) {
    if (countLike === null) {
      return null
    }

    return String(countLike)
  }

  /**
   * Canonicalize an amount a reading returned, as an exact count of its currency's minor unit.
   *
   * **The shift is made from the decimal string, once, half-up** (§6.1 step 1). `897.95` as a double
   * times 100 is `89794.999...`, and one minor unit is the difference between OK and `NG-002`.
   *
   * @param {{
   *   readingAmount: ai.ReadingAmount | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The canonical form, or null when nothing was read.
   */
  canonicalizeAmount ({
    readingAmount,
  }) {
    if (readingAmount === null) {
      return null
    }

    const minorUnits = this.createMinorUnitAmountConverter({
      readingAmount,
    })
      .generateMinorUnits()

    return this.canonicalizeCount({
      countLike: minorUnits,
    })
  }

  /**
   * Create the conversion one amount is counted through.
   *
   * @param {{
   *   readingAmount: ai.ReadingAmount
   * }} params - Parameters of this method.
   * @returns {MinorUnitAmountConverter} - The conversion.
   */
  createMinorUnitAmountConverter ({
    readingAmount,
  }) {
    return MinorUnitAmountConverter.create({
      amountLike: readingAmount.amount,
      minorUnitScale: this.findMinorUnitScale({
        // Canonicalized before the lookup, because the master carries `USD` and a model answering
        // `usd` has read the currency correctly. An uncanonicalized code would miss the row and
        // shift the amount by nothing, which turns a perfectly read figure into a wrong one.
        currencyCode: this.canonicalizeText({
          text: readingAmount.currencyCode,
        }),
      }),
    })
  }

  /**
   * Find how far to shift an amount, and count it as written when nothing says.
   *
   * **A currency the master does not carry is shifted by nothing rather than refused**, which is what
   * keeps `ENG-02` rule 4 reachable. The resolver answers null for an unknown code and the converter
   * turns a null scale into a null amount - so leaving it null would make an unrecognized currency
   * read as *an amount nobody could get off the page*, `NG-005`. That is the wrong finding: the amount
   * was read perfectly well, and what is wrong is that its currency cannot be compared with the cover
   * sheet's, which is `NG-002`.
   *
   * @param {{
   *   currencyCode: string | null
   * }} params - Parameters of this method.
   * @returns {number} - The scale.
   */
  findMinorUnitScale ({
    currencyCode,
  }) {
    const minorUnitScale = this.currencyResolver.findMinorUnitScale({
      currencyCode,
    })

    if (minorUnitScale === null) {
      return UNKNOWN_CURRENCY_MINOR_UNIT_SCALE
    }

    return minorUnitScale
  }
}

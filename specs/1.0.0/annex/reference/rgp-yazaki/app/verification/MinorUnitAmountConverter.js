/*
 * A plain decimal number, optionally signed, with at least one digit on each side of any point.
 *
 * Deliberately stricter than `Number()`: that would turn `''` into 0, `' 12 '` into 12 and `'0x10'`
 * into 16, so the conversion rather than this class would be deciding which malformed values count
 * as amounts. Exponential notation is refused for a different reason - shifting `1e21` would be a
 * second algorithm, and no amount in this domain needs one.
 */
const DECIMAL_TEXT_PATTERN = /^-?\d+(?:\.\d+)?$/u

const NEGATIVE_SIGN = '-'

/**
 * One amount, as the exact integer count of its currency's minor unit (`DR-05` `ADR-19`).
 *
 * **The shift happens on the decimal string, never through a binary float.** `0.29 * 100` is
 * `28.999999999999996` in IEEE 754, so multiplying and truncating loses a cent on an ordinary
 * two-decimal figure - and it does so on roughly one amount in twenty rather than on a rare one.
 * The point is moved by re-cutting the digits instead, so no arithmetic happens at a precision the
 * amount does not have.
 *
 * **Rounded once, half-up, away from zero.** Once, because rounding a rounded figure is how a cent
 * appears from nowhere. Half-up rather than truncation, so a sheet written to more decimals than
 * its currency carries lands where the person who typed it would put it - `1.235` at scale 2 is
 * `124`, not `123`. Away from zero only matters to a negative amount, which a cover sheet does not
 * hold today; it is stated so the answer is not accidental.
 *
 * **Scale 0 makes this the reader of a stored amount.** A `BIGINT` arrives from MariaDB as a string
 * and from SQLite as a number, so an engine adding `row.amountMinorUnits` straight from the database
 * would concatenate text in production and sum numbers in the tests - passing every test and
 * reporting nonsense on the one environment that matters. A stored amount is already in minor
 * units, so reading one back is this class with `minorUnitScale: 0`, and it replaces the JPY-only
 * reader that did the same job before amounts carried a currency.
 *
 * **What cannot be read is null, never 0** (`ADR-09` `DR-03`). A zero would be compared, and a
 * comparison against an amount nobody could read is how a wrong judgment gets made confidently.
 *
 * There is a near-identical reading in `BaseAiModelProcessor`, and the duplication is intended: the
 * engine imports nothing from the AI layer, which is what makes the separation `DR-02` describes
 * checkable rather than asserted.
 */
export default class MinorUnitAmountConverter {
  /**
   * Constructor.
   *
   * @param {{
   *   amountLike: number | string | null
   *   minorUnitScale: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    amountLike,
    minorUnitScale,
  }) {
    this.amountLike = amountLike
    this.minorUnitScale = minorUnitScale
  }

  /**
   * Factory method.
   *
   * @param {{
   *   amountLike: number | string | null
   *   minorUnitScale: number
   * }} params - Parameters of this method.
   * @returns {MinorUnitAmountConverter} - Instance of this class.
   */
  static create ({
    amountLike,
    minorUnitScale,
  }) {
    return new this({
      amountLike,
      minorUnitScale,
    })
  }

  /**
   * Generate the amount as an exact count of minor units.
   *
   * @returns {number | null} - The count, or null when the value is not an amount.
   */
  generateMinorUnits () {
    if (!this.isValidScale()) {
      return null
    }

    const decimalText = this.generateDecimalText()

    if (decimalText === null) {
      return null
    }

    return this.generateShiftedAmount({
      decimalText,
    })
  }

  /**
   * Check whether the scale can move a decimal point at all.
   *
   * A scale reaches here from a `TBL-15` row, so a bad one is a seeding defect rather than a bad
   * document. It is still answered with null rather than thrown: every caller of this class is
   * inside a job whose contract is to answer `NG-004` on an amount it cannot read (`DR-03`), and a
   * throw here would turn one wrong master row into a failed file with a different runbook.
   *
   * @returns {boolean} - true: the scale is a count of digits.
   */
  isValidScale () {
    if (!Number.isSafeInteger(this.minorUnitScale)) {
      return false
    }

    return this.minorUnitScale >= 0
  }

  /**
   * Generate the value as a plain decimal string.
   *
   * @returns {string | null} - The digits, or null when the value is not a plain decimal.
   */
  generateDecimalText () {
    const candidateText = this.generateCandidateText()

    if (candidateText === null) {
      return null
    }

    if (!DECIMAL_TEXT_PATTERN.test(candidateText)) {
      return null
    }

    return candidateText
  }

  /**
   * Generate the text the value would be written as, whichever way it arrived.
   *
   * A number is stringified rather than computed with, and `String()` is the right stringifier
   * because it gives the **shortest decimal that round-trips** to the double. That is what disposes
   * of the workbook's stored artifacts: `314.52999999999997` and `5002.6899999999996`, which
   * `00-overview.md` §2.1 records, are the same doubles as `314.53` and `5002.69`, so they arrive
   * here already written the way the sheet's author wrote them. Where a double genuinely needs the
   * long form - `0.1 + 0.2` is `0.30000000000000004` - the extra digits arrive and are dropped by
   * the same cut as any other fraction, rather than being multiplied into the answer.
   *
   * Text arrives already written, which is how a `BIGINT` comes back from MariaDB.
   *
   * @returns {string | null} - The text, or null when the value is neither.
   */
  generateCandidateText () {
    if (typeof this.amountLike === 'string') {
      return this.amountLike
    }

    if (typeof this.amountLike !== 'number') {
      return null
    }

    if (!Number.isFinite(this.amountLike)) {
      return null
    }

    return String(this.amountLike)
  }

  /**
   * Move the decimal point by the scale and round what falls off it.
   *
   * @param {{
   *   decimalText: string
   * }} params - Parameters of this method.
   * @returns {number | null} - The count, or null when it is too large to be exact.
   */
  generateShiftedAmount ({
    decimalText,
  }) {
    const isNegativeAmount = decimalText.startsWith(NEGATIVE_SIGN)

    const magnitude = this.generateShiftedMagnitude({
      magnitudeText: isNegativeAmount
        ? decimalText.slice(NEGATIVE_SIGN.length)
        : decimalText,
    })

    if (magnitude === null) {
      return null
    }

    if (!isNegativeAmount) {
      return magnitude
    }

    return -magnitude
  }

  /**
   * Move the decimal point of an unsigned decimal.
   *
   * The fraction is padded one digit past the scale so the digit that decides the rounding always
   * exists: `145.6` at scale 2 keeps `60` and drops a `0` that was never written, which is what
   * makes a short fraction and an exact one take the same path.
   *
   * @param {{
   *   magnitudeText: string
   * }} params - Parameters of this method.
   * @returns {number | null} - The count, or null when it is too large to be exact.
   */
  generateShiftedMagnitude ({
    magnitudeText,
  }) {
    const [
      integerText,
      fractionText = '',
    ] = magnitudeText.split('.')

    const paddedFractionText = fractionText.padEnd(this.minorUnitScale + 1, '0')

    const keptAmount = Number(
      integerText + paddedFractionText.slice(0, this.minorUnitScale)
    )

    if (!Number.isSafeInteger(keptAmount)) {
      return null
    }

    return keptAmount + this.generateRoundingIncrement({
      firstDroppedDigit: paddedFractionText.charAt(this.minorUnitScale),
    })
  }

  /**
   * Decide whether the digits that fell off round the kept ones up.
   *
   * **Only the first dropped digit is read, and that is not a shortcut.** Half-up rounds up exactly
   * when the dropped remainder is at least a half, which is exactly when its first digit is at
   * least 5 - what follows cannot change the answer. Half-even would need to know whether the rest
   * is zero; this is not half-even.
   *
   * @param {{
   *   firstDroppedDigit: string
   * }} params - Parameters of this method.
   * @returns {number} - 1 when the kept digits round up, else 0.
   */
  generateRoundingIncrement ({
    firstDroppedDigit,
  }) {
    if (Number(firstDroppedDigit) < 5) {
      return 0
    }

    return 1
  }
}

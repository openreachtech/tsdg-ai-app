import FIELD_PATH_CONSTANT_HASH from '../constants/fieldPath.js'

import CurrencyResolver from '../verification/CurrencyResolver.js'
import DebitNoteNumberNormalizer from '../verification/DebitNoteNumberNormalizer.js'

import AmountFormatter from './AmountFormatter.js'

const {
  FIELD_PATH,
} = FIELD_PATH_CONSTANT_HASH

/**
 * One judgment, in the shape the operator schema declares for it.
 *
 * **`DebitNoteResultSummary` is one type answered by two operations.** `API-Q002` lists every
 * judgment of a batch and `API-Q003` returns the one an operator opened, and the second is reached
 * by clicking the first - so a field that the two filled differently would be a difference the
 * operator sees as the screen changing its mind. Formatting it in one place is what makes that
 * impossible rather than merely unlikely.
 *
 * **The read values come from `TBL-14` through the formatter, not from `TBL-07`.** The judgment
 * stores what it decided; what was read, how firmly and from where is one row per field, and the
 * table that carries a level beside a figure is the one the screen has to be answered from
 * (`FR-142`).
 */
export default class DebitNoteResultSummaryFormatter {
  /**
   * Constructor.
   *
   * @param {{
   *   debitNoteResult: DebitNoteResultWithReasonsEntity
   *   readingAgreementFormatter: ReadingAgreementFormatter
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    debitNoteResult,
    readingAgreementFormatter,
    currencyResolver,
  }) {
    this.debitNoteResult = debitNoteResult
    this.readingAgreementFormatter = readingAgreementFormatter
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   debitNoteResult: DebitNoteResultWithReasonsEntity
   *   readingAgreementFormatter: ReadingAgreementFormatter
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {DebitNoteResultSummaryFormatter} - Instance of this class.
   * @public
   */
  static create ({
    debitNoteResult,
    readingAgreementFormatter,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      debitNoteResult,
      readingAgreementFormatter,
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
   * Format the judgment.
   *
   * @returns {graphql.operator.DebitNoteResultSummary} - One judgment.
   * @public
   */
  formatSummary () {
    return {
      debitNoteResultId: this.debitNoteResult.id,
      debitNoteNumber: this.debitNoteResult.debitNoteNumber,
      normalizedDebitNoteNumber: this.formatNormalizedDebitNoteNumber(),
      fileName: this.debitNoteResult.BatchFile.fileName,
      isExcelTotalPassed: this.debitNoteResult.isExcelTotalPassed,
      isAmountPassed: this.debitNoteResult.isAmountPassed,
      isSignatureDetected: this.debitNoteResult.isSignatureDetected,
      isOverallPassed: this.debitNoteResult.isOverallPassed,
      extractedAmount: this.readingAgreementFormatter.formatReadAmount({
        fieldPath: FIELD_PATH.DEBIT_NOTE.AMOUNT,
      }),
      matchedAmount: this.formatMatchedAmount(),
      lowestAgreement: this.readingAgreementFormatter.findLowestAgreement(),
      ngReasons: this.debitNoteResult.DebitNoteNgReasons.map(debitNoteNgReason =>
        this.formatNgReason({
          debitNoteNgReason,
        })
      ),
    }
  }

  /**
   * Format the key this judgment's number matches on (`FR-038`).
   *
   * **Derived here rather than stored beside the verbatim number.** `TBL-07` keeps one column
   * because the key is a function of what is in it, and a second column would be a value that can
   * fall out of step with the one it was derived from - which is exactly the state `ENG-02` would
   * then be matching against. `TBL-05` stores its own because the match reads it back on every
   * cover sheet row of every file, and this is one number of one judgment.
   *
   * **Null with the verbatim number, never an empty string.** A note whose number no reading could
   * make out has no key, and `''` would read on the wire as a key that matched nothing rather than
   * as an absent one.
   *
   * @param {{
   *   DebitNoteNumberNormalizerCtor?: typeof DebitNoteNumberNormalizer
   * }} [params] - Parameters of this method.
   * @returns {string | null} - The key, or null where there is no number.
   */
  formatNormalizedDebitNoteNumber ({
    DebitNoteNumberNormalizerCtor = DebitNoteNumberNormalizer,
  } = {}) {
    const {
      debitNoteNumber,
    } = this.debitNoteResult

    if (debitNoteNumber === null) {
      return null
    }

    return DebitNoteNumberNormalizerCtor.create({
      debitNoteNumber,
    })
      .generateNormalizedNumber()
  }

  /**
   * Format the amount of the cover sheet row this judgment matched.
   *
   * **Null is a matched nothing, not an unread something.** A debit note that matched no row
   * (`NG-006`) has no figure to be compared against, which is a different statement from an amount
   * the readings could not make out - and the two sit side by side on the same row of `CMP-06`, so
   * they have to stay distinguishable.
   *
   * @param {{
   *   AmountFormatterCtor?: typeof AmountFormatter
   * }} [params] - Parameters of this method.
   * @returns {graphql.operator.Amount | null} - The amount, or null where nothing was matched.
   */
  formatMatchedAmount ({
    AmountFormatterCtor = AmountFormatter,
  } = {}) {
    return AmountFormatterCtor.create({
      amountLike: this.debitNoteResult.CoverSheetRow?.amountMinorUnits
        ?? null,
      currency: this.currencyResolver.findCurrencyById({
        currencyId: this.debitNoteResult.CoverSheetRow?.CurrencyId
          ?? null,
      }),
    })
      .formatAmount()
  }

  /**
   * Format one reason the judgment went the way it did.
   *
   * The parameters travel as the JSON they are stored as, unparsed: the client looks the code up in
   * its dictionary and substitutes them, and a shape this layer re-encoded would be a second chance
   * to get it wrong (`ADR-05`).
   *
   * @param {{
   *   debitNoteNgReason: DebitNoteNgReasonWithCodeEntity
   * }} params - Parameters of this method.
   * @returns {graphql.operator.NgReason} - One reason.
   */
  formatNgReason ({
    debitNoteNgReason,
  }) {
    return {
      reasonCode: debitNoteNgReason.NgReasonCode.code,
      categoryKey: debitNoteNgReason.NgReasonCode.categoryKey,
      parameters: JSON.stringify(debitNoteNgReason.parameters),
    }
  }
}

/**
 * @typedef {import('./ReadingAgreementFormatter.js').default} ReadingAgreementFormatter
 */

/**
 * @typedef {import('../../sequelize/models/DebitNoteNgReason.js').DebitNoteNgReasonEntity & {
 *   NgReasonCode: import('../../sequelize/models/NgReasonCode.js').NgReasonCodeEntity
 * }} DebitNoteNgReasonWithCodeEntity
 */

/**
 * @typedef {import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity & {
 *   BatchFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity & {
 *     ReadingFieldAgreements?: Array<import('../../sequelize/models/ReadingFieldAgreement.js').ReadingFieldAgreementEntity>
 *   }
 *   CoverSheetRow: import('../../sequelize/models/CoverSheetRow.js').CoverSheetRowEntity | null
 *   DebitNoteNgReasons: Array<DebitNoteNgReasonWithCodeEntity>
 * }} DebitNoteResultWithReasonsEntity
 */

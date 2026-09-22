import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

import CurrencyResolver from '../verification/CurrencyResolver.js'
import DebitNoteExcelTotalVerifier from '../verification/DebitNoteExcelTotalVerifier.js'

import DebitNoteNgReason from '../../sequelize/models/DebitNoteNgReason.js'
import DebitNoteResult from '../../sequelize/models/DebitNoteResult.js'

import BatchCoverSheetReader from './BatchCoverSheetReader.js'

const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

/*
 * The reasons check ② owns. Re-running the check replaces exactly these on a result and leaves the
 * amount and signature reasons of checks ③ and ④ untouched, because those were decided by a
 * different check reading a different document.
 *
 * `NG-009` joined the set in 1.0.1: a worksheet that could not be chosen is check ②'s finding about
 * the cover sheet, and leaving it out would strand it on a result whose cover sheet has since been
 * re-uploaded and parsed cleanly.
 */
const EXCEL_TOTAL_NG_REASON_CODE_IDS = [
  NG_REASON_CODE.EXCEL_TOTAL_MISMATCH.ID,
  NG_REASON_CODE.UNREADABLE_COVER_SHEET.ID,
  NG_REASON_CODE.UNCHOSEN_WORKSHEET.ID,
]

/**
 * Carries a fresh check ② onto the debit note results of a batch (`40-backend.md` §5.3 step 6).
 *
 * **Each result is answered for its own currency** (`ENG-01` `DR-05`). Check ② was a fact about the
 * batch in 1.0.0 and every result answered it identically; in 1.0.1 the cover sheet reconciles per
 * currency, so a sheet whose JPY subtotal is wrong and whose USD subtotal is right leaves the USD
 * results passing. The verdict is re-derived per result rather than copied.
 *
 * Normally there is nothing here to update - the cover sheet is analyzed before its debit notes, so
 * the batch has no results yet and this writes to none of them.
 *
 * **It earns its place on the retry** (`API-M004`). An operator who fixes a wrong total and
 * re-uploads the cover sheet has debit notes already judged against the old one, and a verdict left
 * saying the total does not reconcile after the total was corrected is exactly the stale answer
 * `DR-06` exists to prevent.
 */
export default class ExcelTotalCheckPropagator {
  /**
   * Constructor.
   *
   * @param {{
   *   verificationBatchId: number
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    verificationBatchId,
    currencyResolver,
  }) {
    this.verificationBatchId = verificationBatchId
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   verificationBatchId: number
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {ExcelTotalCheckPropagator} - Instance of this class.
   */
  static create ({
    verificationBatchId,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      verificationBatchId,
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
   * Rewrite check ② on every result of the batch, in one transaction.
   *
   * @returns {Promise<void>}
   */
  async propagateCheckResult () {
    const debitNoteResults = await this.findDebitNoteResults()

    if (debitNoteResults.length === 0) {
      return
    }

    const coverSheetState = await this.readCoverSheetState()

    await DebitNoteResult.beginTransaction(async transaction => {
      await this.updateDebitNoteResults({
        debitNoteResults,
        coverSheetState,
        transaction,
      })
    })
  }

  /**
   * Find the results this batch already holds.
   *
   * @returns {Promise<Array<import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity>>} - The results.
   */
  async findDebitNoteResults () {
    return /** @type {*} */ (
      DebitNoteResult.findAll({
        where: {
          VerificationBatchId: this.verificationBatchId,
        },
      })
    )
  }

  /**
   * Read the cover sheet the results are re-judged against.
   *
   * @returns {Promise<verification.BatchCoverSheetState>} - What the batch's cover sheet holds.
   */
  async readCoverSheetState () {
    return this.createBatchCoverSheetReader()
      .readCoverSheetState()
  }

  /**
   * Create the reader the cover sheet is read through.
   *
   * @returns {BatchCoverSheetReader} - The reader.
   */
  createBatchCoverSheetReader () {
    return BatchCoverSheetReader.create({
      verificationBatchId: this.verificationBatchId,
    })
  }

  /**
   * Rewrite check ② on each result.
   *
   * Sequential rather than concurrent: the writes share one transaction, and a pool of them issued
   * at once against the same connection is what turns a slow batch into a lock timeout.
   *
   * @param {{
   *   debitNoteResults: Array<import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity>
   *   coverSheetState: verification.BatchCoverSheetState
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async updateDebitNoteResults ({
    debitNoteResults,
    coverSheetState,
    transaction,
  }) {
    await debitNoteResults.reduce(
      async (previousWrite, debitNoteResult) => {
        await previousWrite

        return this.updateDebitNoteResult({
          debitNoteResult,
          coverSheetState,
          transaction,
        })
      },
      Promise.resolve()
    )
  }

  /**
   * Rewrite check ② on one result.
   *
   * @param {{
   *   debitNoteResult: import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity
   *   coverSheetState: verification.BatchCoverSheetState
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async updateDebitNoteResult ({
    debitNoteResult,
    coverSheetState,
    transaction,
  }) {
    const excelTotalCheckResult = this.verifyExcelTotal({
      debitNoteResult,
      coverSheetState,
    })

    await DebitNoteResult.update(
      {
        isExcelTotalPassed: excelTotalCheckResult.isExcelTotalPassed,
        isOverallPassed: this.generateOverallPassed({
          debitNoteResult,
          excelTotalCheckResult,
        }),
      },
      {
        where: {
          id: debitNoteResult.id,
        },
        transaction,
      }
    )

    await this.replaceNgReasons({
      debitNoteResult,
      excelTotalCheckResult,
      transaction,
    })
  }

  /**
   * Answer check ② for one result, in the currency that result was read in.
   *
   * @param {{
   *   debitNoteResult: import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity
   *   coverSheetState: verification.BatchCoverSheetState
   * }} params - Parameters of this method.
   * @returns {verification.ExcelTotalCheckResult} - What check ② concluded.
   */
  verifyExcelTotal ({
    debitNoteResult,
    coverSheetState,
  }) {
    return this.createDebitNoteExcelTotalVerifier({
      debitNoteResult,
      coverSheetState,
    })
      .verifyExcelTotal()
  }

  /**
   * Create check ② over one result.
   *
   * The currency comes off the stored result rather than from a fresh reading: re-reading the
   * document is what the retry of `API-M004` does, and this pass exists precisely for the results it
   * is *not* re-reading (`DR-02`).
   *
   * @param {{
   *   debitNoteResult: import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity
   *   coverSheetState: verification.BatchCoverSheetState
   * }} params - Parameters of this method.
   * @returns {DebitNoteExcelTotalVerifier} - The check.
   */
  createDebitNoteExcelTotalVerifier ({
    debitNoteResult,
    coverSheetState,
  }) {
    return DebitNoteExcelTotalVerifier.create({
      coverSheetSheets: coverSheetState.coverSheetSheets,
      coverSheetFileName: coverSheetState.coverSheetFileName,
      currencyCode: this.currencyResolver.findCurrencyCode({
        currencyId: debitNoteResult.CurrencyId,
      }),
      currencyResolver: this.currencyResolver,
    })
  }

  /**
   * Decide the verdict of a result whose check ② has just changed.
   *
   * All three checks must pass (`DR-04`). The other two are read from the stored result rather than
   * re-run: they are facts about this document, and nothing about the cover sheet changes them.
   *
   * @param {{
   *   debitNoteResult: import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity
   *   excelTotalCheckResult: verification.ExcelTotalCheckResult
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the debit note is OK.
   */
  generateOverallPassed ({
    debitNoteResult,
    excelTotalCheckResult,
  }) {
    return excelTotalCheckResult.isExcelTotalPassed
      && debitNoteResult.isAmountPassed
      && debitNoteResult.isSignatureDetected
  }

  /**
   * Replace the check ② reasons of one result, leaving the other checks' reasons in place.
   *
   * @param {{
   *   debitNoteResult: import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity
   *   excelTotalCheckResult: verification.ExcelTotalCheckResult
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async replaceNgReasons ({
    debitNoteResult,
    excelTotalCheckResult,
    transaction,
  }) {
    await DebitNoteNgReason.destroy({
      where: {
        DebitNoteResultId: debitNoteResult.id,
        NgReasonCodeId: EXCEL_TOTAL_NG_REASON_CODE_IDS,
      },
      transaction,
    })

    await DebitNoteNgReason.bulkCreate(
      this.buildNgReasonAttributes({
        debitNoteResult,
        excelTotalCheckResult,
      }),
      {
        transaction,
      }
    )
  }

  /**
   * Build the rows check ② contributes to `TBL-11`.
   *
   * @param {{
   *   debitNoteResult: import('../../sequelize/models/DebitNoteResult.js').DebitNoteResultEntity
   *   excelTotalCheckResult: verification.ExcelTotalCheckResult
   * }} params - Parameters of this method.
   * @returns {Array<{
   *   DebitNoteResultId: number
   *   NgReasonCodeId: number
   *   parameters: Record<string, unknown>
   * }>} - The rows.
   */
  buildNgReasonAttributes ({
    debitNoteResult,
    excelTotalCheckResult,
  }) {
    return excelTotalCheckResult.ngReasons
      .map(ngReason => ({
        DebitNoteResultId: debitNoteResult.id,
        NgReasonCodeId: ngReason.NgReasonCodeId,
        parameters: ngReason.parameters,
      }))
  }
}

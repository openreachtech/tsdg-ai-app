import ConsensusCountReader from './ConsensusCountReader.js'
import CurrencyResolver from './CurrencyResolver.js'
import DebitNoteAmountVerifier from './DebitNoteAmountVerifier.js'
import DebitNoteExcelTotalVerifier from './DebitNoteExcelTotalVerifier.js'
import ReadingDisagreementVerifier from './ReadingDisagreementVerifier.js'
import SignaturePresenceVerifier from './SignaturePresenceVerifier.js'

/**
 * The verdict on one debit note: a `TBL-07` row and the `TBL-11` rows behind it (`FR-041` `DR-04`).
 *
 * **OK only when all three checks pass, and every applicable reason listed when they do not.** The
 * reasons are concatenated rather than stopped at the first, because a document can be both short of
 * an approval and off on its amount, and an operator sent to fix one of two defects comes back.
 *
 * **`isOverallPassed` is computed once, here, and stored.** The screen and the report both read the
 * stored value, so they cannot answer the question differently - which they eventually would if each
 * derived it from three booleans of its own (`FR-061`).
 *
 * **All three checks are run here, check ② included.** It was handed in while it was a fact about
 * the batch; in 1.0.1 it is answered per currency (`ENG-01`), and the currency it is answered for is
 * this document's own - which is known here and nowhere above. What is handed in instead is the
 * cover sheet's stored state, so every debit note of a batch still reads the same worksheet.
 *
 * **What it judges is the consensus, not a reading** (`ENG-05`). `TBL-14` arrives already reduced,
 * and this class is the only place its rows are opened - so no check learns how many times the
 * document was read, and `OCR_REPEAT_COUNT` stays configuration rather than a shape (`FR-144`).
 *
 * **A field the readings could not agree on is `NG-008` and never a second finding about the
 * document.** It reaches the reasons beside the three checks rather than through one of them,
 * because a disagreement is a fact about how this system read rather than about what the supplier
 * sent (§6.2) - and check ③ is told, so a figure nobody agreed on is not also reported as a figure
 * nobody could read.
 */
export default class DebitNoteJudge {
  /**
   * Constructor.
   *
   * @param {{
   *   coverSheetState: verification.BatchCoverSheetState
   *   readingConsensus: verification.ReadingConsensus
   *   pageCount: number | null
   *   fileName: string
   *   judgedAt: Date
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    coverSheetState,
    readingConsensus,
    pageCount,
    fileName,
    judgedAt,
    currencyResolver,
  }) {
    this.coverSheetState = coverSheetState
    this.readingConsensus = readingConsensus
    this.pageCount = pageCount
    this.fileName = fileName
    this.judgedAt = judgedAt
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   coverSheetState: verification.BatchCoverSheetState
   *   readingConsensus: verification.ReadingConsensus
   *   pageCount: number | null
   *   fileName: string
   *   judgedAt: Date
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {DebitNoteJudge} - Instance of this class.
   */
  static create ({
    coverSheetState,
    readingConsensus,
    pageCount,
    fileName,
    judgedAt,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      coverSheetState,
      readingConsensus,
      pageCount,
      fileName,
      judgedAt,
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
   * Judge one debit note.
   *
   * @returns {verification.DebitNoteJudgment} - The judgment, and everything it rests on.
   */
  judgeDebitNote () {
    const excelTotalCheckResult = this.createDebitNoteExcelTotalVerifier()
      .verifyExcelTotal()

    const amountCheckResult = this.createDebitNoteAmountVerifier()
      .verifyAmount()

    const signatureCheckResult = this.createSignaturePresenceVerifier()
      .verifySignatures()

    const readingDisagreementNgReasons = this.createReadingDisagreementVerifier()
      .verifyReadingAgreement()

    return {
      CoverSheetRowId: amountCheckResult.CoverSheetRowId,
      CurrencyId: this.findExtractedCurrencyId(),
      debitNoteNumber: this.readDebitNoteNumber(),
      extractedAmountMinorUnits: this.readExtractedAmountMinorUnits(),
      isExcelTotalPassed: excelTotalCheckResult.isExcelTotalPassed,
      isAmountPassed: amountCheckResult.isAmountPassed,
      isSignatureDetected: signatureCheckResult.isSignatureDetected,
      isOverallPassed: excelTotalCheckResult.isExcelTotalPassed
        && amountCheckResult.isAmountPassed
        && signatureCheckResult.isSignatureDetected,
      judgedAt: this.judgedAt,
      ngReasons: [
        ...excelTotalCheckResult.ngReasons,
        ...amountCheckResult.ngReasons,
        ...signatureCheckResult.ngReasons,
        ...readingDisagreementNgReasons,
      ],
    }
  }

  /**
   * Create check ②.
   *
   * @returns {DebitNoteExcelTotalVerifier} - The check.
   */
  createDebitNoteExcelTotalVerifier () {
    return DebitNoteExcelTotalVerifier.create({
      coverSheetSheets: this.coverSheetState.coverSheetSheets,
      coverSheetFileName: this.coverSheetState.coverSheetFileName,
      currencyCode: this.readExtractedCurrencyCode(),
      currencyResolver: this.currencyResolver,
    })
  }

  /**
   * Create check ③.
   *
   * **It is told whether the readings agreed**, which is what keeps `NG-005` truthful. Both a
   * disagreement and an unread page leave the amount null, and `NG-005`'s sentence says no reading
   * returned the total - false of a document three readings each returned a different total for
   * (§6.2). That case is `NG-008`, raised once, beside the check rather than inside it.
   *
   * @returns {DebitNoteAmountVerifier} - The check.
   */
  createDebitNoteAmountVerifier () {
    return DebitNoteAmountVerifier.create({
      debitNoteNumber: this.readDebitNoteNumber(),
      extractedAmountMinorUnits: this.readExtractedAmountMinorUnits(),
      extractedCurrencyCode: this.readExtractedCurrencyCode(),
      isAgreedAmount: this.readingConsensus.amount.isMajorityReached,
      coverSheetRows: this.coverSheetState.coverSheetRows,
      fileName: this.fileName,
      currencyResolver: this.currencyResolver,
    })
  }

  /**
   * Create check ④.
   *
   * @returns {SignaturePresenceVerifier} - The check.
   */
  createSignaturePresenceVerifier () {
    return SignaturePresenceVerifier.create({
      approvalBlocks: this.readingConsensus.approvalBlocks,
      pageCount: this.pageCount,
      fileName: this.fileName,
    })
  }

  /**
   * Create the report of what the readings could not agree on.
   *
   * @returns {ReadingDisagreementVerifier} - The report.
   */
  createReadingDisagreementVerifier () {
    return ReadingDisagreementVerifier.create({
      fieldConsensuses: this.readingConsensus.fieldConsensuses,
      fileName: this.fileName,
    })
  }

  /**
   * Read the debit note number the readings agreed on.
   *
   * **The three readers below are where the consensus is opened, and the only place.** Each check is
   * given values rather than a reduction, so none of them knows how many times the document was read
   * or what shape a provider answers in - which is what let `ENG-05` become the source of these
   * values without any check changing (`T-3.17`).
   *
   * @returns {string | null} - The number, or null when none was agreed on.
   */
  readDebitNoteNumber () {
    return this.readingConsensus.debitNoteNumber.consensusValue
  }

  /**
   * Read the document total as a count of its currency's minor unit.
   *
   * **The count is what `ENG-05` compared**, so nothing is converted here: the decimal string the
   * model reported never left the reduction, and re-deriving the figure from it would be a second
   * implementation of the arithmetic that produced the agreement (§6.1 step 1).
   *
   * @returns {number | null} - The count, or null when no amount was agreed on.
   */
  readExtractedAmountMinorUnits () {
    return this.createConsensusCountReader({
      consensusValue: this.readingConsensus.amount.consensusValue,
    })
      .readCount()
  }

  /**
   * Create the reading one stored count comes back through.
   *
   * @param {{
   *   consensusValue: string | null
   * }} params - Parameters of this method.
   * @returns {ConsensusCountReader} - The reading.
   */
  createConsensusCountReader ({
    consensusValue,
  }) {
    return ConsensusCountReader.create({
      consensusValue,
    })
  }

  /**
   * Read which currency the document total is stated in.
   *
   * Null exactly when the amount is, because the reduction keeps them together: a currency with no
   * figure describes nothing, and it is what lets `TBL-07.CurrencyId` state "null exactly when the
   * amount is".
   *
   * @returns {string | null} - The code, or null when no amount was agreed on.
   */
  readExtractedCurrencyCode () {
    return this.readingConsensus.amount.currencyCode
  }

  /**
   * Find which `TBL-15` row the read currency is, if any.
   *
   * **A code the master does not carry stores as null**, and the reading keeps its own code either
   * way. The column is a foreign key, so an unrecognized currency has no id to hold - and it has
   * already produced `NG-002`, because a code nothing in `TBL-15` matches cannot equal the cover
   * sheet's either (`ENG-02` rule 4).
   *
   * @returns {number | null} - The currency's id, or null when none was read or none is known.
   */
  findExtractedCurrencyId () {
    return this.currencyResolver.findCurrencyId({
      currencyCode: this.readExtractedCurrencyCode(),
    })
  }
}

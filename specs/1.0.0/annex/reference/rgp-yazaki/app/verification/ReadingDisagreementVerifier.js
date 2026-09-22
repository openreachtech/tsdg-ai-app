import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

/**
 * `NG-008`: the fields this document's readings could not agree on (`FR-143` `ENG-05` step 4).
 *
 * **A disagreement is a finding about how the system read, not about what the document says.** It
 * shares the `reading_disagreement` category with `NG-007` for that reason: an operator triaging
 * twenty-six NGs needs to know which of them a retry or a better scan might fix, and which never
 * will (§6.2).
 *
 * **Nothing is kept and nothing is preferred.** Three different amounts do not average, and the
 * most frequent of three distinct values is not a majority - so the value is null, the check does
 * not pass on it, and no reading is silently chosen (`DR-03` `FR-143`).
 *
 * **A field the readings agreed was unreadable is not this.** Two of three readings finding no
 * amount is a majority saying there was nothing to read, which is `NG-005`; the null in `TBL-14` is
 * the same, and the two counts beside it are what tell them apart (§6.2).
 *
 * **The page comes from the block, or from nowhere.** `ENG-05` step 6 takes provenance from the
 * reading whose value equals the consensus, and there is no consensus here - so a document-level
 * field has no page to name. A block field does: the page is half of a block's identity rather than
 * one of its read values, so it is known even when everything read inside the block disagreed. That
 * is the whole of why `NG-008` is the one code of the five whose `pageNumber` may be null, and why
 * `CMP-10` carries a sentence for each case.
 */
export default class ReadingDisagreementVerifier {
  /**
   * Constructor.
   *
   * @param {{
   *   fieldConsensuses: Array<verification.ReadingFieldConsensus>
   *   fileName: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    fieldConsensuses,
    fileName,
  }) {
    this.fieldConsensuses = fieldConsensuses
    this.fileName = fileName
  }

  /**
   * Factory method.
   *
   * @param {{
   *   fieldConsensuses: Array<verification.ReadingFieldConsensus>
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {ReadingDisagreementVerifier} - Instance of this class.
   */
  static create ({
    fieldConsensuses,
    fileName,
  }) {
    return new this({
      fieldConsensuses,
      fileName,
    })
  }

  /**
   * Report every field the readings did not agree on.
   *
   * @returns {Array<verification.NgReason>} - One reason per disagreed field, in stored order.
   */
  verifyReadingAgreement () {
    return this.collectDisagreedFieldConsensuses()
      .map(fieldConsensus => this.buildDisagreementNgReason({
        fieldConsensus,
      }))
  }

  /**
   * Collect the fields no majority of readings produced.
   *
   * @returns {Array<verification.ReadingFieldConsensus>} - The fields.
   */
  collectDisagreedFieldConsensuses () {
    return this.fieldConsensuses
      .filter(fieldConsensus => !fieldConsensus.isMajorityReached)
  }

  /**
   * Build the reason one disagreed field is reported by.
   *
   * **`fieldPath` travels stripped, with its index beside it.** It lands inside a rendered sentence,
   * so a raw `approvalBlocks[0].isSignaturePresent` would put an English identifier in the middle of
   * a Japanese one - the defect `DR-13` exists to prevent, arriving through a field that looks like
   * data. The client resolves the stripped key through its dictionary exactly as it does
   * `detailCode` (§6.2).
   *
   * @param {{
   *   fieldConsensus: verification.ReadingFieldConsensus
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildDisagreementNgReason ({
    fieldConsensus,
  }) {
    return {
      NgReasonCodeId: NG_REASON_CODE.DEBIT_NOTE_DISAGREEMENT.ID,
      parameters: {
        fileName: this.fileName,
        fieldPath: fieldConsensus.strippedFieldPath,
        // Null on every field that belongs to no approval block, and sent rather than omitted so
        // the shape of the reason does not depend on which field it is about.
        blockIndex: fieldConsensus.blockIndex,
        agreedReadingCount: fieldConsensus.agreedReadingCount,
        totalReadingCount: fieldConsensus.totalReadingCount,
        pageNumber: fieldConsensus.blockPageNumber,
      },
    }
  }
}

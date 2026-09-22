import CANONICAL_BOOLEAN_TEXT_CONSTANT_HASH from '../constants/canonicalBooleanText.js'
import NG_DETAIL_CODE_CONSTANT_HASH from '../constants/ngDetailCode.js'
import NG_REASON_CODE_CONSTANT_HASH from '../constants/ngReasonCode.js'

const {
  CANONICAL_BOOLEAN_TEXT,
} = CANONICAL_BOOLEAN_TEXT_CONSTANT_HASH

const {
  NG_DETAIL_CODE,
} = NG_DETAIL_CODE_CONSTANT_HASH

const {
  NG_REASON_CODE,
} = NG_REASON_CODE_CONSTANT_HASH

const {
  UNCHECKED_APPROVAL,
} = NG_DETAIL_CODE

/**
 * Check ④: was this debit note approved, and could we tell (`ENG-03` `FR-032`)?
 *
 * The approval is **one per debit note**, carried in a printed block captioned `APPROVED BY` or
 * `CONFIRMED BY` whose fields are numbered. **The block can sit on any page** of the bundle, and on
 * the observed samples it is often a late one.
 *
 * **Two findings that must never be merged.** `NG-003` says the supplier did not get the document
 * approved; `NG-010` says this system could not tell. They land in different categories for that
 * reason, and the operator's next action differs completely - chase the subsidiary, or look at the
 * scan. Collapsing them would make every unfamiliar layout look like a compliance failure
 * (`OPEN-4`).
 *
 * **The rule is "at least one", not "every".** 1.0.0 set the verdict true only when every line item
 * carried a signature, which is the per-line model the samples disproved. Same column, opposite
 * condition.
 *
 * **`isSignaturePresent` has three states and the third is the whole difficulty.** True and false
 * are answers about the document; null is "the reading could not make it out". Routing on
 * truthiness folds null into false and reports a document whose box we could not read as a document
 * nobody approved - a `DR-03` violation in the exact place §6.2 swears never to make one, and the
 * reason rule 5 exists.
 *
 * **It reads the consensus, not a reading** (`ENG-05` §6.1). What arrives is one set of blocks
 * matched across every reading of the file, each field carrying how many readings produced it - so
 * the rules below decide from what the readings agreed on rather than from whichever one happened to
 * be taken first. A block two of three readings never saw still reaches here, with its fields at
 * `2/3`, because "we mostly did not see this" is an observation and rule 3 exists to report it.
 *
 * **Nothing here compares `approverLastName` against anything** (`ADR-01`). No approver master data
 * exists in this version; the name is read for the evidence view and for the extension that will
 * need it, and a check that quietly began matching names would reverse `ADR-01` without a decision.
 */
export default class SignaturePresenceVerifier {
  /**
   * Constructor.
   *
   * @param {{
   *   approvalBlocks: Array<verification.ConsensusApprovalBlock>
   *   pageCount: number | null
   *   fileName: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    approvalBlocks,
    pageCount,
    fileName,
  }) {
    this.approvalBlocks = approvalBlocks
    this.pageCount = pageCount
    this.fileName = fileName
  }

  /**
   * Factory method.
   *
   * @param {{
   *   approvalBlocks: Array<verification.ConsensusApprovalBlock>
   *   pageCount: number | null
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {SignaturePresenceVerifier} - Instance of this class.
   */
  static create ({
    approvalBlocks,
    pageCount,
    fileName,
  }) {
    return new this({
      approvalBlocks,
      pageCount,
      fileName,
    })
  }

  /**
   * Decide whether this debit note was approved.
   *
   * The five rules in the order they are decided, which is not the order they are numbered - each
   * one answers and stops. **No block anywhere** (rule 3) is `NG-010` `no_approval_block_found`,
   * with no page to point at. **A block is signed** (rules 1 and 4) passes and raises nothing: a
   * bundle where only some blocks are signed lands here, because one valid approval is the
   * requirement, and the unsigned blocks stay visible through `TBL-14` rather than as a finding
   * against a document that passed. **Nothing signed and something unread** (rule 5) is `NG-010`
   * naming which field was unread. **Nothing signed and everything read** (rule 2) is one `NG-003`
   * per block.
   *
   * @returns {{
   *   isSignatureDetected: boolean
   *   ngReasons: Array<verification.NgReason>
   * }} - The verdict and what it rests on.
   */
  verifySignatures () {
    if (this.approvalBlocks.length === 0) {
      return {
        isSignatureDetected: false,
        ngReasons: [
          this.buildUncheckedApprovalNgReason({
            detailCode: UNCHECKED_APPROVAL.NO_APPROVAL_BLOCK_FOUND,
            pageNumber: null,
          }),
        ],
      }
    }

    if (this.hasSignedApprovalBlock()) {
      return {
        isSignatureDetected: true,
        ngReasons: [],
      }
    }

    const unreadableNgReasons = this.buildUnreadableBlockNgReasons()

    if (unreadableNgReasons.length > 0) {
      return {
        isSignatureDetected: false,
        ngReasons: unreadableNgReasons,
      }
    }

    return {
      isSignatureDetected: false,
      ngReasons: this.approvalBlocks
        .map(approvalBlock => this.buildMissingSignatureNgReason({
          approvalBlock,
        })),
    }
  }

  /**
   * Check whether any block of the bundle carries a signature (rule 1).
   *
   * **Compared against the canonical `true` rather than tested for truth**, which is the line rule 5
   * turns on: a block whose field could not be read is null here, not false, and must not answer this
   * question at all.
   *
   * @returns {boolean} - true: the document was approved.
   */
  hasSignedApprovalBlock () {
    return this.approvalBlocks
      .some(approvalBlock =>
        approvalBlock.isSignaturePresent.consensusValue === CANONICAL_BOOLEAN_TEXT.TRUE
      )
  }

  /**
   * Build the reason of an approval nothing could be concluded about (rule 5).
   *
   * **The signature field is named before the caption**, because it is the field the check turns on:
   * a block whose caption is unread but whose empty signature field is plain has been read well
   * enough to say the approval is missing - except that saying so is `NG-003`, and rule 5 forbids
   * reaching `NG-003` through an unread block at all. So the caption is reported too, and the
   * `detailCode` says which of the two was the problem.
   *
   * @returns {Array<verification.NgReason>} - The reason, or none when every block was read.
   */
  buildUnreadableBlockNgReasons () {
    const unresolvedBlock = this.approvalBlocks
      .find(approvalBlock => approvalBlock.isSignaturePresent.consensusValue === null)

    if (unresolvedBlock) {
      return [
        this.buildUncheckedApprovalNgReason({
          detailCode: UNCHECKED_APPROVAL.SIGNATURE_FIELD_UNREADABLE,
          pageNumber: unresolvedBlock.pageNumber,
        }),
      ]
    }

    const uncaptionedBlock = this.approvalBlocks
      .find(approvalBlock => approvalBlock.blockLabel.consensusValue === null)

    if (uncaptionedBlock) {
      return [
        this.buildUncheckedApprovalNgReason({
          detailCode: UNCHECKED_APPROVAL.BLOCK_CAPTION_UNREADABLE,
          pageNumber: uncaptionedBlock.pageNumber,
        }),
      ]
    }

    return []
  }

  /**
   * Build the reason of an approval that could not be checked (`NG-010`).
   *
   * `pageCount` travels with it because the sentence names it: "no approval block was found in these
   * 11 pages" tells an operator whether to doubt the scan or the layout, and the bare code does not.
   * It is null on the one document whose readings could not agree how long it is - the sentence has
   * to manage without a number rather than be given one nobody measured (`DR-03`).
   *
   * @param {{
   *   detailCode: string
   *   pageNumber: number | null
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildUncheckedApprovalNgReason ({
    detailCode,
    pageNumber,
  }) {
    return {
      NgReasonCodeId: NG_REASON_CODE.UNCHECKED_APPROVAL.ID,
      parameters: {
        fileName: this.fileName,
        pageCount: this.pageCount,
        detailCode,
        pageNumber,
      },
    }
  }

  /**
   * Build the reason of one block that was read and carries no signature (`NG-003`).
   *
   * **One per unsigned block, not one per document.** That is what lets the sentence name a page and
   * a caption without choosing which of three blocks to speak for.
   *
   * The caption, the name and the department are the block as it was read - text transcribed from
   * the document rather than prose this system wrote, which is the one exemption `DR-13` carries.
   * Any of them may be null, and the sentence has a form for that. They arrive in the canonical form
   * `ENG-05` compared, so a name reads back upper-cased: that is the comparison rule doing its job,
   * and a per-field exception to it would be a convention nobody could see (§6.1 step 1).
   *
   * @param {{
   *   approvalBlock: verification.ConsensusApprovalBlock
   * }} params - Parameters of this method.
   * @returns {verification.NgReason} - The reason.
   */
  buildMissingSignatureNgReason ({
    approvalBlock,
  }) {
    return {
      NgReasonCodeId: NG_REASON_CODE.SIGNATURE_MISSING.ID,
      parameters: {
        fileName: this.fileName,
        pageNumber: approvalBlock.pageNumber,
        blockLabel: approvalBlock.blockLabel.consensusValue,
        approverLastName: approvalBlock.approverLastName.consensusValue,
        approverDepartment: approvalBlock.approverDepartment.consensusValue,
      },
    }
  }
}

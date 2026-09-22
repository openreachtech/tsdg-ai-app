import FIELD_PATH_CONSTANT_HASH from '../constants/fieldPath.js'

import ApprovalBlockFieldPath from './ApprovalBlockFieldPath.js'
import ApprovalBlockMatcher from './ApprovalBlockMatcher.js'
import FieldConsensusResolver from './FieldConsensusResolver.js'
import ReadingValueCanonicalizer from './ReadingValueCanonicalizer.js'

const {
  FIELD_PATH,
} = FIELD_PATH_CONSTANT_HASH

/*
 * How `TBL-14.field_path` writes a field of an approval block.
 *
 * `ApprovalBlockFieldPath` owns the format because the evidence view reads these paths back
 * (`API-Q003`), and a format spelled in both places is a format that can come to differ in one of
 * them.
 */
const APPROVAL_BLOCK_MEMBER_NAME = ApprovalBlockFieldPath.memberName

/**
 * `ENG-05`: the readings of one file, reduced to the one set of values the checks judge on.
 *
 * **It runs before checks ②③④⑤ and it is the only thing that reads more than one reading.** Every
 * check downstream takes a consensus and never learns how many times the document was read, which
 * is what lets `OCR_REPEAT_COUNT` be configuration rather than a shape (`FR-144`).
 *
 * **What comes out has the shape of a reading, with an agreement level where each envelope was.**
 * That is deliberate: the checks already knew how to read §7.2, so the reduction changes what they
 * are told rather than how they are told it - and `TBL-14` is the same rows again, flat.
 *
 * **Approval blocks are matched by `(pageNumber, blockLabel)` before any of this runs** (§6.1). The
 * array index is produced independently by each reading, so reducing `approvalBlocks[1].*`
 * positionally would compare whatever each reading happened to list second.
 *
 * **Nothing here is asked how sure it is** (`DR-14` `ADR-18`). The number on the operator's screen
 * is the output of counting stored readings, and `NFR-031` requires it to be recomputable from
 * `TBL-06` plus the currency master and nothing else - which is why the currency master is the only
 * thing this class is given besides the readings.
 */
export default class ReadingConsensusReducer {
  /**
   * Constructor.
   *
   * @param {{
   *   normalizedExtractions: Array<ai.NormalizedExtraction>
   *   readingValueCanonicalizer: ReadingValueCanonicalizer
   * }} params - Parameters of this constructor.
   */
  constructor ({
    normalizedExtractions,
    readingValueCanonicalizer,
  }) {
    this.normalizedExtractions = normalizedExtractions
    this.readingValueCanonicalizer = readingValueCanonicalizer
  }

  /**
   * Factory method.
   *
   * @param {{
   *   normalizedExtractions: Array<ai.NormalizedExtraction>
   *   readingValueCanonicalizer?: ReadingValueCanonicalizer
   * }} params - Parameters of this method.
   * @returns {ReadingConsensusReducer} - Instance of this class.
   */
  static create ({
    normalizedExtractions,
    readingValueCanonicalizer = this.createReadingValueCanonicalizer(),
  }) {
    return new this({
      normalizedExtractions,
      readingValueCanonicalizer,
    })
  }

  /**
   * Create the canonicalization every value is compared through.
   *
   * @returns {ReadingValueCanonicalizer} - The canonicalization.
   */
  static createReadingValueCanonicalizer () {
    return ReadingValueCanonicalizer.create()
  }

  /**
   * Reduce every reading of this file to one consensus.
   *
   * @returns {verification.ReadingConsensus} - The consensus, in the shape of a reading.
   */
  reduceReadings () {
    const reducedFields = {
      debitNoteNumber: this.reduceDebitNoteNumber(),
      amount: this.reduceAmount(),
      pageCount: this.reducePageCount(),
      approvalBlocks: this.reduceApprovalBlocks(),
    }

    return {
      ...reducedFields,
      fieldConsensuses: this.collectFieldConsensuses({
        reducedFields,
      }),
    }
  }

  /**
   * Reduce what the readings made of the document's own number.
   *
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reduceDebitNoteNumber () {
    return this.resolveFieldConsensus({
      fieldPath: FIELD_PATH.DEBIT_NOTE.DEBIT_NOTE_NUMBER,
      strippedFieldPath: FIELD_PATH.DEBIT_NOTE.DEBIT_NOTE_NUMBER,
      blockIndex: null,
      blockPageNumber: null,
      readingFieldValues: this.normalizedExtractions
        .map(normalizedExtraction => this.buildTextFieldValue({
          readingEnvelope: normalizedExtraction.debitNoteNumber,
        })),
    })
  }

  /**
   * Count one field's readings and label the answer with the paths that name the field.
   *
   * @param {{
   *   fieldPath: string
   *   strippedFieldPath: string
   *   blockIndex: number | null
   *   blockPageNumber: number | null
   *   readingFieldValues: Array<verification.ReadingFieldValue>
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  resolveFieldConsensus ({
    fieldPath,
    strippedFieldPath,
    blockIndex,
    blockPageNumber,
    readingFieldValues,
  }) {
    return {
      fieldPath,
      strippedFieldPath,
      blockIndex,
      blockPageNumber,
      ...this.createFieldConsensusResolver({
        readingFieldValues,
      })
        .resolveConsensus(),
    }
  }

  /**
   * Create the count one field's readings are reduced by.
   *
   * @param {{
   *   readingFieldValues: Array<verification.ReadingFieldValue>
   * }} params - Parameters of this method.
   * @returns {FieldConsensusResolver} - The count.
   */
  createFieldConsensusResolver ({
    readingFieldValues,
  }) {
    return FieldConsensusResolver.create({
      readingFieldValues,
    })
  }

  /**
   * Canonicalize what one reading made of a string field.
   *
   * **A null envelope is a block this reading never listed**, and it reduces exactly as a field the
   * reading looked at and could not make out: absent, with no page and no region to offer (§6.1).
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<string> | null
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - What this reading contributes.
   */
  buildTextFieldValue ({
    readingEnvelope,
  }) {
    return {
      canonicalValue: this.readingValueCanonicalizer.canonicalizeText({
        text: readingEnvelope?.value ?? null,
      }),
      currencyCode: null,
      pageNumber: readingEnvelope?.pageNumber ?? null,
      region: readingEnvelope?.region ?? null,
    }
  }

  /**
   * Reduce what the readings made of the document's own total.
   *
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reduceAmount () {
    return this.resolveFieldConsensus({
      fieldPath: FIELD_PATH.DEBIT_NOTE.AMOUNT,
      strippedFieldPath: FIELD_PATH.DEBIT_NOTE.AMOUNT,
      blockIndex: null,
      blockPageNumber: null,
      readingFieldValues: this.normalizedExtractions
        .map(normalizedExtraction => this.buildAmountFieldValue({
          readingEnvelope: normalizedExtraction.amount,
        })),
    })
  }

  /**
   * Canonicalize what one reading made of the total, as an exact count of minor units.
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<ai.ReadingAmount>
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - What this reading contributes.
   */
  buildAmountFieldValue ({
    readingEnvelope,
  }) {
    const canonicalValue = this.readingValueCanonicalizer.canonicalizeAmount({
      readingAmount: readingEnvelope.value,
    })

    return {
      canonicalValue,
      currencyCode: this.resolveAmountCurrencyCode({
        readingEnvelope,
        canonicalValue,
      }),
      pageNumber: readingEnvelope.pageNumber,
      region: readingEnvelope.region,
    }
  }

  /**
   * Read which currency one reading stated the total in.
   *
   * **Null exactly when the figure is**, so a currency never outlives the amount it belongs to: a
   * code with no figure describes nothing, and two readings that both failed to get a figure off the
   * page agree that there was nothing to read whatever currency they thought they saw.
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<ai.ReadingAmount>
   *   canonicalValue: string | null
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null when no figure was read.
   */
  resolveAmountCurrencyCode ({
    readingEnvelope,
    canonicalValue,
  }) {
    if (canonicalValue === null) {
      return null
    }

    return this.readingValueCanonicalizer.canonicalizeText({
      text: readingEnvelope.value
        ?.currencyCode
        ?? null,
    })
  }

  /**
   * Reduce what the readings made of how long the document is.
   *
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reducePageCount () {
    return this.resolveFieldConsensus({
      fieldPath: FIELD_PATH.DEBIT_NOTE.PAGE_COUNT,
      strippedFieldPath: FIELD_PATH.DEBIT_NOTE.PAGE_COUNT,
      blockIndex: null,
      blockPageNumber: null,
      readingFieldValues: this.normalizedExtractions
        .map(normalizedExtraction => this.buildCountFieldValue({
          countLike: normalizedExtraction.pageCount,
        })),
    })
  }

  /**
   * Canonicalize what one reading made of a plain count.
   *
   * **A count carries no provenance, because §7.2 does not wrap it.** A page count is a fact about
   * the file rather than something read off a place on a page, so its row has no page and no region
   * to hold rather than a page it was guessed from.
   *
   * @param {{
   *   countLike: number | null
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - What this reading contributes.
   */
  buildCountFieldValue ({
    countLike,
  }) {
    return {
      canonicalValue: this.readingValueCanonicalizer.canonicalizeCount({
        countLike,
      }),
      currencyCode: null,
      pageNumber: null,
      region: null,
    }
  }

  /**
   * Reduce every approval block the readings between them found, in consensus order.
   *
   * @returns {Array<verification.ConsensusApprovalBlock>} - The blocks.
   */
  reduceApprovalBlocks () {
    return this.createApprovalBlockMatcher()
      .matchApprovalBlocks()
      .map((matchedApprovalBlock, blockIndex) => this.reduceApprovalBlock({
        matchedApprovalBlock,
        blockIndex,
      }))
  }

  /**
   * Create the matching that decides which block of one reading is which block of another.
   *
   * @returns {ApprovalBlockMatcher} - The matching.
   */
  createApprovalBlockMatcher () {
    return ApprovalBlockMatcher.create({
      readingApprovalBlocks: this.normalizedExtractions
        .map(normalizedExtraction => normalizedExtraction.approvalBlocks),
      readingValueCanonicalizer: this.readingValueCanonicalizer,
    })
  }

  /**
   * Reduce the four read fields of one matched block.
   *
   * @param {{
   *   matchedApprovalBlock: verification.MatchedApprovalBlock
   *   blockIndex: number
   * }} params - Parameters of this method.
   * @returns {verification.ConsensusApprovalBlock} - The block.
   */
  reduceApprovalBlock ({
    matchedApprovalBlock,
    blockIndex,
  }) {
    return {
      pageNumber: matchedApprovalBlock.pageNumber,
      blockLabel: this.reduceBlockText({
        matchedApprovalBlock,
        blockIndex,
        memberName: APPROVAL_BLOCK_MEMBER_NAME.BLOCK_LABEL,
        strippedFieldPath: FIELD_PATH.APPROVAL_BLOCK.BLOCK_LABEL,
      }),
      approverLastName: this.reduceBlockText({
        matchedApprovalBlock,
        blockIndex,
        memberName: APPROVAL_BLOCK_MEMBER_NAME.APPROVER_LAST_NAME,
        strippedFieldPath: FIELD_PATH.APPROVAL_BLOCK.APPROVER_LAST_NAME,
      }),
      approverDepartment: this.reduceBlockText({
        matchedApprovalBlock,
        blockIndex,
        memberName: APPROVAL_BLOCK_MEMBER_NAME.APPROVER_DEPARTMENT,
        strippedFieldPath: FIELD_PATH.APPROVAL_BLOCK.APPROVER_DEPARTMENT,
      }),
      isSignaturePresent: this.reduceBlockSignature({
        matchedApprovalBlock,
        blockIndex,
      }),
    }
  }

  /**
   * Reduce one string field of one matched block.
   *
   * @param {{
   *   matchedApprovalBlock: verification.MatchedApprovalBlock
   *   blockIndex: number
   *   memberName: 'blockLabel' | 'approverLastName' | 'approverDepartment'
   *   strippedFieldPath: string
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reduceBlockText ({
    matchedApprovalBlock,
    blockIndex,
    memberName,
    strippedFieldPath,
  }) {
    return this.resolveFieldConsensus({
      fieldPath: this.buildBlockFieldPath({
        blockIndex,
        memberName,
      }),
      strippedFieldPath,
      blockIndex,
      blockPageNumber: matchedApprovalBlock.pageNumber,
      readingFieldValues: this.collectBlockTextEnvelopes({
        readingBlocks: matchedApprovalBlock.readingBlocks,
        memberName,
      })
        .map(readingEnvelope => this.buildTextFieldValue({
          readingEnvelope,
        })),
    })
  }

  /**
   * Build the storage key one field of one block is written under.
   *
   * @param {{
   *   blockIndex: number
   *   memberName: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, such as `approvalBlocks[0].blockLabel`.
   */
  buildBlockFieldPath ({
    blockIndex,
    memberName,
  }) {
    return ApprovalBlockFieldPath.create({
      blockIndex,
    })
      .buildMemberPath({
        memberName,
      })
  }

  /**
   * Gather what each reading said about one string field of one block.
   *
   * @param {{
   *   readingBlocks: Array<ai.NormalizedApprovalBlock | null>
   *   memberName: 'blockLabel' | 'approverLastName' | 'approverDepartment'
   * }} params - Parameters of this method.
   * @returns {Array<ai.ReadingEnvelope<string> | null>} - One entry per reading, null where absent.
   */
  collectBlockTextEnvelopes ({
    readingBlocks,
    memberName,
  }) {
    return readingBlocks
      .map(approvalBlock => this.findBlockTextEnvelope({
        approvalBlock,
        memberName,
      }))
  }

  /**
   * Read one string field off one reading's block, or answer that the reading never listed it.
   *
   * @param {{
   *   approvalBlock: ai.NormalizedApprovalBlock | null
   *   memberName: 'blockLabel' | 'approverLastName' | 'approverDepartment'
   * }} params - Parameters of this method.
   * @returns {ai.ReadingEnvelope<string> | null} - The envelope, or null.
   */
  findBlockTextEnvelope ({
    approvalBlock,
    memberName,
  }) {
    return approvalBlock
      ?.[memberName]
      ?? null
  }

  /**
   * Reduce whether one matched block's signature field is marked.
   *
   * @param {{
   *   matchedApprovalBlock: verification.MatchedApprovalBlock
   *   blockIndex: number
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldConsensus} - The consensus.
   */
  reduceBlockSignature ({
    matchedApprovalBlock,
    blockIndex,
  }) {
    return this.resolveFieldConsensus({
      fieldPath: this.buildBlockFieldPath({
        blockIndex,
        memberName: APPROVAL_BLOCK_MEMBER_NAME.IS_SIGNATURE_PRESENT,
      }),
      strippedFieldPath: FIELD_PATH.APPROVAL_BLOCK.IS_SIGNATURE_PRESENT,
      blockIndex,
      blockPageNumber: matchedApprovalBlock.pageNumber,
      readingFieldValues: matchedApprovalBlock.readingBlocks
        .map(approvalBlock => this.buildBooleanFieldValue({
          readingEnvelope: approvalBlock
            ?.isSignaturePresent
            ?? null,
        })),
    })
  }

  /**
   * Canonicalize what one reading made of a boolean field.
   *
   * @param {{
   *   readingEnvelope: ai.ReadingEnvelope<boolean> | null
   * }} params - Parameters of this method.
   * @returns {verification.ReadingFieldValue} - What this reading contributes.
   */
  buildBooleanFieldValue ({
    readingEnvelope,
  }) {
    return {
      canonicalValue: this.readingValueCanonicalizer.canonicalizeBoolean({
        booleanLike: readingEnvelope?.value ?? null,
      }),
      currencyCode: null,
      pageNumber: readingEnvelope?.pageNumber ?? null,
      region: readingEnvelope?.region ?? null,
    }
  }

  /**
   * List every field of this file, in the order `TBL-14` holds them.
   *
   * @param {{
   *   reducedFields: {
   *     debitNoteNumber: verification.ReadingFieldConsensus
   *     amount: verification.ReadingFieldConsensus
   *     pageCount: verification.ReadingFieldConsensus
   *     approvalBlocks: Array<verification.ConsensusApprovalBlock>
   *   }
   * }} params - Parameters of this method.
   * @returns {Array<verification.ReadingFieldConsensus>} - Every field, flat.
   */
  collectFieldConsensuses ({
    reducedFields,
  }) {
    return [
      reducedFields.debitNoteNumber,
      reducedFields.amount,
      reducedFields.pageCount,
      ...reducedFields.approvalBlocks
        .flatMap(consensusApprovalBlock => this.collectBlockFieldConsensuses({
          consensusApprovalBlock,
        })),
    ]
  }

  /**
   * List the four fields of one block.
   *
   * @param {{
   *   consensusApprovalBlock: verification.ConsensusApprovalBlock
   * }} params - Parameters of this method.
   * @returns {Array<verification.ReadingFieldConsensus>} - The fields.
   */
  collectBlockFieldConsensuses ({
    consensusApprovalBlock,
  }) {
    return [
      consensusApprovalBlock.blockLabel,
      consensusApprovalBlock.approverLastName,
      consensusApprovalBlock.approverDepartment,
      consensusApprovalBlock.isSignaturePresent,
    ]
  }
}

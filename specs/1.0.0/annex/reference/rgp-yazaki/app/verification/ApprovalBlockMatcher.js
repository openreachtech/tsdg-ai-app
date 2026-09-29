import ReadingValueCanonicalizer from './ReadingValueCanonicalizer.js'

/*
 * What a comparator answers, named rather than written as three bare integers.
 */
const ORDER_BEFORE = -1
const ORDER_SAME = 0
const ORDER_AFTER = 1

/**
 * Which approval block of one reading is which approval block of another (`ENG-05` §6.1).
 *
 * **Blocks are matched before anything is reduced, and never by array position.** The index is
 * produced independently by each reading, so reducing `approvalBlocks[1].*` positionally compares
 * whatever each reading happened to list second: a reading that missed one block shifts every block
 * after it and reports disagreement on fields that in fact agree. The page number and the printed
 * caption are the two things bitonal capture preserves best, which is what makes them usable as an
 * identity.
 *
 * **The caption is compared canonically**, so a reading answering `Approved By` is looking at the
 * same block as one answering `APPROVED BY`. Matching on the verbatim string would split one block
 * in two and report `1/3` twice where the readings agreed three times.
 *
 * **Two blocks on one page sharing a caption are told apart by the top of their region**, and a
 * block whose caption was located nowhere sorts last (§6.1 tie-break). That ordering is what the
 * third part of the identity counts, so the upper of two `APPROVED BY` blocks in one reading pairs
 * with the upper one in the next.
 *
 * **A block absent from a reading is a null in that reading's slot, not a missing row.** The
 * denominator stays `OCR_REPEAT_COUNT`, so "two of three readings saw this block at all" is
 * expressible and reaches the screen as `2 of 3` (`FR-142`).
 */
export default class ApprovalBlockMatcher {
  /**
   * Constructor.
   *
   * @param {{
   *   readingApprovalBlocks: Array<Array<ai.NormalizedApprovalBlock>>
   *   readingValueCanonicalizer: ReadingValueCanonicalizer
   * }} params - Parameters of this constructor.
   */
  constructor ({
    readingApprovalBlocks,
    readingValueCanonicalizer,
  }) {
    this.readingApprovalBlocks = readingApprovalBlocks
    this.readingValueCanonicalizer = readingValueCanonicalizer
  }

  /**
   * Factory method.
   *
   * @param {{
   *   readingApprovalBlocks: Array<Array<ai.NormalizedApprovalBlock>>
   *   readingValueCanonicalizer?: ReadingValueCanonicalizer
   * }} params - Parameters of this method.
   * @returns {ApprovalBlockMatcher} - Instance of this class.
   */
  static create ({
    readingApprovalBlocks,
    readingValueCanonicalizer = this.createReadingValueCanonicalizer(),
  }) {
    return new this({
      readingApprovalBlocks,
      readingValueCanonicalizer,
    })
  }

  /**
   * Create the canonicalization a caption is compared through.
   *
   * @returns {ReadingValueCanonicalizer} - The canonicalization.
   */
  static createReadingValueCanonicalizer () {
    return ReadingValueCanonicalizer.create()
  }

  /**
   * Pair the blocks of every reading up, one entry per block the readings between them found.
   *
   * The order of the result is the consensus ordering, so an entry's position is the index
   * `TBL-14.field_path` stores it under - stable across a re-run because it is derived from the
   * identities rather than from any one reading's array (§6.1).
   *
   * @returns {Array<verification.MatchedApprovalBlock>} - One entry per block, in consensus order.
   */
  matchApprovalBlocks () {
    const identifiedReadingBlocks = this.identifyEachReadingBlocks()

    return this.collectBlockIdentities({
      identifiedReadingBlocks,
    })
      .map(blockIdentity => this.buildMatchedApprovalBlock({
        blockIdentity,
        identifiedReadingBlocks,
      }))
  }

  /**
   * Give every block of every reading the identity it is matched by.
   *
   * @returns {Array<Array<IdentifiedApprovalBlock>>} - The identified blocks, per reading.
   */
  identifyEachReadingBlocks () {
    return this.readingApprovalBlocks
      .map(approvalBlocks => this.identifyApprovalBlocks({
        approvalBlocks,
      }))
  }

  /**
   * Give every block of one reading its identity.
   *
   * @param {{
   *   approvalBlocks: Array<ai.NormalizedApprovalBlock>
   * }} params - Parameters of this method.
   * @returns {Array<IdentifiedApprovalBlock>} - The identified blocks, in the tie-break order.
   */
  identifyApprovalBlocks ({
    approvalBlocks,
  }) {
    const sortedApprovalBlocks = this.sortApprovalBlocks({
      approvalBlocks,
    })

    return sortedApprovalBlocks
      .map((approvalBlock, blockOrder) => this.identifyApprovalBlock({
        approvalBlock,
        blockOrder,
        sortedApprovalBlocks,
      }))
  }

  /**
   * Put one reading's blocks into the order the tie-break names (§6.1).
   *
   * @param {{
   *   approvalBlocks: Array<ai.NormalizedApprovalBlock>
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedApprovalBlock>} - The blocks, sorted.
   */
  sortApprovalBlocks ({
    approvalBlocks,
  }) {
    return approvalBlocks
      .toSorted((leftBlock, rightBlock) => this.compareApprovalBlocks({
        leftBlock,
        rightBlock,
      }))
  }

  /**
   * Compare two blocks of one reading: by page, then by caption, then by where the caption sits.
   *
   * **The caption orders two blocks on one page that carry different captions**, and the spec does
   * not say it should - it says only how to break a tie *within* one caption. Something has to, and
   * the caption is the half of the identity that every reading reports: a block has no region of its
   * own, only its caption does, so ordering by region first would order blocks by a value that may
   * be null.
   *
   * @param {{
   *   leftBlock: ai.NormalizedApprovalBlock
   *   rightBlock: ai.NormalizedApprovalBlock
   * }} params - Parameters of this method.
   * @returns {number} - Negative, zero or positive, as a comparator answers.
   */
  compareApprovalBlocks ({
    leftBlock,
    rightBlock,
  }) {
    const pageNumberOrder = leftBlock.pageNumber - rightBlock.pageNumber

    if (pageNumberOrder !== ORDER_SAME) {
      return pageNumberOrder
    }

    const blockLabelOrder = this.compareNullableTexts({
      leftText: this.resolveCanonicalBlockLabel({
        approvalBlock: leftBlock,
      }),
      rightText: this.resolveCanonicalBlockLabel({
        approvalBlock: rightBlock,
      }),
    })

    if (blockLabelOrder !== ORDER_SAME) {
      return blockLabelOrder
    }

    return this.compareNullableNumbers({
      leftNumber: this.findBlockLabelRegionTop({
        approvalBlock: leftBlock,
      }),
      rightNumber: this.findBlockLabelRegionTop({
        approvalBlock: rightBlock,
      }),
    })
  }

  /**
   * Compare two texts, either of which may be missing, with the missing one last.
   *
   * @param {{
   *   leftText: string | null
   *   rightText: string | null
   * }} params - Parameters of this method.
   * @returns {number} - Negative, zero or positive, as a comparator answers.
   */
  compareNullableTexts ({
    leftText,
    rightText,
  }) {
    if (leftText === rightText) {
      return ORDER_SAME
    }

    if (leftText === null) {
      return ORDER_AFTER
    }

    if (rightText === null) {
      return ORDER_BEFORE
    }

    if (leftText < rightText) {
      return ORDER_BEFORE
    }

    return ORDER_AFTER
  }

  /**
   * Compare two numbers, either of which may be missing, with the missing one last.
   *
   * @param {{
   *   leftNumber: number | null
   *   rightNumber: number | null
   * }} params - Parameters of this method.
   * @returns {number} - Negative, zero or positive, as a comparator answers.
   */
  compareNullableNumbers ({
    leftNumber,
    rightNumber,
  }) {
    if (leftNumber === rightNumber) {
      return ORDER_SAME
    }

    if (leftNumber === null) {
      return ORDER_AFTER
    }

    if (rightNumber === null) {
      return ORDER_BEFORE
    }

    return leftNumber - rightNumber
  }

  /**
   * Read where on the page a block's caption was seen.
   *
   * @param {{
   *   approvalBlock: ai.NormalizedApprovalBlock
   * }} params - Parameters of this method.
   * @returns {number | null} - The top of the region, or null when the caption was located nowhere.
   */
  findBlockLabelRegionTop ({
    approvalBlock,
  }) {
    return approvalBlock.blockLabel.region
      ?.top
      ?? null
  }

  /**
   * Give one block its identity, counting how many like it this reading already listed.
   *
   * @param {{
   *   approvalBlock: ai.NormalizedApprovalBlock
   *   blockOrder: number
   *   sortedApprovalBlocks: Array<ai.NormalizedApprovalBlock>
   * }} params - Parameters of this method.
   * @returns {IdentifiedApprovalBlock} - The block with its identity.
   */
  identifyApprovalBlock ({
    approvalBlock,
    blockOrder,
    sortedApprovalBlocks,
  }) {
    const canonicalBlockLabel = this.resolveCanonicalBlockLabel({
      approvalBlock,
    })

    const occurrence = this.countPrecedingSiblingBlocks({
      approvalBlock,
      blockOrder,
      sortedApprovalBlocks,
    })

    return {
      identityKey: this.buildIdentityKey({
        pageNumber: approvalBlock.pageNumber,
        canonicalBlockLabel,
        occurrence,
      }),
      pageNumber: approvalBlock.pageNumber,
      canonicalBlockLabel,
      occurrence,
      approvalBlock,
    }
  }

  /**
   * Canonicalize the caption a block is matched by.
   *
   * @param {{
   *   approvalBlock: ai.NormalizedApprovalBlock
   * }} params - Parameters of this method.
   * @returns {string | null} - The caption, or null when it could not be read.
   */
  resolveCanonicalBlockLabel ({
    approvalBlock,
  }) {
    return this.readingValueCanonicalizer.canonicalizeText({
      text: approvalBlock.blockLabel.value,
    })
  }

  /**
   * Count how many blocks this reading already listed on the same page under the same caption.
   *
   * @param {{
   *   approvalBlock: ai.NormalizedApprovalBlock
   *   blockOrder: number
   *   sortedApprovalBlocks: Array<ai.NormalizedApprovalBlock>
   * }} params - Parameters of this method.
   * @returns {number} - The count, which is this block's occurrence.
   */
  countPrecedingSiblingBlocks ({
    approvalBlock,
    blockOrder,
    sortedApprovalBlocks,
  }) {
    return sortedApprovalBlocks
      .slice(0, blockOrder)
      .filter(precedingBlock => this.isSiblingBlock({
        approvalBlock,
        comparedBlock: precedingBlock,
      }))
      .length
  }

  /**
   * Answer whether two blocks of one reading sit on the same page under the same caption.
   *
   * @param {{
   *   approvalBlock: ai.NormalizedApprovalBlock
   *   comparedBlock: ai.NormalizedApprovalBlock
   * }} params - Parameters of this method.
   * @returns {boolean} - true: they share an identity but for their occurrence.
   */
  isSiblingBlock ({
    approvalBlock,
    comparedBlock,
  }) {
    if (comparedBlock.pageNumber !== approvalBlock.pageNumber) {
      return false
    }

    return this.resolveCanonicalBlockLabel({
      approvalBlock: comparedBlock,
    }) === this.resolveCanonicalBlockLabel({
      approvalBlock,
    })
  }

  /**
   * Build the key two readings' blocks are matched on.
   *
   * @param {{
   *   pageNumber: number
   *   canonicalBlockLabel: string | null
   *   occurrence: number
   * }} params - Parameters of this method.
   * @returns {string} - The key.
   */
  buildIdentityKey ({
    pageNumber,
    canonicalBlockLabel,
    occurrence,
  }) {
    return JSON.stringify([
      pageNumber,
      canonicalBlockLabel,
      occurrence,
    ])
  }

  /**
   * Collect the blocks the readings between them found, once each, in consensus order.
   *
   * @param {{
   *   identifiedReadingBlocks: Array<Array<IdentifiedApprovalBlock>>
   * }} params - Parameters of this method.
   * @returns {Array<IdentifiedApprovalBlock>} - One entry per identity.
   */
  collectBlockIdentities ({
    identifiedReadingBlocks,
  }) {
    const identifiedBlocks = identifiedReadingBlocks.flat()

    return identifiedBlocks
      .filter((identifiedBlock, blockOrder) =>
        this.findFirstIdentityOrder({
          identifiedBlocks,
          identityKey: identifiedBlock.identityKey,
        }) === blockOrder
      )
      .toSorted((leftBlock, rightBlock) => this.compareBlockIdentities({
        leftBlock,
        rightBlock,
      }))
  }

  /**
   * Find where an identity first appears, which is how a repeat of it is dropped.
   *
   * @param {{
   *   identifiedBlocks: Array<IdentifiedApprovalBlock>
   *   identityKey: string
   * }} params - Parameters of this method.
   * @returns {number} - The position.
   */
  findFirstIdentityOrder ({
    identifiedBlocks,
    identityKey,
  }) {
    return identifiedBlocks
      .findIndex(identifiedBlock => identifiedBlock.identityKey === identityKey)
  }

  /**
   * Compare two identities, which is what puts the consensus blocks in their stored order.
   *
   * @param {{
   *   leftBlock: IdentifiedApprovalBlock
   *   rightBlock: IdentifiedApprovalBlock
   * }} params - Parameters of this method.
   * @returns {number} - Negative, zero or positive, as a comparator answers.
   */
  compareBlockIdentities ({
    leftBlock,
    rightBlock,
  }) {
    const pageNumberOrder = leftBlock.pageNumber - rightBlock.pageNumber

    if (pageNumberOrder !== ORDER_SAME) {
      return pageNumberOrder
    }

    const blockLabelOrder = this.compareNullableTexts({
      leftText: leftBlock.canonicalBlockLabel,
      rightText: rightBlock.canonicalBlockLabel,
    })

    if (blockLabelOrder !== ORDER_SAME) {
      return blockLabelOrder
    }

    return leftBlock.occurrence - rightBlock.occurrence
  }

  /**
   * Gather what every reading said about one block, with a null where a reading did not see it.
   *
   * @param {{
   *   blockIdentity: IdentifiedApprovalBlock
   *   identifiedReadingBlocks: Array<Array<IdentifiedApprovalBlock>>
   * }} params - Parameters of this method.
   * @returns {verification.MatchedApprovalBlock} - The block, as every reading had it.
   */
  buildMatchedApprovalBlock ({
    blockIdentity,
    identifiedReadingBlocks,
  }) {
    return {
      pageNumber: blockIdentity.pageNumber,
      canonicalBlockLabel: blockIdentity.canonicalBlockLabel,
      readingBlocks: identifiedReadingBlocks
        .map(identifiedBlocks => this.findIdentifiedBlock({
          identifiedBlocks,
          identityKey: blockIdentity.identityKey,
        })),
    }
  }

  /**
   * Find what one reading said about one block.
   *
   * @param {{
   *   identifiedBlocks: Array<IdentifiedApprovalBlock>
   *   identityKey: string
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedApprovalBlock | null} - The block, or null when this reading missed it.
   */
  findIdentifiedBlock ({
    identifiedBlocks,
    identityKey,
  }) {
    return identifiedBlocks
      .find(identifiedBlock => identifiedBlock.identityKey === identityKey)
      ?.approvalBlock
      ?? null
  }
}

/**
 * One reading's approval block, with the identity it is matched to other readings by.
 *
 * @typedef {{
 *   identityKey: string
 *   pageNumber: number
 *   canonicalBlockLabel: string | null
 *   occurrence: number
 *   approvalBlock: ai.NormalizedApprovalBlock
 * }} IdentifiedApprovalBlock
 */

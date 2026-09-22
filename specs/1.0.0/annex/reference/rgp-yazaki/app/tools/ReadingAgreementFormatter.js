import CANONICAL_BOOLEAN_TEXT_CONSTANT_HASH from '../constants/canonicalBooleanText.js'
import FIELD_PATH_CONSTANT_HASH from '../constants/fieldPath.js'

import ApprovalBlockFieldPath from '../verification/ApprovalBlockFieldPath.js'
import CurrencyResolver from '../verification/CurrencyResolver.js'

import AmountFormatter from './AmountFormatter.js'

const {
  CANONICAL_BOOLEAN_TEXT,
} = CANONICAL_BOOLEAN_TEXT_CONSTANT_HASH

const {
  FIELD_PATH,
} = FIELD_PATH_CONSTANT_HASH

/*
 * What a field with no `TBL-14` row answers.
 *
 * The wrapper is non-null even here (§2.6), so the level has to say something, and 0 of 0 is the
 * only truthful thing to say: nobody looked. It is reachable rather than defensive - a database
 * upgraded from 1.0.0 has judgments whose approval blocks were never read (`MIG-02`), and the
 * evidence view still opens for them (`DR-03`).
 */
const UNREAD_FIELD_AGREEMENT = {
  agreedReadingCount: 0,
  totalReadingCount: 0,
}

/**
 * One file's `TBL-14` rows, in the shapes the operator schema declares for a read value (§2.6).
 *
 * **Value, agreement and provenance leave together or not at all.** That is the whole reason
 * `TBL-14` is one row per field rather than three tables, and it is the reason this class exists:
 * a caller asks for a field and gets the wrapper, so there is no way to render a figure on one
 * screen without the level that belongs beside it (`FR-142` `FR-131`).
 *
 * **Two operations read it and must not disagree.** `API-Q002` marks a shaky row in a table of 200
 * and `API-Q003` shows the level per field on the document the operator opened; the second is
 * reached by clicking the first, so a field the two filled differently would be the screen changing
 * its mind. Formatting them in one place is what makes that impossible rather than merely unlikely.
 *
 * **It never reads `TBL-06`** (`UX-08` `DR-02`). What reaches the operator is the consensus the
 * judgment was made from, not the readings behind it.
 */
export default class ReadingAgreementFormatter {
  /**
   * Constructor.
   *
   * @param {{
   *   readingFieldAgreements: Array<ReadingFieldAgreementEntity>
   *   currencyResolver: CurrencyResolver
   * }} params - Parameters of this constructor.
   */
  constructor ({
    readingFieldAgreements,
    currencyResolver,
  }) {
    this.readingFieldAgreements = readingFieldAgreements
    this.currencyResolver = currencyResolver
  }

  /**
   * Factory method.
   *
   * @param {{
   *   readingFieldAgreements: Array<ReadingFieldAgreementEntity>
   *   currencyResolver?: CurrencyResolver
   * }} params - Parameters of this method.
   * @returns {ReadingAgreementFormatter} - Instance of this class.
   * @public
   */
  static create ({
    readingFieldAgreements,
    currencyResolver = this.createCurrencyResolver(),
  }) {
    return new this({
      readingFieldAgreements,
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
   * Format one amount field as the wire carries it.
   *
   * @param {{
   *   fieldPath: string
   * }} params - Parameters of this method.
   * @returns {graphql.operator.ReadAmount} - The amount, its level and where it was read.
   * @public
   */
  formatReadAmount ({
    fieldPath,
  }) {
    const agreement = this.findAgreement({
      fieldPath,
    })

    return {
      amount: this.formatAmount({
        agreement,
      }),
      agreement: this.formatAgreementLevel({
        agreement,
      }),
      pageNumber: agreement?.pageNumber ?? null,
      region: this.formatRegion({
        agreement,
      }),
    }
  }

  /**
   * Format the figure of an amount field.
   *
   * The currency is resolved from the row's own `CurrencyId` rather than from the judgment, because
   * this is what the readings agreed on and the judgment is what was made of it - two columns that
   * can legitimately differ on a document nobody agreed about.
   *
   * @param {{
   *   agreement: ReadingFieldAgreementEntity | null
   *   AmountFormatterCtor?: typeof AmountFormatter
   * }} params - Parameters of this method.
   * @returns {graphql.operator.Amount | null} - The amount, or null when there is none to show.
   */
  formatAmount ({
    agreement,
    AmountFormatterCtor = AmountFormatter,
  }) {
    return AmountFormatterCtor.create({
      amountLike: agreement?.consensusValue ?? null,
      currency: this.currencyResolver.findCurrencyById({
        currencyId: agreement?.CurrencyId ?? null,
      }),
    })
      .formatAmount()
  }

  /**
   * Format one text field as the wire carries it.
   *
   * The string arrives in the canonical form `ENG-05` compared on - trimmed and upper-cased - which
   * is what `TBL-14` stores, because what the comparison was made on is the only form the level
   * beside it describes (§6.1 step 1).
   *
   * @param {{
   *   fieldPath: string
   * }} params - Parameters of this method.
   * @returns {graphql.operator.ReadText} - The text, its level and where it was read.
   * @public
   */
  formatReadText ({
    fieldPath,
  }) {
    const agreement = this.findAgreement({
      fieldPath,
    })

    return {
      text: agreement?.consensusValue ?? null,
      agreement: this.formatAgreementLevel({
        agreement,
      }),
      pageNumber: agreement?.pageNumber ?? null,
      region: this.formatRegion({
        agreement,
      }),
    }
  }

  /**
   * Format one flag field as the wire carries it.
   *
   * @param {{
   *   fieldPath: string
   * }} params - Parameters of this method.
   * @returns {graphql.operator.ReadFlag} - The flag, its level and where it was read.
   * @public
   */
  formatReadFlag ({
    fieldPath,
  }) {
    const agreement = this.findAgreement({
      fieldPath,
    })

    return {
      isDetected: this.readFlagValue({
        agreement,
      }),
      agreement: this.formatAgreementLevel({
        agreement,
      }),
      pageNumber: agreement?.pageNumber ?? null,
      region: this.formatRegion({
        agreement,
      }),
    }
  }

  /**
   * Read a stored flag back into a boolean.
   *
   * **Null stays null rather than becoming false.** A field the readings could not agree on is not
   * a field they agreed was absent, and `DR-03` is the rule that an unreadable input never quietly
   * becomes an answer somebody acts on.
   *
   * @param {{
   *   agreement: ReadingFieldAgreementEntity | null
   * }} params - Parameters of this method.
   * @returns {boolean | null} - What was read, or null when nothing was agreed.
   */
  readFlagValue ({
    agreement,
  }) {
    if (!agreement || agreement.consensusValue === null) {
      return null
    }

    return agreement.consensusValue === CANONICAL_BOOLEAN_TEXT.TRUE
  }

  /**
   * Format every approval block this file's readings agreed on.
   *
   * **An empty array means no block was found, which is `NG-010` rather than `NG-003`** (§3.4). The
   * two are different findings and the screen renders them differently, so an empty list is a
   * statement rather than an absence.
   *
   * @returns {Array<graphql.operator.ApprovalBlockResult>} - The blocks, in index order.
   * @public
   */
  formatApprovalBlocks () {
    return this.collectBlockIndexes()
      .map(blockIndex =>
        this.formatApprovalBlock({
          blockIndex,
        })
      )
  }

  /**
   * Collect the indexes this file's blocks were stored under.
   *
   * **It walks upward and stops rather than parsing a path.** `ENG-05` assigns block indexes by
   * sorted position, so they are contiguous from 0 and the first index with no row is the end. The
   * probe is `blockLabel` because that field is the matching key itself: every reading that
   * contributed to a block carried the same canonical caption, so a matched block always has that
   * row even when none of its four fields reached a consensus.
   *
   * @returns {Array<number>} - The indexes, ascending.
   */
  collectBlockIndexes () {
    const storedPaths = this.readingFieldAgreements
      .map(readingFieldAgreement => readingFieldAgreement.fieldPath)

    return this.buildProbedBlockIndexes()
      .filter(blockIndex =>
        storedPaths.includes(
          this.buildBlockMemberPath({
            blockIndex,
            memberName: ApprovalBlockFieldPath.memberName.BLOCK_LABEL,
          })
        )
      )
  }

  /**
   * Build the indexes worth probing.
   *
   * A block contributes four rows and never fewer than one, so no block can be stored under an
   * index at or beyond this file's row count. Probing a bounded range is what lets the read side
   * hold no parser: an index recovered out of a stored path would be a second place that knows how
   * the path is spelled, and the format would then be free to differ in one of them.
   *
   * @returns {Array<number>} - Every index a block could occupy, ascending.
   */
  buildProbedBlockIndexes () {
    return Array.from(
      {
        length: this.readingFieldAgreements.length,
      },
      (unusedValue, blockIndex) => blockIndex
    )
  }

  /**
   * Format one approval block.
   *
   * **`pageNumber` is identity, not provenance.** It comes from `block_page_number`, which `ENG-05`
   * knew the moment it matched the block by `(pageNumber, blockLabel)` - so it is still there when
   * all four fields came out at 1/3 and every provenance column is null (§6.2).
   *
   * @param {{
   *   blockIndex: number
   * }} params - Parameters of this method.
   * @returns {graphql.operator.ApprovalBlockResult} - One block.
   */
  formatApprovalBlock ({
    blockIndex,
  }) {
    const {
      memberName,
    } = ApprovalBlockFieldPath

    return {
      pageNumber: this.findBlockPageNumber({
        blockIndex,
      }),
      blockLabel: this.formatReadText({
        fieldPath: this.buildBlockMemberPath({
          blockIndex,
          memberName: memberName.BLOCK_LABEL,
        }),
      }),
      approverLastName: this.formatReadText({
        fieldPath: this.buildBlockMemberPath({
          blockIndex,
          memberName: memberName.APPROVER_LAST_NAME,
        }),
      }),
      approverDepartment: this.formatReadText({
        fieldPath: this.buildBlockMemberPath({
          blockIndex,
          memberName: memberName.APPROVER_DEPARTMENT,
        }),
      }),
      signature: this.formatReadFlag({
        fieldPath: this.buildBlockMemberPath({
          blockIndex,
          memberName: memberName.IS_SIGNATURE_PRESENT,
        }),
      }),
    }
  }

  /**
   * Find the page one block sits on.
   *
   * @param {{
   *   blockIndex: number
   * }} params - Parameters of this method.
   * @returns {number | null} - The page. Null only on a row written before the column existed.
   */
  findBlockPageNumber ({
    blockIndex,
  }) {
    const agreement = this.findAgreement({
      fieldPath: this.buildBlockMemberPath({
        blockIndex,
        memberName: ApprovalBlockFieldPath.memberName.BLOCK_LABEL,
      }),
    })

    return agreement?.blockPageNumber ?? null
  }

  /**
   * Build the stored path of one member of one block.
   *
   * @param {{
   *   blockIndex: number
   *   memberName: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, as `TBL-14` stores it.
   */
  buildBlockMemberPath ({
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
   * Find the weakest reading behind this debit note, for one-glance triage (§3.4).
   *
   * **It is defined, not merely described.** The minimum runs over the rows whose field is reported
   * on screen - the amount, the number and every member of every approval block. **`pageCount` is
   * excluded**: nothing renders it as a read value, and letting it drag a row's marker down would
   * mark rows for a fact no operator acts on.
   *
   * **A convenience the table earns.** `CMP-06` shows 200 rows and has to mark the shaky ones
   * without the operator opening each; deriving it client-side would mean sending every field's
   * level to compute one number per row. The per-field levels stay on `API-Q003`, where the
   * operator is looking at one document.
   *
   * @returns {graphql.operator.AgreementLevel} - The weakest level, never null (§2.6).
   * @public
   */
  findLowestAgreement () {
    const rankedAgreements = this.collectReportedAgreements()
      .toSorted((one, another) =>
        this.compareAgreementRank({
          one,
          another,
        })
      )

    return this.formatAgreementLevel({
      agreement: rankedAgreements.at(0)
        ?? null,
    })
  }

  /**
   * Collect the rows whose field the screen reports as a read value.
   *
   * @returns {Array<ReadingFieldAgreementEntity>} - The rows, in stored order.
   */
  collectReportedAgreements () {
    const reportedPaths = this.collectReportedFieldPaths()

    return this.readingFieldAgreements
      .filter(readingFieldAgreement => reportedPaths.includes(readingFieldAgreement.fieldPath))
  }

  /**
   * Collect the paths of the fields the screen reports as read values.
   *
   * Stated positively rather than as "everything but `pageCount`", because the set has to stay the
   * set this class formats: a field added to the screen without being added here would be a field
   * whose weak reading no marker ever showed.
   *
   * @returns {Array<string>} - The paths.
   */
  collectReportedFieldPaths () {
    const blockPaths = this.collectBlockIndexes()
      .flatMap(blockIndex =>
        Object.values(ApprovalBlockFieldPath.memberName)
          .map(memberName =>
            this.buildBlockMemberPath({
              blockIndex,
              memberName,
            })
          )
      )

    return [
      FIELD_PATH.DEBIT_NOTE.AMOUNT,
      FIELD_PATH.DEBIT_NOTE.DEBIT_NOTE_NUMBER,
      ...blockPaths,
    ]
  }

  /**
   * Rank one row against another, weakest first (§3.4).
   *
   * **The ratio decides, then the numerator, then the null.** The two sentences of §3.4 are both
   * about ties at the same ratio, and this is the order in which they do not collide: the numerator
   * settles a ratio tie, so `1/3` ranks below `2/6`, and a null consensus settles what is left,
   * which is a tie on both - the strongest signal the table can carry, and the row `NG-008` is
   * already on.
   *
   * The ratio is compared by cross-multiplication rather than by dividing, so no level passes
   * through a float on its way to being ordered.
   *
   * @param {{
   *   one: ReadingFieldAgreementEntity
   *   another: ReadingFieldAgreementEntity
   * }} params - Parameters of this method.
   * @returns {number} - Negative when `one` is the weaker.
   */
  compareAgreementRank ({
    one,
    another,
  }) {
    const ratioOrder = (one.agreedReadingCount * another.totalReadingCount)
      - (another.agreedReadingCount * one.totalReadingCount)

    if (ratioOrder !== 0) {
      return ratioOrder
    }

    const numeratorOrder = one.agreedReadingCount - another.agreedReadingCount

    if (numeratorOrder !== 0) {
      return numeratorOrder
    }

    const oneConsensusRank = this.rankConsensusPresence({
      agreement: one,
    })
    const anotherConsensusRank = this.rankConsensusPresence({
      agreement: another,
    })

    return oneConsensusRank - anotherConsensusRank
  }

  /**
   * Rank a row by whether it kept a value at all.
   *
   * @param {{
   *   agreement: ReadingFieldAgreementEntity
   * }} params - Parameters of this method.
   * @returns {number} - 0 where nothing was agreed, 1 where something was.
   */
  rankConsensusPresence ({
    agreement,
  }) {
    if (agreement.consensusValue === null) {
      return 0
    }

    return 1
  }

  /**
   * Find the row of one field.
   *
   * @param {{
   *   fieldPath: string
   * }} params - Parameters of this method.
   * @returns {ReadingFieldAgreementEntity | null} - The row, or null when the field was never read.
   */
  findAgreement ({
    fieldPath,
  }) {
    return this.readingFieldAgreements
      .find(readingFieldAgreement => readingFieldAgreement.fieldPath === fieldPath)
      ?? null
  }

  /**
   * Format the level of one field.
   *
   * @param {{
   *   agreement: ReadingFieldAgreementEntity | null
   * }} params - Parameters of this method.
   * @returns {graphql.operator.AgreementLevel} - The level, never null (§2.6).
   */
  formatAgreementLevel ({
    agreement,
  }) {
    if (!agreement) {
      return {
        ...UNREAD_FIELD_AGREEMENT,
      }
    }

    return {
      agreedReadingCount: agreement.agreedReadingCount,
      totalReadingCount: agreement.totalReadingCount,
    }
  }

  /**
   * Format where one field was read from.
   *
   * The four columns are null together, so one of them decides the answer for all four: a value
   * read without being located reports no region rather than a box at the origin (`FR-131`).
   *
   * @param {{
   *   agreement: ReadingFieldAgreementEntity | null
   * }} params - Parameters of this method.
   * @returns {graphql.operator.ReadRegion | null} - The region, or null when none was located.
   */
  formatRegion ({
    agreement,
  }) {
    if (!agreement || agreement.regionLeft === null) {
      return null
    }

    return {
      pageNumber: agreement.pageNumber,
      left: agreement.regionLeft,
      top: agreement.regionTop,
      right: agreement.regionRight,
      bottom: agreement.regionBottom,
    }
  }
}

/**
 * @typedef {import('../../sequelize/models/ReadingFieldAgreement.js').ReadingFieldAgreementEntity} ReadingFieldAgreementEntity
 */

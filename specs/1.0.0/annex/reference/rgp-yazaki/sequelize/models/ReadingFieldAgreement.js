import {
  ModelAttributeFactory,
  RenchanModel,
} from '@openreachtech/renchan-sequelize'

/**
 * ReadingFieldAgreement model - what a file's readings agreed on, field by field (`TBL-14`).
 *
 * `ENG-05` writes one row per field by reducing that file's `TBL-06` rows, and `NFR-031` requires
 * the whole set to be recomputable from those rows plus the currency master and nothing else. That
 * is what makes an agreement level auditable months after the batch ran.
 *
 * **This is the table the evidence view reads** (`SCR-05`). Every number it shows comes from here
 * with its agreement level beside it (`FR-142`) and its region under it (`FR-131`), which is why
 * value, agreement and provenance are one row rather than three tables.
 *
 * **It also replaces `TBL-07.row_signature_results`.** 1.0.0 kept the per-line-item signature array
 * in a JSON column; each approval block's fields live here under `approvalBlocks[n].*` paths, which
 * is what lets a block carry an agreement level of its own.
 */
export default class ReadingFieldAgreement extends RenchanModel {
  /** @override */
  static createAttributes (DataTypes) {
    const factory = ModelAttributeFactory.create(DataTypes)

    return {
      ...factory.ID_BIGINT,

      // ForeignKey must start with upper case. Unique with `fieldPath`.
      BatchFileId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      // Stored in the indexed form (`approvalBlocks[0].isSignaturePresent`), because it is a
      // storage key and has to stay unique per file. What reaches a sentence is the stripped form
      // plus its index, which `NG-007` and `NG-008` carry separately (`DR-13`).
      fieldPath: {
        type: DataTypes.STRING(191),
        allowNull: false,
      },
      // The agreed value in its canonical string form, and null when the readings did not agree
      // (`NG-008`) or none of them read it (`NG-005`). A string because the fields it holds are of
      // four different types, and one typed column per kind would be four mostly-null columns.
      consensusValue: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // ForeignKey must start with upper case. Non-null only where the field is an amount.
      CurrencyId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      // The numerator of `TERM-15`. It can be 1 while `consensusValue` is null: three mutually
      // different readings agree 1-of-3 on each of three values, so there is no majority.
      agreedReadingCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // The denominator, which equals the count of that file's `TBL-06` rows.
      totalReadingCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // The page the approval block sits on, and null on every field that belongs to no block.
      // This is identity rather than provenance: `ENG-05` matches blocks by `(pageNumber,
      // blockLabel)` before it reduces anything, so the page is known from the match and stays
      // known even when all four of the block's fields come out with no consensus at all. That is
      // the case `pageNumber` below cannot answer, and `ApprovalBlockResult.pageNumber` is `Int!`.
      blockPageNumber: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Where the value was read from (`TERM-18`), and null when no reading located it. It sits
      // beside the region rather than inside it because a page without a box is a real state.
      pageNumber: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // The region in the 0-1000 space of §7.2, relative to the page (`FR-132`). All four are null
      // together, and they hold the region of the first reading that produced the consensus value.
      regionLeft: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      regionTop: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      regionRight: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      regionBottom: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    }
  }

  /** @override */
  static createOptions (sequelizeClient) {
    return {
      ...super.createOptions(sequelizeClient),
    }
  }

  /** @override */
  static associate () {
    super.associate?.()

    this.belongsTo(this._.BatchFile)
    // Null on every field that is not an amount, so the association is optional by the column.
    this.belongsTo(this._.Currency)
  }

  /** @override */
  static defineScopes (Op) {
    super.defineScopes?.(Op)

    // noop
  }

  /** @override */
  static setupHooks () {
    super.setupHooks?.()

    // noop
  }

  /** @override */
  static defineSubqueries () {
    super.defineSubqueries?.()

    // noop
  }
}

/**
 * @typedef {ReadingFieldAgreement & {
 *   id: number
 *   BatchFileId: number
 *   fieldPath: string
 *   consensusValue: string | null
 *   CurrencyId: number | null
 *   agreedReadingCount: number
 *   totalReadingCount: number
 *   blockPageNumber: number | null
 *   pageNumber: number | null
 *   regionLeft: number | null
 *   regionTop: number | null
 *   regionRight: number | null
 *   regionBottom: number | null
 * }} ReadingFieldAgreementEntity
 */

import {
  ModelAttributeFactory,
  RenchanModel,
} from '@openreachtech/renchan-sequelize'

/**
 * BatchUpload model - one drag of a folder (`TBL-17` `TERM-21`).
 *
 * The root the operator selected and the two times that bound it. It outlives the requests that
 * carry it - `API-M002` opens it, `API-M003` fills it, `API-M005` closes it - so it is not a
 * session, and one upload holds one or many batches.
 *
 * The upload carries no status of its own. An upload is not processed; its batches are (`ST-02`),
 * and a second answer to "is this done" would disagree with theirs the moment one batch of five
 * was started.
 */
export default class BatchUpload extends RenchanModel {
  /** @override */
  static createAttributes (DataTypes) {
    const factory = ModelAttributeFactory.create(DataTypes)

    return {
      ...factory.ID_BIGINT,

      // ForeignKey must start with upper case.
      UploadedByUserId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      rootFolderName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      uploadedAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
      },
      // Null means the upload was abandoned before `API-M005` derived its batches.
      finalizedAt: {
        type: DataTypes.DATE(3),
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

    // The foreign key is named for the role rather than for the model, so it must be declared:
    // Sequelize would otherwise look for a column called UserId.
    this.belongsTo(this._.User, {
      foreignKey: 'UploadedByUserId',
    })

    // The folders `API-M005` derived under this drag, which `API-Q001` draws as one tree.
    this.hasMany(this._.VerificationBatch)
    // Every file of the drag, including the ones the derivation gave to no batch (`ADR-25`). This
    // is the only side that can still reach those, and what `unbatchedFileCount` counts.
    this.hasMany(this._.BatchFile)
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
 * @typedef {BatchUpload & {
 *   id: number
 *   UploadedByUserId: number
 *   rootFolderName: string
 *   uploadedAt: Date
 *   finalizedAt: Date | null
 * }} BatchUploadEntity
 */

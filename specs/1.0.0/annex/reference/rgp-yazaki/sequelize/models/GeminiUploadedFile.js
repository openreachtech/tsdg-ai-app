import {
  ModelAttributeFactory,
  RenchanModel,
} from '@openreachtech/renchan-sequelize'

/**
 * GeminiUploadedFile model - the record that a document left the host (`TBL-08` `STORE-02`).
 *
 * **The only answer to "what was sent to the provider, when, and is it still there"** that is not a
 * log grep (`OPS-08`). Written by `AI-01` on the Files API path (`ADR-07`) and by nothing else.
 *
 * **Empty on the default driver.** `AI_PROVIDER=stub` makes no outbound call, so a stub run that
 * produced a row here is a bug rather than a surprise (`SEC-004`).
 *
 * The `expired` state of `ST-03` is derived from `expiresAt`, never stored: a stored copy would
 * need a job to keep it accurate, which is the job it would be replacing.
 */
export default class GeminiUploadedFile extends RenchanModel {
  /** @override */
  static createAttributes (DataTypes) {
    const factory = ModelAttributeFactory.create(DataTypes)

    return {
      ...factory.ID_BIGINT,

      // ForeignKey must start with upper case.
      BatchFileId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true,
      },
      providerFileUri: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      providerFileName: {
        type: DataTypes.STRING(191),
        allowNull: false,
      },
      uploadedAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
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

  /**
   * Check whether the provider has already deleted the file this row is about.
   *
   * Derived from `expiresAt` rather than read from a column, which is what keeps `ST-03` honest:
   * there is no stored state here that could disagree with the clock.
   *
   * @param {{
   *   comparedAt: Date
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the provider's retention has passed.
   */
  isExpired ({
    comparedAt,
  }) {
    const expiresAt = /** @type {Date} */ (
      this.get('expiresAt')
    )

    return expiresAt.getTime() <= comparedAt.getTime()
  }
}

/**
 * @typedef {GeminiUploadedFile & {
 *   id: number
 *   BatchFileId: number
 *   providerFileUri: string
 *   providerFileName: string
 *   uploadedAt: Date
 *   expiresAt: Date
 * }} GeminiUploadedFileEntity
 */

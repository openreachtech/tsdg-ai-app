import {
  ModelAttributeFactory,
} from '@openreachtech/renchan-sequelize'
import BaseAppRenchanModel from '../baseModel/BaseAppRenchanModel.js'

/**
 * AiAgent model
 *
 * @class AiAgent
 * @extends {BaseAppRenchanModel}
 */
export default class AiAgent extends BaseAppRenchanModel {
  /**
   * Define model attributes
   *
   * @param {import('sequelize').DataTypes} DataTypes - Sequelize DataTypes
   * @returns {object} Model attributes
   */
  static createAttributes (DataTypes) {
    const factory = ModelAttributeFactory.create(DataTypes)

    return {
      ...factory.ID_BIGINT,

      name: {
        type: DataTypes.STRING(191),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      registeredAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
      },
      savedAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      lastModifiedAt: {
        type: DataTypes.DATE(3),
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      CreatedByUserId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      LastModifiedByUserId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    }
  }

  /**
   * Define model options
   *
   * @param {import('sequelize').Sequelize} sequelizeClient - Sequelize instance
   * @returns {object} Model options
   */
  static createOptions (sequelizeClient) {
    return {
      ...super.createOptions(sequelizeClient),
    }
  }

  /**
   * Define model associations
   */
  static associate () {
    super.associate?.()

    this.hasOne(this._.AiAgentLatestStatus)
    this.hasOne(this._.AiAgentDefaultInstruction)
    this.hasOne(this._.AiAgentRoleInstruction)
    this.hasOne(this._.AiAgentAvatarUrl)
    this.hasOne(this._.AiAgentRoleCategory)
    this.hasOne(this._.AiAgentEmotionalLevel)
    this.hasOne(this._.AiAgentDefaultModel)

    this.hasMany(this._.AiAgentStatusPhase)
    this.hasMany(this._.AiAgentAvailableAiTool)
    this.hasMany(this._.AiAgentTagAssignment)
    this.hasMany(this._.AiAgentDocumentAssignment)
    this.hasMany(this._.AiAgentDocumentInstructionRecord)

    this.belongsTo(this._.User, {
      as: 'CreatedByUser',
      foreignKey: 'CreatedByUserId',
    })
    this.belongsTo(this._.User, {
      as: 'LastModifiedByUser',
      foreignKey: 'LastModifiedByUserId',
    })

    this.belongsToMany(this._.AiAgentTag, {
      through: this._.AiAgentTagAssignment,
    })
    this.belongsToMany(this._.Document, {
      through: this._.AiAgentDocumentGeneration,
      as: 'GeneratedDocuments',
    })
  }

  /**
   * Define model scopes
   *
   * @param {import('sequelize').Op} Op - Sequelize operators
   */
  static defineScopes (Op) {
    super.defineScopes?.(Op)

    // noop
  }

  /**
   * Define subqueries
   */
  static defineSubqueries () {
    super.defineSubqueries?.()

    // noop
  }

  /**
   * Setup model hooks
   */
  static setupHooks () {
    super.setupHooks?.()

    // noop
  }
}

import {
  BackupMixinModel,
  ModelAttributeFactory,
} from '@openreachtech/renchan-sequelize'
import BaseAppRenchanModel from '../baseModel/BaseAppRenchanModel.js'

/**
 * AiAgentLatestStatus model
 *
 * @class AiAgentLatestStatus
 * @extends {BaseAppRenchanModel}
 */
export default class AiAgentLatestStatus extends BaseAppRenchanModel {
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

      AiAgentId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      AiAgentStatusId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      savedAt: {
        type: DataTypes.DATE(3),
        allowNull: false,
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

    this.belongsTo(this._.AiAgent)
    this.belongsTo(this._.AiAgentStatus)
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

    const allAttributes = this.getAttributes()
    const AiAgentStatusIdField = allAttributes.AiAgentStatusId.field
    const AiAgentIdField = allAttributes.AiAgentId.field

    this.addSubquery({
      name: '?AiAgentStatusId.AiAgentId',
      generator: ({
        AiAgentStatusId,
      }) => {
        const attributes = [
          AiAgentIdField,
        ]

        const whereClause = {
          [AiAgentStatusIdField]: AiAgentStatusId,
        }

        return {
          attributes,
          where: whereClause,
        }
      },
    })
  }

  /**
   * Setup model hooks
   */
  static setupHooks () {
    super.setupHooks?.()

    // noop
  }

  /**
   * Get model mixins
   *
   * @returns {Array} Array of mixins
   */
  static get Mixins () {
    return [
      BackupMixinModel,
    ]
  }

  /**
   * Get backup model for BackupMixinModel
   *
   * @returns {typeof import('./AiAgentStatusPhase.js').default} Backup model declaration
   */
  static get BackupModel () {
    return this._.AiAgentStatusPhase
  }
}

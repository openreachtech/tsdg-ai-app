import {
  ModelAttributeFactory,
} from '@openreachtech/renchan-sequelize'
import BaseAppRenchanModel from '../baseModel/BaseAppRenchanModel.js'

/**
 * AiAgentRoleCategory model
 *
 * @class AiAgentRoleCategory
 * @extends {BaseAppRenchanModel}
 */
export default class AiAgentRoleCategory extends BaseAppRenchanModel {
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
      AgentRoleCategoryId: {
        type: DataTypes.BIGINT,
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
    this.belongsTo(this._.AgentRoleCategory)
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
    const AiAgentIdField = allAttributes.AiAgentId.field
    const AgentRoleCategoryIdField = allAttributes.AgentRoleCategoryId.field

    this.addSubquery({
      name: '?AgentRoleCategoryId.AiAgentId',
      generator: ({
        agentRoleCategoryIds,
      }) => {
        const attributes = [
          AiAgentIdField,
        ]

        const whereClause = {
          [AgentRoleCategoryIdField]: agentRoleCategoryIds,
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
}

import {
  ModelAttributeFactory,
} from '@openreachtech/renchan-sequelize'
import BaseAppRenchanModel from '../baseModel/BaseAppRenchanModel.js'

/**
 * AiAgentTagAssignment model
 *
 * @class AiAgentTagAssignment
 * @extends {BaseAppRenchanModel}
 */
export default class AiAgentTagAssignment extends BaseAppRenchanModel {
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
      AiAgentTagId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      assignedAt: {
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
    this.belongsTo(this._.AiAgentTag)
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
    const AiAgentTagIdField = allAttributes.AiAgentTagId.field

    this.addSubquery({
      name: '?AiAgentTagId.AiAgentId',
      generator: ({
        AiAgentTagIds,
      }) => {
        const attributes = [
          AiAgentIdField,
        ]

        const whereClause = {
          [AiAgentTagIdField]: AiAgentTagIds,
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

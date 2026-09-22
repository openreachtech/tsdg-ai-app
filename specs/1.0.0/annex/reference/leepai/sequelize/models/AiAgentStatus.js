import {
  ModelAttributeFactory,
} from '@openreachtech/renchan-sequelize'
import BaseAppRenchanModel from '../baseModel/BaseAppRenchanModel.js'

/**
 * AiAgentStatus model
 *
 * @class AiAgentStatus
 * @extends {BaseAppRenchanModel}
 */
export default class AiAgentStatus extends BaseAppRenchanModel {
  /**
   * Define model attributes
   *
   * @param {import('sequelize').DataTypes} DataTypes - Sequelize DataTypes
   * @returns {object} Model attributes
   */
  static createAttributes (DataTypes) {
    const factory = ModelAttributeFactory.create(DataTypes)

    return {
      ...factory.ID_INTEGER,

      name: {
        type: DataTypes.STRING(191),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(191),
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

    this.hasMany(this._.AiAgentLatestStatus)
    this.hasMany(this._.AiAgentStatusPhase)
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

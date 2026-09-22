import BaseRecordFieldValuesAgentAction from './BaseRecordFieldValuesAgentAction.js'

import Timber from '../../../tools/Timber.js'

const MAX_SEARCH_TARGET_COUNT = 8
const MAX_OPTIONS_PER_COLUMN = 50

/**
 * Search step (code, no AI): runs the option search only for the columns the narrowing step
 * chose, in parallel. The target count is capped to protect the connection pool; the overflow
 * is logged (no silent truncation).
 *
 * @class SearchEditOptionsAction
 * @extends {BaseRecordFieldValuesAgentAction}
 */
export default class SearchEditOptionsAction extends BaseRecordFieldValuesAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'searchEditOptions'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Run the edit-form option search for the narrowed columns only, in parallel'
  }

  /**
   * Run the option searches for the narrowed targets.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     targets: Array<{
   *       originObjectColumnId: number
   *       keyword: string
   *     }>
   *   }
   *   context: import('./BaseRecordFieldValuesAgentAction.js').RecordFieldValuesLoopContext
   * }} params
   * @returns {Promise<Record<number, Array<{
   *   displayValue: string
   *   updateTargetValue: string
   * }>>>}
   */
  async run ({
    argumentHash: {
      targets,
    },
    context,
  }) {
    const cappedTargets = targets.slice(0, MAX_SEARCH_TARGET_COUNT)

    if (targets.length > cappedTargets.length) {
      Timber.log('[SearchEditOptionsAction] target count capped', {
        requestedCount: targets.length,
        cappedCount: cappedTargets.length,
      })
    }

    const entries = await Promise.all(
      cappedTargets.map(async target => [
        target.originObjectColumnId,
        await this.searchOptionsForTarget({
          target,
          context,
        }),
      ])
    )

    return Object.fromEntries(entries)
  }

  /**
   * Search the options of one target column (empty on missing suite or failure).
   *
   * @param {{
   *   target: {
   *     originObjectColumnId: number
   *     keyword: string
   *   }
   *   context: import('./BaseRecordFieldValuesAgentAction.js').RecordFieldValuesLoopContext
   * }} params
   * @returns {Promise<Array<{
   *   displayValue: string
   *   updateTargetValue: string
   * }>>}
   */
  async searchOptionsForTarget ({
    target,
    context,
  }) {
    const column = context.editableColumns.find(catalogColumn =>
      catalogColumn.originObjectColumnId === target.originObjectColumnId
    )

    const editSearchQueryId = column?.searchOption?.editSearchQueryId
      ?? null

    if (editSearchQueryId === null) {
      return []
    }

    const suite = context.editSearchQueryRegistry.getSuite({
      queryId: editSearchQueryId,
    })

    if (!suite) {
      return []
    }

    try {
      const options = suite.isNested()
        ? await suite.retrieveNestedOptions({
          keyword: target.keyword,
          searchPayloads: [],
        })
        : await suite.retrieveOptions({
          keyword: target.keyword,
          searchPayloads: [],
        })

      return options.slice(0, MAX_OPTIONS_PER_COLUMN)
    } catch (error) {
      Timber.log('[SearchEditOptionsAction] option search failed', {
        editSearchQueryId,
        errorMessage: error.message,
      })

      return []
    }
  }
}

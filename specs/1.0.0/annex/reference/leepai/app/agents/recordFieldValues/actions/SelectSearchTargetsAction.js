import BaseRecordFieldValuesAgentAction from './BaseRecordFieldValuesAgentAction.js'

import Timber from '../../../tools/Timber.js'

/**
 * Narrowing step (AI decision): one forced `select_search_targets` turn choosing which
 * searchable columns (`hasTextSearch=true`) are relevant to the user request, and with
 * which keyword. Failures resolve to no targets (the loop then fills without searching).
 *
 * @class SelectSearchTargetsAction
 * @extends {BaseRecordFieldValuesAgentAction}
 */
export default class SelectSearchTargetsAction extends BaseRecordFieldValuesAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'selectSearchTargets'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Narrow down which searchable form columns are relevant to the user request, with the search keyword per column'
  }

  /**
   * Tool name for the narrowing turn (matches `ai_tools` payload).
   *
   * @returns {string}
   */
  get toolName () {
    return 'select_search_targets'
  }

  /**
   * Run the narrowing turn.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     message: string
   *     searchableColumns: Array<import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry>
   *   }
   *   context: import('./BaseRecordFieldValuesAgentAction.js').RecordFieldValuesLoopContext
   * }} params
   * @returns {Promise<Array<{
   *   originObjectColumnId: number
   *   keyword: string
   * }>>}
   */
  async run ({
    argumentHash: {
      message,
      searchableColumns,
    },
    context,
  }) {
    const toolPayloadObject = await this.loadToolPayloadObject({
      aiToolId: context.selectSearchTargetsAiToolId,
    })

    if (!toolPayloadObject) {
      Timber.log('[SelectSearchTargetsAction] select_search_targets tool row missing or broken')

      return []
    }

    const instruction = this.buildInstruction({
      message,
      searchableColumns,
    })

    const response = await this.sendForcedToolRequest({
      context,
      instruction,
      toolPayloadObject,
    })

    if (response.hasError()) {
      Timber.log('[SelectSearchTargetsAction] sendRequestToAi error', {
        errorMessage: response.extractErrorMessage(),
      })

      return []
    }

    const functionCall = this.extractFunctionCallFromAiResponse({
      response,
      toolName: this.toolName,
    })

    if (!functionCall) {
      return []
    }

    return this.normalizeTargets({
      functionCall,
      searchableColumns,
    })
  }

  /**
   * Build the narrowing instruction: searchable-column list + user request.
   *
   * @param {{
   *   message: string
   *   searchableColumns: Array<import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry>
   * }} params
   * @returns {string}
   */
  buildInstruction ({
    message,
    searchableColumns,
  }) {
    const columnsJson = JSON.stringify(
      searchableColumns.map(column => ({
        originObjectColumnId: column.originObjectColumnId,
        label: column.label,
      }))
    )

    const lines = [
      'You are narrowing down which searchable form columns are relevant to the user request below.',
      'You must call the tool `select_search_targets` exactly once. Do not reply with assistant-only text.',
      'Rules:',
      '- targets must only contain columns from searchable_columns that the request actually touches.',
      '- keyword must be the concrete search term implied by the request for that column.',
      '- When no searchable column is relevant, call the tool with an empty targets array.',
      '',
      `<searchable_columns><![CDATA[${columnsJson}]]></searchable_columns>`,
      '',
      `<user_request><![CDATA[${message}]]></user_request>`,
    ]

    return lines.join('\n')
  }

  /**
   * Normalize the tool arguments to `[{ originObjectColumnId, keyword }]`, keeping only
   * searchable-catalog columns.
   *
   * @param {{
   *   functionCall: { arguments?: object | string }
   *   searchableColumns: Array<import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry>
   * }} params
   * @returns {Array<{
   *   originObjectColumnId: number
   *   keyword: string
   * }>}
   */
  normalizeTargets ({
    functionCall,
    searchableColumns,
  }) {
    const parsed = this.parseFunctionCallArguments({
      functionCall,
    })

    if (!Array.isArray(parsed?.targets)) {
      return []
    }

    const searchableColumnIds = new Set(
      searchableColumns.map(column => column.originObjectColumnId)
    )

    return parsed.targets
      .map(target => ({
        originObjectColumnId: Number(target?.originObjectColumnId),
        keyword: typeof target?.keyword === 'string'
          ? target.keyword
          : '',
      }))
      .filter(target =>
        Number.isInteger(target.originObjectColumnId)
        && searchableColumnIds.has(target.originObjectColumnId)
      )
  }
}

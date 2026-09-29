import BaseRecordFieldValuesAgentAction from './BaseRecordFieldValuesAgentAction.js'

import FillFormValuesProcessor from '../../../aiTools/Processors/FillFormValuesProcessor.js'
import Timber from '../../../tools/Timber.js'

/**
 * Filling step (AI decision): one forced `fill_form` turn over the editable-column catalog,
 * the record's current values, and the option sets (pre-resolved fixed + searched).
 * The AI returns only `actualValue`(s); the result is validated and display values are
 * resolved by {@link FillFormValuesProcessor}. Failures resolve to `null` (the loop may retry).
 *
 * @class FillFormAction
 * @extends {BaseRecordFieldValuesAgentAction}
 */
export default class FillFormAction extends BaseRecordFieldValuesAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'fillForm'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Propose edit-form field values for the record via one forced fill_form turn, then validate and resolve display values'
  }

  /**
   * Tool name for the filling turn (matches `ai_tools` payload).
   *
   * @returns {string}
   */
  get toolName () {
    return 'fill_form'
  }

  /**
   * Run the filling turn.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     message: string
   *     editableColumns: Array<import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry>
   *     currentValues: string
   *     fixedOptionsByColumnId: Record<number, Array<*>>
   *     searchedOptionsByColumnId: Record<number, Array<*>>
   *   }
   *   context: import('./BaseRecordFieldValuesAgentAction.js').RecordFieldValuesLoopContext
   * }} params
   * @returns {Promise<{
   *   message: string
   *   updateValues: Array<server.graphql.user.RecordFieldUpdateValue>
   * } | null>}
   */
  async run ({
    argumentHash: {
      message,
      editableColumns,
      currentValues,
      fixedOptionsByColumnId,
      searchedOptionsByColumnId,
    },
    context,
  }) {
    const toolPayloadObject = await this.loadToolPayloadObject({
      aiToolId: context.fillFormAiToolId,
    })

    if (!toolPayloadObject) {
      Timber.log('[FillFormAction] fill_form tool row missing or broken')

      return null
    }

    const instruction = this.buildInstruction({
      message,
      editableColumns,
      currentValues,
      fixedOptionsByColumnId,
      searchedOptionsByColumnId,
    })

    const response = await this.sendForcedToolRequest({
      context,
      instruction,
      toolPayloadObject,
    })

    if (response.hasError()) {
      Timber.log('[FillFormAction] sendRequestToAi error', {
        errorMessage: response.extractErrorMessage(),
      })

      return null
    }

    const functionCall = this.extractFunctionCallFromAiResponse({
      response,
      toolName: this.toolName,
    })

    if (!functionCall) {
      Timber.log('[FillFormAction] fill_form call missing from model response')

      return null
    }

    const parsed = this.parseFunctionCallArguments({
      functionCall,
    })

    if (!Array.isArray(parsed?.updateValues)) {
      Timber.log('[FillFormAction] invalid fill_form tool arguments')

      return null
    }

    const updateValues = this.createFillFormValuesProcessor()
      .formatUpdateValues({
        updateValues: parsed.updateValues,
        editableColumns,
        fixedOptionsByColumnId,
        searchedOptionsByColumnId,
      })

    return {
      message: typeof parsed.message === 'string'
        ? parsed.message
        : '',
      updateValues,
    }
  }

  /**
   * Build the filling instruction: catalog (with per-column options), current values,
   * and the user request.
   *
   * @param {{
   *   message: string
   *   editableColumns: Array<import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry>
   *   currentValues: string
   *   fixedOptionsByColumnId: Record<number, Array<*>>
   *   searchedOptionsByColumnId: Record<number, Array<*>>
   * }} params
   * @returns {string}
   */
  buildInstruction ({
    message,
    editableColumns,
    currentValues,
    fixedOptionsByColumnId,
    searchedOptionsByColumnId,
  }) {
    const catalogJson = JSON.stringify(
      editableColumns.map(column =>
        this.buildCatalogEntryForPrompt({
          column,
          fixedOptionsByColumnId,
          searchedOptionsByColumnId,
        })
      )
    )

    const lines = [
      'You are proposing values for the edit form of one CRM record.',
      'The editable_columns JSON below lists every editable column: originObjectColumnId, label, field categories, isSelectMultiple, the current value, and (when present) the allowed options.',
      'You must call the tool `fill_form` exactly once. Do not reply with assistant-only text.',
      'Rules:',
      '- updateValues must only contain columns the user request implies, chosen from editable_columns.',
      '- Single-value columns use actualValue; multi-select columns (isSelectMultiple true) use actualValues.',
      '- For columns that list options, each proposed value must equal exactly one option updateTargetValue.',
      '- For columns with options but no matching option, leave the column out instead of guessing.',
      '- For date or datetime columns, use ISO 8601 strings.',
      '- message must shortly explain the proposed changes for the user.',
      '',
      `<editable_columns><![CDATA[${catalogJson}]]></editable_columns>`,
      '',
      `<record_current_values><![CDATA[${currentValues}]]></record_current_values>`,
      '',
      `<user_request><![CDATA[${message}]]></user_request>`,
    ]

    return lines.join('\n')
  }

  /**
   * Build one prompt catalog entry, embedding the column's known options (fixed + searched).
   *
   * @param {{
   *   column: import('../../../aiTools/Processors/FillFormValuesProcessor.js').EditableColumnCatalogEntry & {
   *     currentValue?: *
   *   }
   *   fixedOptionsByColumnId: Record<number, Array<*>>
   *   searchedOptionsByColumnId: Record<number, Array<*>>
   * }} params
   * @returns {object}
   */
  buildCatalogEntryForPrompt ({
    column,
    fixedOptionsByColumnId,
    searchedOptionsByColumnId,
  }) {
    const fixedOptions = fixedOptionsByColumnId[column.originObjectColumnId]
      ?? []
    const searchedOptions = searchedOptionsByColumnId[column.originObjectColumnId]
      ?? []

    const options = [
      ...fixedOptions,
      ...searchedOptions,
    ]

    return {
      originObjectColumnId: column.originObjectColumnId,
      label: column.label,
      isSelectMultiple: column.isSelectMultiple,
      inputFieldCategory: column.inputFieldCategory,
      inputFieldDataCategory: column.inputFieldDataCategory,
      currentValue: column.currentValue
        ?? null,
      options: options.length > 0
        ? options
        : null,
    }
  }

  /**
   * Factory for {@link FillFormValuesProcessor} (overridable in tests).
   *
   * @returns {FillFormValuesProcessor}
   */
  createFillFormValuesProcessor () {
    return FillFormValuesProcessor.create()
  }
}

import {
  ProceduralAgentLoop,
  AgentActionRegistry,
} from '@openreachtech/mentsu-agent-loop-core'

import SelectSearchTargetsAction from './actions/SelectSearchTargetsAction.js'
import SearchEditOptionsAction from './actions/SearchEditOptionsAction.js'
import FillFormAction from './actions/FillFormAction.js'

/**
 * v1 agent loop of the record edit mode: the procedure (narrow → search → fill) is fixed in
 * code; the judgment inside each step is done by the AI.
 * Narrowing runs only when the catalog has `hasTextSearch=true` columns; otherwise the loop
 * goes straight to `fill_form` (the "single-shot" case is a natural branch of the loop).
 * Search runs only over the narrowed targets (the count follows the AI's choice, capped
 * inside {@link SelectSearchTargetsAction} / {@link SearchEditOptionsAction}).
 *
 * @extends {ProceduralAgentLoop}
 */
export default class RecordFieldValuesAgentLoop extends ProceduralAgentLoop {
  /** @override */
  get maxIterations () {
    return 3 // v1 safeguard. Usually completes in 1 iteration. Useful later for "re-search if ambiguous"
  }

  /** @override */
  get registry () {
    return AgentActionRegistry.create({
      actions: [
        SelectSearchTargetsAction.create(),
        SearchEditOptionsAction.create(),
        FillFormAction.create(),
      ],
    })
  }

  /** @override */
  createInitialState ({
    input,
  }) {
    return {
      searchedOptionsByColumnId: {},
      result: null,
    }
  }

  /** @override */
  async advanceState ({
    state,
  }) {
    const searchableColumns = this.context.editableColumns
      .filter(column => column.searchOption?.hasTextSearch === true)

    const targets = searchableColumns.length === 0
      ? []
      : await this.performAction({
        name: 'selectSearchTargets',
        argumentHash: {
          message: this.context.message,
          searchableColumns, // labels only; options not included (narrowing is an AI decision)
        },
        context: this.context,
      })

    const searchedOptionsByColumnId = targets.length === 0
      ? {}
      : await this.performAction({
        name: 'searchEditOptions',
        argumentHash: {
          targets, // [{ originObjectColumnId, keyword }] (count fully follows the AI's choice)
        },
        context: this.context,
      })

    const filled = await this.performAction({
      name: 'fillForm',
      argumentHash: {
        message: this.context.message,
        editableColumns: this.context.editableColumns,
        currentValues: this.context.currentValues,
        fixedOptionsByColumnId: this.context.fixedOptionsByColumnId,
        searchedOptionsByColumnId,
      },
      context: this.context,
    })

    return {
      ...state,
      searchedOptionsByColumnId,
      result: filled, // { message, updateValues }
    }
  }

  /** @override */
  isComplete ({
    state,
  }) {
    return Boolean(state.result)
  }

  /** @override */
  buildResult ({
    state,
  }) {
    return state.result
  }
}

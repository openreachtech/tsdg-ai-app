import {
  ProceduralAgentLoop,
  AgentActionRegistry,
} from '@openreachtech/mentsu-agent-loop-core'

import PlanSearchAction from './actions/PlanSearchAction.js'
import ExecuteSearchPlanAction from './actions/ExecuteSearchPlanAction.js'
import ComposeAnswerAction from './actions/ComposeAnswerAction.js'

/**
 * v1 agent loop of the Agentic RAG record search: the procedure (plan → execute → compose) is
 * fixed in code; the judgment inside the plan/compose steps is done by the AI, while the search
 * execution is deterministic code over the record-search service.
 * When the AI cannot produce a usable plan, the loop returns an empty result with a deterministic
 * "couldn't understand" message (a natural branch of the loop).
 *
 * @extends {ProceduralAgentLoop}
 */
export default class RecordSearchAgentLoop extends ProceduralAgentLoop {
  /** @override */
  get maxIterations () {
    return 4 // v1 safeguard: plan → execute → compose usually completes in 1 iteration.
  }

  /** @override */
  get registry () {
    return AgentActionRegistry.create({
      actions: [
        PlanSearchAction.create(),
        ExecuteSearchPlanAction.create(),
        ComposeAnswerAction.create(),
      ],
    })
  }

  /** @override */
  createInitialState ({
    input,
  }) {
    return {
      result: null,
    }
  }

  /** @override */
  async advanceState ({
    state,
  }) {
    await this.notifyProgress({
      phase: 'plan_search',
      status: 'started',
    })

    const plan = await this.performAction({
      name: 'planSearch',
      argumentHash: {
        message: this.context.message,
        searchableCategories: this.context.searchableCategories,
      },
      context: this.context,
    })

    if (!plan) {
      return {
        ...state,
        result: {
          message: 'I could not turn that into a record search. Could you rephrase what you are looking for?',
          targetRecords: [],
        },
      }
    }

    await this.notifyProgress({
      phase: 'plan_search',
      status: 'completed',
    })
    await this.notifyProgress({
      phase: 'execute_search',
      status: 'started',
    })

    const executed = await this.performAction({
      name: 'executeSearchPlan',
      argumentHash: {
        plan,
      },
      context: this.context,
    })

    await this.notifyProgress({
      phase: 'execute_search',
      status: 'completed',
      foundCount: executed.targetRecords.length,
    })
    await this.notifyProgress({
      phase: 'compose_answer',
      status: 'started',
    })

    const answer = await this.performAction({
      name: 'composeAnswer',
      argumentHash: {
        message: this.context.message,
        resultSummary: {
          foundCount: executed.targetRecords.length,
          isTruncated: executed.isTruncated,
          resultCategoryName: this.resolveCategoryName({
            originObjectCategoryId: executed.resultOriginObjectCategoryId,
          }),
        },
      },
      context: this.context,
    })

    await this.notifyProgress({
      phase: 'compose_answer',
      status: 'completed',
    })

    return {
      ...state,
      result: {
        message: answer.message,
        targetRecords: executed.targetRecords,
      },
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

  /**
   * Resolve a category display name from the searchable catalog, or `null` when unknown.
   *
   * @param {{
   *   originObjectCategoryId: number | null
   * }} params
   * @returns {string | null}
   */
  resolveCategoryName ({
    originObjectCategoryId,
  }) {
    const matched = this.context.searchableCategories
      .find(category => category.originObjectCategoryId === originObjectCategoryId)
      ?? null

    return matched?.name
      ?? null
  }

  /**
   * Notify one progress event to the optional `notifyProgress` callback of the loop context.
   * The chat flow does not set the callback (no-op); the standalone search worker sets it to
   * publish the event over the progress subscription.
   *
   * @param {{
   *   phase: string
   *   status: string
   *   foundCount?: number | null
   * }} params
   * @returns {Promise<void>}
   */
  async notifyProgress ({
    phase,
    status,
    foundCount = null,
  }) {
    await this.context.notifyProgress?.({
      phase,
      status,
      foundCount,
    })
  }
}

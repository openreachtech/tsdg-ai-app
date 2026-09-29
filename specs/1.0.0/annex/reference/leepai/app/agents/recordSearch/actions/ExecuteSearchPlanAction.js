import BaseRecordSearchAgentAction from './BaseRecordSearchAgentAction.js'

/**
 * Execution step (code, no AI): runs each step of the plan through the record-search service,
 * threading each step's record ids into the next association hop, and returns the ids of the
 * result step. Pure orchestration over `context.recordSearchService`; the AI is not involved.
 *
 * @class ExecuteSearchPlanAction
 * @extends {BaseRecordSearchAgentAction}
 */
export default class ExecuteSearchPlanAction extends BaseRecordSearchAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'executeSearchPlan'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Execute each planned search step (Elasticsearch keyword search / association traversal) and return the result step record ids'
  }

  /**
   * Run every plan step in order and return the result-step records.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     plan: import('./PlanSearchAction.js').RecordSearchPlan
   *   }
   *   context: import('./BaseRecordSearchAgentAction.js').RecordSearchLoopContext
   * }} params
   * @returns {Promise<{
   *   targetRecords: Array<{ originObjectCategoryId: number, recordId: number }>
   *   isTruncated: boolean
   *   resultOriginObjectCategoryId: number | null
   * }>}
   */
  async run ({
    argumentHash: {
      plan,
    },
    context,
  }) {
    const stepResults = await this.executeSteps({
      plan,
      context,
    })

    const resultStep = stepResults[plan.resultStepIndex]
      ?? null

    if (!resultStep) {
      return {
        targetRecords: [],
        isTruncated: false,
        resultOriginObjectCategoryId: null,
      }
    }

    return {
      targetRecords: resultStep.records,
      isTruncated: resultStep.isTruncated,
      resultOriginObjectCategoryId: resultStep.originObjectCategoryId,
    }
  }

  /**
   * Execute the plan steps sequentially, exposing each step's result to later association hops.
   *
   * @param {{
   *   plan: import('./PlanSearchAction.js').RecordSearchPlan
   *   context: import('./BaseRecordSearchAgentAction.js').RecordSearchLoopContext
   * }} params
   * @returns {Promise<Array<StepResult>>}
   */
  async executeSteps ({
    plan,
    context,
  }) {
    return plan.steps.reduce(
      async (accumulatorPromise, step) => {
        const priorResults = await accumulatorPromise

        const stepResult = await this.executeStep({
          step,
          priorResults,
          context,
        })

        return [
          ...priorResults,
          stepResult,
        ]
      },
      Promise.resolve(/** @type {Array<StepResult>} */ ([]))
    )
  }

  /**
   * Execute one step: anchor keyword search, or a 1-hop association off an earlier step.
   *
   * @param {{
   *   step: import('./PlanSearchAction.js').RecordSearchPlanStep
   *   priorResults: Array<StepResult>
   *   context: import('./BaseRecordSearchAgentAction.js').RecordSearchLoopContext
   * }} params
   * @returns {Promise<StepResult>}
   */
  async executeStep ({
    step,
    priorResults,
    context,
  }) {
    if (step.kind === 'anchor') {
      const anchorResult = await context.recordSearchService.searchAnchorRecords({
        originObjectCategoryId: step.originObjectCategoryId,
        keyword: step.keyword,
      })

      return {
        originObjectCategoryId: step.originObjectCategoryId,
        records: anchorResult.records,
        isTruncated: anchorResult.isTruncated,
      }
    }

    const sourceStep = priorResults[step.fromStepIndex]
      ?? null

    if (!sourceStep) {
      return {
        originObjectCategoryId: step.targetOriginObjectCategoryId,
        records: [],
        isTruncated: false,
      }
    }

    const associationResult = await context.recordSearchService.findAssociatedRecords({
      targetOriginObjectCategoryId: step.targetOriginObjectCategoryId,
      sourceRecords: sourceStep.records,
    })

    return {
      originObjectCategoryId: step.targetOriginObjectCategoryId,
      records: associationResult.records,
      isTruncated: associationResult.isTruncated,
    }
  }
}

/**
 * @typedef {{
 *   originObjectCategoryId: number
 *   records: Array<{ originObjectCategoryId: number, recordId: number }>
 *   isTruncated: boolean
 * }} StepResult
 */

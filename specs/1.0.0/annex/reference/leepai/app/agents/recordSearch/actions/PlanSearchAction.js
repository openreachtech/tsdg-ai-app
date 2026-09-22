import BaseRecordSearchAgentAction from './BaseRecordSearchAgentAction.js'

import Timber from '../../../tools/Timber.js'

/**
 * Planning step (AI decision): one forced `plan_record_search` turn that decomposes the user
 * request into an ordered list of search steps (anchor keyword searches + 1-hop association
 * hops) plus the index of the result step. Failures resolve to `null` (the loop then returns
 * an empty result).
 *
 * @class PlanSearchAction
 * @extends {BaseRecordSearchAgentAction}
 */
export default class PlanSearchAction extends BaseRecordSearchAgentAction {
  /**
   * Action name (registry key used by `performAction`).
   *
   * @override
   * @returns {string}
   */
  get name () {
    return 'planSearch'
  }

  /**
   * Human/AI readable description for action selection.
   *
   * @override
   * @returns {string}
   */
  get description () {
    return 'Decompose the user request into an ordered list of record-search steps (anchor keyword searches and 1-hop association hops)'
  }

  /**
   * Tool name for the planning turn (matches `ai_tools` payload).
   *
   * @returns {string}
   */
  get toolName () {
    return 'plan_record_search'
  }

  /**
   * Run the planning turn.
   *
   * @override
   * @param {{
   *   argumentHash: {
   *     message: string
   *     searchableCategories: Array<{ originObjectCategoryId: number, name: string, slug: string }>
   *   }
   *   context: import('./BaseRecordSearchAgentAction.js').RecordSearchLoopContext
   * }} params
   * @returns {Promise<RecordSearchPlan | null>}
   */
  async run ({
    argumentHash: {
      message,
      searchableCategories,
    },
    context,
  }) {
    const toolPayloadObject = await this.loadToolPayloadObject({
      aiToolId: context.planRecordSearchAiToolId,
    })

    if (!toolPayloadObject) {
      Timber.log('[PlanSearchAction] plan_record_search tool row missing or broken')

      return null
    }

    const instruction = this.buildInstruction({
      message,
      searchableCategories,
    })

    const response = await this.sendForcedToolRequest({
      context,
      instruction,
      toolPayloadObject,
    })

    if (response.hasError()) {
      Timber.log('[PlanSearchAction] sendRequestToAi error', {
        errorMessage: response.extractErrorMessage(),
      })

      return null
    }

    const functionCall = this.extractFunctionCallFromAiResponse({
      response,
      toolName: this.toolName,
    })

    if (!functionCall) {
      return null
    }

    return this.normalizePlan({
      functionCall,
      searchableCategories,
    })
  }

  /**
   * Build the planning instruction: searchable-category catalog + user request.
   *
   * @param {{
   *   message: string
   *   searchableCategories: Array<{ originObjectCategoryId: number, name: string, slug: string }>
   * }} params
   * @returns {string}
   */
  buildInstruction ({
    message,
    searchableCategories,
  }) {
    const categoriesJson = JSON.stringify(
      searchableCategories.map(category => ({
        originObjectCategoryId: category.originObjectCategoryId,
        name: category.name,
      }))
    )

    const lines = [
      'You are planning how to find the CRM records the user asks for in the request below.',
      'You must call the tool `plan_record_search` exactly once. Do not reply with assistant-only text.',
      'Rules:',
      '- The first step must be an anchor step (kind "anchor") with a category from searchable_categories and a keyword from the request.',
      '- An association step (kind "association") retrieves records of targetOriginObjectCategoryId that are associated with the records of an earlier step (fromStepIndex).',
      '- Only 1-hop association is supported: fromStepIndex must reference an earlier anchor step.',
      '- originObjectCategoryId / targetOriginObjectCategoryId must be ids from searchable_categories.',
      '- resultStepIndex is the zero-based index of the step whose records answer the request.',
      '',
      `<searchable_categories><![CDATA[${categoriesJson}]]></searchable_categories>`,
      '',
      `<user_request><![CDATA[${message}]]></user_request>`,
    ]

    return lines.join('\n')
  }

  /**
   * Normalize + validate the plan against the searchable catalog. Returns `null` when the plan
   * is structurally invalid (no usable first anchor step, or an out-of-range result index).
   *
   * @param {{
   *   functionCall: { arguments?: object | string }
   *   searchableCategories: Array<{ originObjectCategoryId: number, name: string, slug: string }>
   * }} params
   * @returns {RecordSearchPlan | null}
   */
  normalizePlan ({
    functionCall,
    searchableCategories,
  }) {
    const parsed = this.parseFunctionCallArguments({
      functionCall,
    })

    if (!Array.isArray(parsed?.steps)) {
      return null
    }

    const categoryIds = new Set(
      searchableCategories.map(category => category.originObjectCategoryId)
    )

    const steps = parsed.steps
      .map((step, index) => this.normalizeStep({
        step,
        index,
        categoryIds,
      }))

    const hasInvalidStep = steps.some(step => step === null)

    if (hasInvalidStep || steps.length === 0) {
      return null
    }

    if (steps[0].kind !== 'anchor') {
      return null
    }

    const resultStepIndex = Number(parsed.resultStepIndex)

    if (
      !Number.isInteger(resultStepIndex)
      || resultStepIndex < 0
      || resultStepIndex >= steps.length
    ) {
      return null
    }

    return {
      steps,
      resultStepIndex,
    }
  }

  /**
   * Normalize a single plan step; returns `null` when the step is invalid.
   *
   * @param {{
   *   step: *
   *   index: number
   *   categoryIds: Set<number>
   * }} params
   * @returns {RecordSearchPlanStep | null}
   */
  normalizeStep ({
    step,
    index,
    categoryIds,
  }) {
    const normalizerHash = {
      anchor: () => this.normalizeAnchorStep({
        step,
        categoryIds,
      }),
      association: () => this.normalizeAssociationStep({
        step,
        index,
        categoryIds,
      }),
    }

    const normalizer = normalizerHash[step?.kind]
      ?? null

    return normalizer === null
      ? null
      : normalizer()
  }

  /**
   * Normalize an anchor step; returns `null` when the category is not in the catalog or the
   * keyword is empty.
   *
   * @param {{
   *   step: *
   *   categoryIds: Set<number>
   * }} params
   * @returns {RecordSearchPlanStep | null}
   */
  normalizeAnchorStep ({
    step,
    categoryIds,
  }) {
    const originObjectCategoryId = Number(step.originObjectCategoryId)

    const keyword = typeof step.keyword === 'string'
      ? step.keyword.trim()
      : ''

    if (!categoryIds.has(originObjectCategoryId) || keyword === '') {
      return null
    }

    return {
      kind: 'anchor',
      originObjectCategoryId,
      keyword,
    }
  }

  /**
   * Normalize a 1-hop association step; returns `null` when the target category is not in the
   * catalog or `fromStepIndex` does not reference an earlier step.
   *
   * @param {{
   *   step: *
   *   index: number
   *   categoryIds: Set<number>
   * }} params
   * @returns {RecordSearchPlanStep | null}
   */
  normalizeAssociationStep ({
    step,
    index,
    categoryIds,
  }) {
    const targetOriginObjectCategoryId = Number(step.targetOriginObjectCategoryId)

    const fromStepIndex = Number(step.fromStepIndex)

    if (
      !categoryIds.has(targetOriginObjectCategoryId)
      || !Number.isInteger(fromStepIndex)
      || fromStepIndex < 0
      || fromStepIndex >= index
    ) {
      return null
    }

    return {
      kind: 'association',
      targetOriginObjectCategoryId,
      fromStepIndex,
    }
  }
}

/**
 * @typedef {{
 *   steps: Array<RecordSearchPlanStep>
 *   resultStepIndex: number
 * }} RecordSearchPlan
 */

/**
 * @typedef {{
 *   kind: 'anchor'
 *   originObjectCategoryId: number
 *   keyword: string
 * } | {
 *   kind: 'association'
 *   targetOriginObjectCategoryId: number
 *   fromStepIndex: number
 * }} RecordSearchPlanStep
 */

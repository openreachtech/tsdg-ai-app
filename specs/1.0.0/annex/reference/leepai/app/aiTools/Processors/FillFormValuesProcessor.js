/**
 * Validates and formats the `fill_form` output of the record edit-mode agent loop.
 *
 * Input entries are AI-generated `{ originObjectColumnId, actualValue?, actualValues? }`.
 * Output entries are `{ originObjectColumnId, isSelectMultiple, values: [{ actualValue, displayValue }] }`.
 * Only editable-catalog columns survive (unknown ids are dropped).
 * Single/multi is decided by the catalog's `isSelectMultiple` (reversed arrivals are coerced when possible).
 * Values are loosely type-checked per `FieldDataCategory` (hash lookup, no switch).
 * Option-backed columns must match an option `updateTargetValue`; the matching option's
 * `displayValue` is adopted (AI never generates displayValue). Text columns use
 * `displayValue` = `actualValue`.
 *
 * @class FillFormValuesProcessor
 */
export default class FillFormValuesProcessor {
  /**
   * Factory method.
   *
   * @returns {FillFormValuesProcessor}
   */
  static create () {
    return new this()
  }

  /**
   * AI tool name (matches `ai_tools.payload` in `constants/aiRecordEditToolsConstants.cjs`).
   *
   * @returns {string}
   */
  get aiToolName () {
    return 'fill_form'
  }

  /**
   * Loose type-check functions per `FieldDataCategory` name.
   * Categories without an entry accept any string.
   *
   * @returns {Record<string, (value: string) => boolean>}
   */
  get fieldDataCategoryCheckHash () {
    return {
      STRING: () => true,
      EMAIL: () => true,
      NUMBER: value => this.isNumberLikeValue({ value }),
      FLOAT: value => this.isNumberLikeValue({ value }),
      INTEGER: value => this.isIntegerLikeValue({ value }),
      BOOLEAN: value => this.isBooleanLikeValue({ value }),
      DATE: value => this.isDateLikeValue({ value }),
      TIME: value => this.isTimeLikeValue({ value }),
      DATETIME: value => this.isDatetimeLikeValue({ value }),
    }
  }

  /**
   * Validate and format the AI-generated update values.
   *
   * @param {{
   *   updateValues: Array<*>
   *   editableColumns: Array<EditableColumnCatalogEntry>
   *   fixedOptionsByColumnId?: Record<number, Array<EditOption>>
   *   searchedOptionsByColumnId?: Record<number, Array<EditOption>>
   * }} params
   * @returns {Array<server.graphql.user.RecordFieldUpdateValue>}
   */
  formatUpdateValues ({
    updateValues,
    editableColumns,
    fixedOptionsByColumnId = {},
    searchedOptionsByColumnId = {},
  }) {
    return updateValues
      .map(updateValue =>
        this.formatSingleUpdateValue({
          updateValue,
          editableColumns,
          fixedOptionsByColumnId,
          searchedOptionsByColumnId,
        })
      )
      .filter(formattedValue => Boolean(formattedValue))
  }

  /**
   * Format one entry, or `null` when the entry is invalid (dropped).
   *
   * @param {{
   *   updateValue: *
   *   editableColumns: Array<EditableColumnCatalogEntry>
   *   fixedOptionsByColumnId: Record<number, Array<EditOption>>
   *   searchedOptionsByColumnId: Record<number, Array<EditOption>>
   * }} params
   * @returns {server.graphql.user.RecordFieldUpdateValue | null}
   */
  formatSingleUpdateValue ({
    updateValue,
    editableColumns,
    fixedOptionsByColumnId,
    searchedOptionsByColumnId,
  }) {
    const originObjectColumnId = Number(updateValue?.originObjectColumnId)

    const column = editableColumns.find(catalogColumn =>
      catalogColumn.originObjectColumnId === originObjectColumnId
    )

    if (!column) {
      return null
    }

    const actualValues = this.extractActualValues({
      updateValue,
      isSelectMultiple: column.isSelectMultiple,
    })

    if (actualValues === null) {
      return null
    }

    const isEveryValueTypeValid = actualValues.every(actualValue =>
      this.isValidValueForFieldDataCategory({
        value: actualValue,
        fieldDataCategory: column.inputFieldDataCategory,
      })
    )

    if (!isEveryValueTypeValid) {
      return null
    }

    const values = this.resolveValuePairs({
      actualValues,
      column,
      fixedOptionsByColumnId,
      searchedOptionsByColumnId,
    })

    if (values.length === 0) {
      return null
    }

    return {
      originObjectColumnId,
      isSelectMultiple: column.isSelectMultiple,
      values,
    }
  }

  /**
   * Extract the proposed values as a normalized string array, honoring the catalog's
   * single/multi decision and coercing reversed arrivals when possible.
   * Returns `null` when no usable value arrived.
   *
   * @param {{
   *   updateValue: *
   *   isSelectMultiple: boolean
   * }} params
   * @returns {Array<string> | null}
   */
  extractActualValues ({
    updateValue,
    isSelectMultiple,
  }) {
    const rawValues = isSelectMultiple
      ? this.extractRawValuesForMultiColumn({
        updateValue,
      })
      : this.extractRawValuesForSingleColumn({
        updateValue,
      })

    if (rawValues === null) {
      return null
    }

    return rawValues.map(rawValue => String(rawValue))
  }

  /**
   * Raw values for a multi-select column: `actualValues`, or a single `actualValue` coerced
   * into a one-element array.
   *
   * @param {{
   *   updateValue: *
   * }} params
   * @returns {Array<*> | null}
   */
  extractRawValuesForMultiColumn ({
    updateValue,
  }) {
    if (Array.isArray(updateValue?.actualValues)) {
      return updateValue.actualValues
    }

    if (
      updateValue?.actualValue !== null
      && updateValue?.actualValue !== undefined
    ) {
      return [updateValue.actualValue]
    }

    return null
  }

  /**
   * Raw values for a single-value column: `actualValue`, or a one-element `actualValues`
   * coerced into a single value.
   *
   * @param {{
   *   updateValue: *
   * }} params
   * @returns {Array<*> | null}
   */
  extractRawValuesForSingleColumn ({
    updateValue,
  }) {
    if (
      updateValue?.actualValue !== null
      && updateValue?.actualValue !== undefined
    ) {
      return [updateValue.actualValue]
    }

    if (
      Array.isArray(updateValue?.actualValues)
      && updateValue.actualValues.length === 1
    ) {
      return [updateValue.actualValues[0]]
    }

    return null
  }

  /**
   * Loose type check per `FieldDataCategory` (hash lookup; unknown categories accept any string).
   *
   * @param {{
   *   value: string
   *   fieldDataCategory: string | null
   * }} params
   * @returns {boolean}
   */
  isValidValueForFieldDataCategory ({
    value,
    fieldDataCategory,
  }) {
    const checkFunction = this.fieldDataCategoryCheckHash[fieldDataCategory]
      ?? (() => true)

    return checkFunction(value)
  }

  /**
   * @param {{
   *   value: string
   * }} params
   * @returns {boolean}
   */
  isNumberLikeValue ({
    value,
  }) {
    return value.trim().length > 0
      && !Number.isNaN(Number(value))
  }

  /**
   * @param {{
   *   value: string
   * }} params
   * @returns {boolean}
   */
  isIntegerLikeValue ({
    value,
  }) {
    return value.trim().length > 0
      && Number.isInteger(Number(value))
  }

  /**
   * @param {{
   *   value: string
   * }} params
   * @returns {boolean}
   */
  isBooleanLikeValue ({
    value,
  }) {
    return value === 'true'
      || value === 'false'
  }

  /**
   * @param {{
   *   value: string
   * }} params
   * @returns {boolean}
   */
  isDateLikeValue ({
    value,
  }) {
    return /^\d{4}-\d{2}-\d{2}$/u.test(value)
      && !Number.isNaN(Date.parse(value))
  }

  /**
   * @param {{
   *   value: string
   * }} params
   * @returns {boolean}
   */
  isTimeLikeValue ({
    value,
  }) {
    return /^\d{2}:\d{2}(?::\d{2})?$/u.test(value)
  }

  /**
   * @param {{
   *   value: string
   * }} params
   * @returns {boolean}
   */
  isDatetimeLikeValue ({
    value,
  }) {
    return !Number.isNaN(Date.parse(value))
  }

  /**
   * Pair each actual value with its display value. Option-backed columns must match an
   * option's `updateTargetValue` (unmatched values are dropped; prevents hallucinated ids);
   * columns without a search option use `displayValue` = `actualValue`.
   *
   * @param {{
   *   actualValues: Array<string>
   *   column: EditableColumnCatalogEntry
   *   fixedOptionsByColumnId: Record<number, Array<EditOption>>
   *   searchedOptionsByColumnId: Record<number, Array<EditOption>>
   * }} params
   * @returns {Array<server.graphql.user.RecordFieldValue>}
   */
  resolveValuePairs ({
    actualValues,
    column,
    fixedOptionsByColumnId,
    searchedOptionsByColumnId,
  }) {
    if (!column.searchOption) {
      return actualValues.map(actualValue => ({
        actualValue,
        displayValue: actualValue,
      }))
    }

    const fixedOptions = fixedOptionsByColumnId[column.originObjectColumnId]
      ?? []
    const searchedOptions = searchedOptionsByColumnId[column.originObjectColumnId]
      ?? []

    const columnOptions = [
      ...fixedOptions,
      ...searchedOptions,
    ]

    return actualValues
      .map(actualValue =>
        this.resolveOptionValuePair({
          actualValue,
          columnOptions,
        })
      )
      .filter(valuePair => Boolean(valuePair))
  }

  /**
   * Match one actual value against the option set, adopting the matching option's displayValue.
   * Returns `null` when no option matches (the value is dropped).
   *
   * @param {{
   *   actualValue: string
   *   columnOptions: Array<EditOption>
   * }} params
   * @returns {server.graphql.user.RecordFieldValue | null}
   */
  resolveOptionValuePair ({
    actualValue,
    columnOptions,
  }) {
    const matchedOption = columnOptions.find(option =>
      String(option.updateTargetValue) === actualValue
    )

    if (!matchedOption) {
      return null
    }

    return {
      actualValue,
      displayValue: matchedOption.displayValue,
    }
  }
}

/**
 * One editable column of the catalog (assembled by RecordEditContextLoader).
 *
 * @typedef {{
 *   originObjectColumnId: number
 *   label: string
 *   isSelectMultiple: boolean
 *   inputFieldDataCategory: string | null
 *   searchOption: {
 *     editSearchQueryId: number
 *     hasTextSearch: boolean
 *   } | null
 * }} EditableColumnCatalogEntry
 */

/**
 * @typedef {{
 *   displayValue: string
 *   updateTargetValue: string
 * }} EditOption
 */

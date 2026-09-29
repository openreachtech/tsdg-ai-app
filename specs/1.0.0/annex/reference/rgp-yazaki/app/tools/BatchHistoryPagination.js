import BATCH_HISTORY_PAGINATION_CONSTANT_HASH from '../constants/batchHistoryPagination.js'

const {
  BATCH_HISTORY_PAGINATION,
} = BATCH_HISTORY_PAGINATION_CONSTANT_HASH

/**
 * How `API-Q001` reads the pagination it was given.
 *
 * The contract makes `pagination` nullable and gives the operation a meaningful default order
 * (`30-api-contract.md` §2.2), so absence is ordinary here rather than a fault: a client that
 * sends nothing gets the newest uploads.
 *
 * **A value this operation cannot honor is answered the same way** - a limit of zero, a negative
 * offset, a sort naming a column that is not one. The error catalog assigns `API-Q001` no
 * invalid-input code (§4.3), and falling back to the documented default is the one behavior that
 * needs no error the contract does not have. The alternative is a new `ERR-1xx` row, which is a
 * change to the contract rather than a decision this class may take on its own.
 */
export default class BatchHistoryPagination {
  /**
   * Constructor.
   *
   * @param {{
   *   pagination: graphql.operator.PaginationInput | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    pagination,
  }) {
    this.pagination = pagination
  }

  /**
   * Factory method.
   *
   * @param {{
   *   pagination: graphql.operator.PaginationInput | null
   * }} params - Parameters of this method.
   * @returns {BatchHistoryPagination} - Instance of this class.
   */
  static create ({
    pagination,
  }) {
    return new this({
      pagination,
    })
  }

  /**
   * Generate how many uploads one page holds.
   *
   * A limit below one is not a page size, so it is answered with the default rather than with an
   * empty page the client did not mean to ask for.
   *
   * @param {{
   *   defaultLimit?: number
   *   maxLimit?: number
   * }} [params] - Parameters of this method.
   * @returns {number} - Limit of the query.
   */
  generateLimit ({
    defaultLimit = BATCH_HISTORY_PAGINATION.DEFAULT_LIMIT,
    maxLimit = BATCH_HISTORY_PAGINATION.MAX_LIMIT,
  } = {}) {
    const requestedLimit = this.pagination?.limit ?? defaultLimit

    if (requestedLimit < 1) {
      return defaultLimit
    }

    return Math.min(requestedLimit, maxLimit)
  }

  /**
   * Generate where in the history the page starts.
   *
   * @param {{
   *   defaultOffset?: number
   * }} [params] - Parameters of this method.
   * @returns {number} - Offset of the query.
   */
  generateOffset ({
    defaultOffset = BATCH_HISTORY_PAGINATION.DEFAULT_OFFSET,
  } = {}) {
    const requestedOffset = this.pagination?.offset ?? defaultOffset

    // The default is also the floor, so an offset below it lands on the first row.
    return Math.max(requestedOffset, defaultOffset)
  }

  /**
   * Generate the order the uploads are read in.
   *
   * A sort is honored whole or not at all: a known column with an unknown direction falls back
   * with the rest of it, rather than being half obeyed in an order nobody asked for.
   *
   * @param {{
   *   tiebreakerAttribute?: string
   * }} [params] - Parameters of this method.
   * @returns {Array<[string, string]>} - Order of the query.
   */
  generateOrder ({
    tiebreakerAttribute = BATCH_HISTORY_PAGINATION.TIEBREAKER_ATTRIBUTE,
  } = {}) {
    const targetAttribute = this.generateTargetAttribute()
    const orderBy = this.generateOrderBy()

    if (!targetAttribute || !orderBy) {
      return this.generateDefaultOrder()
    }

    return [
      [targetAttribute, orderBy],
      [tiebreakerAttribute, orderBy],
    ]
  }

  /**
   * Generate the model attribute the requested column names.
   *
   * @param {{
   *   sortableAttributeHash?: Record<string, string>
   * }} [params] - Parameters of this method.
   * @returns {string | null} - Model attribute, or null when this operation cannot order by it.
   */
  generateTargetAttribute ({
    sortableAttributeHash = BATCH_HISTORY_PAGINATION.SORTABLE_ATTRIBUTE_HASH,
  } = {}) {
    const targetColumn = this.pagination?.sort?.targetColumn

    return sortableAttributeHash[targetColumn] ?? null
  }

  /**
   * Generate the direction the requested sort names.
   *
   * @param {{
   *   orderByHash?: Record<string, string>
   * }} [params] - Parameters of this method.
   * @returns {string | null} - Direction, or null when it is neither of the two the contract has.
   */
  generateOrderBy ({
    orderByHash = BATCH_HISTORY_PAGINATION.ORDER_BY_HASH,
  } = {}) {
    const orderBy = this.pagination?.sort?.orderBy

    return orderByHash[orderBy] ?? null
  }

  /**
   * Generate the order of a client that asked for none.
   *
   * Newest first, which is what the list is for: the first question of a session is where the
   * month got to (`50-frontend.md` §6.2).
   *
   * @param {{
   *   defaultSort?: {
   *     TARGET_ATTRIBUTE: string
   *     ORDER_BY: string
   *   }
   *   tiebreakerAttribute?: string
   * }} [params] - Parameters of this method.
   * @returns {Array<[string, string]>} - Order of the query.
   */
  generateDefaultOrder ({
    defaultSort = BATCH_HISTORY_PAGINATION.DEFAULT_SORT,
    tiebreakerAttribute = BATCH_HISTORY_PAGINATION.TIEBREAKER_ATTRIBUTE,
  } = {}) {
    return [
      [defaultSort.TARGET_ATTRIBUTE, defaultSort.ORDER_BY],
      [tiebreakerAttribute, defaultSort.ORDER_BY],
    ]
  }
}

import DOCUMENT_URL_CONSTANT_HASH from '../constants/documentUrl.js'

const {
  DOCUMENT_URL,
} = DOCUMENT_URL_CONSTANT_HASH

const EVIDENCE_DOCUMENT_ROUTE_PATH = '/files/debit-notes'

/**
 * The URL `API-Q003` hands the operator for one debit note's PDF (`SEC-008`).
 *
 * **The token travels in the query string, not in a header** (30-api-contract.md §2.4). Only one of
 * the two document URLs this system issues is fetched by script: the report is navigated to, so the
 * browser's own save dialog can take it, and a navigation cannot carry a request header. One
 * mechanism that serves both beats two mechanisms for two URLs that appear on the same screen.
 *
 * **The URL is as short-lived as the session that produced it.** It carries the operator's own
 * access token rather than a second credential, so it expires when the token does and no row, key
 * or environment variable exists for it to disagree with. The threat `SEC-008` names - a URL that
 * outlives its session becoming a way to read client financial documents without signing in - is
 * closed by that alone.
 */
export default class EvidenceDocumentUrl {
  /**
   * Constructor.
   *
   * @param {{
   *   batchFileId: number
   *   accessToken: string
   *   requestOrigin: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    batchFileId,
    accessToken,
    requestOrigin,
  }) {
    this.batchFileId = batchFileId
    this.accessToken = accessToken
    this.requestOrigin = requestOrigin
  }

  /**
   * Factory method.
   *
   * @param {{
   *   batchFileId: number
   *   accessToken: string
   *   requestOrigin: string
   * }} params - Parameters of this method.
   * @returns {EvidenceDocumentUrl} - Instance of this class.
   */
  static create ({
    batchFileId,
    accessToken,
    requestOrigin,
  }) {
    return new this({
      batchFileId,
      accessToken,
      requestOrigin,
    })
  }

  /**
   * get: The path the route answers on.
   *
   * Declared here rather than in the route, so the side that builds the URL and the side that
   * serves it cannot drift apart in a way no test would notice.
   *
   * @returns {string} - Path, without a query string.
   */
  static get routePath () {
    return EVIDENCE_DOCUMENT_ROUTE_PATH
  }

  /**
   * get: The query key the access token is carried under.
   *
   * @returns {string} - Query key.
   */
  static get tokenQueryKey () {
    return DOCUMENT_URL.TOKEN_QUERY_KEY
  }

  /**
   * Generate the absolute URL.
   *
   * **Absolute, and derived from the request rather than from configuration.** No `ENV-` id names a
   * public base URL and inventing one is forbidden (spec.md §2.2), while a value taken from the
   * request's own `Host` is by definition the origin the browser used to reach this process.
   *
   * @returns {string} - The URL, with the id and the token encoded into its query string.
   */
  generateUrl () {
    const url = new URL(
      `${EVIDENCE_DOCUMENT_ROUTE_PATH}/${this.batchFileId}`,
      this.requestOrigin
    )

    url.searchParams.set(
      DOCUMENT_URL.TOKEN_QUERY_KEY,
      this.accessToken
    )

    return url.toString()
  }
}

import {
  env,
} from '../globals/_.js'

import EnvironmentLimit from './EnvironmentLimit.js'

import AccessToken from '../../sequelize/models/AccessToken.js'

import OperatorGraphqlContext from '../../server/graphql/contexts/OperatorGraphqlContext.js'

const MILLISECONDS_PER_MINUTE = 60 * 1000
const DEFAULT_REPORT_URL_TTL_MINUTES = 15

/**
 * The two terms every document URL is issued on: where it points, and when it stops working.
 *
 * **`API-Q003` and `API-Q004` answer them identically** (`SEC-008`, 30-api-contract.md §2.4), so
 * they are decided once rather than in each resolver. The pair is what makes a URL short-lived and
 * reachable, and a second copy of either is a way for one of the two operations to quietly answer
 * something else.
 *
 * **The report issues its own token; the evidence document still carries the session's.** A URL
 * lives 15 minutes (`ENV-012`), and the only way to enforce that on a URL is for it to carry a
 * credential that expires - the session's token lives for hours (`ENV-011`), so reporting a
 * fifteen-minute expiry beside it would be an expiry the route does not keep. `T-3.29` moves the
 * evidence URL onto the same terms, and it is left where it is until then for one reason: the report
 * is navigated to once, while a PDF is fetched again and again as the operator reads it, so a
 * credential that expires mid-session is a decision about that screen rather than a refactor.
 */
export default class DocumentUrlTerms {
  /**
   * Constructor.
   *
   * @param {{
   *   context: DocumentUrlIssuingContext
   * }} params - Parameters of this constructor.
   */
  constructor ({
    context,
  }) {
    this.context = context
  }

  /**
   * Factory method.
   *
   * @param {{
   *   context: DocumentUrlIssuingContext
   * }} params - Parameters of this method.
   * @returns {DocumentUrlTerms} - Instance of this class.
   */
  static create ({
    context,
  }) {
    return new this({
      context,
    })
  }

  /**
   * Generate the origin the request arrived on.
   *
   * **`context.expressRequest` is not the Express request.** It is the `graphql-http` wrapper around
   * it, which carries `headers` but none of Express's accessors - the Express request sits on its
   * `raw`, which is how renchan itself reaches it
   * (`GraphqlHttpHandlerBuilder#generateResolveHandler()`). Reading `protocol` and `get('host')` off
   * the wrapper throws, and no unit test sees it: a case that builds its own request object builds
   * whichever of the two shapes the author had in mind.
   *
   * **Derived from the request rather than from configuration.** No `ENV-` id names a public base
   * URL and inventing one is forbidden (spec.md §2.2), while a value taken from the request's own
   * `Host` is by definition the origin the browser used to reach this process.
   *
   * @returns {string} - Scheme and host.
   */
  generateRequestOrigin () {
    const rawRequest = /** @type {ExpressType.Request} */ (
      this.context.expressRequest['raw']
      ?? this.context.expressRequest
    )

    return `${rawRequest.protocol}://${rawRequest.get('host')}`
  }

  /**
   * Find when a URL carrying the session's own token stops working.
   *
   * It is the expiry of the operator's own access token, because such a URL carries that token and
   * nothing else - so it dies with the session that produced it.
   *
   * **This is not what `SEC-008` asks for**, and only `API-Q003` still issues on it. A session lives
   * hours, so a URL on these terms is a bearer link to a client document for hours. `#issueDownloadToken()`
   * is the answer; `T-3.29` moves the evidence URL onto it.
   *
   * **A missing row answers "already expired", which is the truth.** The authentication filter has
   * accepted this request, so the row is there; if it somehow is not, then the token the URL would
   * carry is one the route refuses, and saying it expires now says exactly that.
   *
   * @param {{
   *   GraphqlContextCtor?: typeof OperatorGraphqlContext
   * }} [params] - Parameters of this method.
   * @returns {Promise<Date>} - When the URL stops working.
   */
  async findExpiresAt ({
    GraphqlContextCtor = OperatorGraphqlContext,
  } = {}) {
    const unexpiredAccessToken = await GraphqlContextCtor.findUnexpiredAccessToken({
      accessToken: this.context.accessToken,
      requestedAt: this.context.now,
    })

    return unexpiredAccessToken?.expiresAt
      ?? this.context.now
  }

  /**
   * Issue the credential one document URL carries, and nothing more.
   *
   * **A second token rather than the operator's own** (`SEC-008` `ENV-012`, 30-api-contract.md §2.4).
   * The token in a document URL reaches a browser's history and would reach an access log, and the
   * session's token is good for as long as the operator stays signed in - so a URL carrying it is a
   * bearer link to a client financial document for that whole time. This one is good for fifteen
   * minutes, and the route refuses it after that by the same comparison it refuses any other token
   * with (`TBL-02`), which is what makes "a URL past `expiresAt` is refused" a fact rather than a
   * number in a response.
   *
   * **It is an `access_tokens` row, and that is a narrowing rather than a widening.** Within its
   * fifteen minutes it would also be accepted at `/graphql`, exactly as the token it replaces is -
   * what changes is that it stops being accepted anywhere after fifteen minutes instead of after
   * `ENV-011` hours. Telling the two kinds apart needs a column or a table of its own, and both need
   * an id this repository may not invent, so the narrowing ships and the separation is recorded.
   *
   * @param {{
   *   AccessTokenCtor?: typeof AccessToken
   * }} [params] - Parameters of this method.
   * @returns {Promise<import('../../sequelize/models/AccessToken.js').AccessTokenEntity>} - The row.
   */
  async issueDownloadToken ({
    AccessTokenCtor = AccessToken,
  } = {}) {
    const downloadToken = AccessTokenCtor.buildWithGeneratedAttributes({
      userId: this.context.userId,
      issuedAt: this.context.now,
      expiresAt: this.generateDownloadTokenExpiresAt(),
    })

    await downloadToken.save()

    return /** @type {*} */ (downloadToken)
  }

  /**
   * Generate when the credential of a document URL stops being accepted.
   *
   * **Minutes, and its own `ENV-` id.** `ENV-012` is not `AUTH_ACCESS_TOKEN_TTL_HOURS`: that says how
   * long a person stays signed in, and a document URL that lived that long would be the bearer link
   * this expiry exists to shorten (`90-operations.md` §2.2). Lowering it below the time a large
   * report takes to download breaks the download.
   *
   * @param {{
   *   lifetimeMinutes?: number
   * }} [params] - Parameters of this method.
   * @returns {Date} - Expiry.
   */
  generateDownloadTokenExpiresAt ({
    lifetimeMinutes = EnvironmentLimit.create({
      limitLike: env.REPORT_URL_TTL_MINUTES,
      fallbackLimit: DEFAULT_REPORT_URL_TTL_MINUTES,
    })
      .generateLimit(),
  } = {}) {
    return new Date(
      this.context.now.getTime() + (lifetimeMinutes * MILLISECONDS_PER_MINUTE)
    )
  }
}

/**
 * @typedef {{
 *   now: Date
 *   userId: number
 *   accessToken: string
 *   expressRequest: ExpressType.Request
 * }} DocumentUrlIssuingContext
 */

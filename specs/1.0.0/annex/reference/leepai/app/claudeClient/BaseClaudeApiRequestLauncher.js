import {
  require,
  env,
} from '../globals/_.js'

import ClaudeApiClient from './ClaudeApiClient.js'
import HttpRequestClient from '../tools/HttpRequestClient.js'

const {
  BaseRequestLauncher,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Base request launcher for Claude API.
 *
 * @extends {BaseRequestLauncher}
 */
export default class BaseClaudeApiRequestLauncher extends BaseRequestLauncher {
  /**
   * Create client
   *
   * @override
   * @param {{
   *   environment?: object
   * }} params
   * @returns {ClaudeApiClient}
   */
  static createClient ({
    environment = env,
  } = {}) {
    return this.createClaudeApiClient({
      environment,
    })
  }

  /**
   * Create Claude API client
   *
   * @param {{
   *   environment?: object
   * }} params
   * @returns {ClaudeApiClient}
   */
  static createClaudeApiClient ({
    environment = env,
  } = {}) {
    return ClaudeApiClient.create(
      this.createClaudeApiClientOptions({
        environment,
      })
    )
  }

  /**
   * Create Claude API client options
   *
   * @param {{
   *   environment?: object
   * }} params
   * @returns {{
   *   token: string
   *   httpRequestClient: HttpRequestClient
   * }}
   */
  static createClaudeApiClientOptions ({
    environment = env,
  } = {}) {
    return {
      token: environment.CLAUDE_API_TOKEN,
      httpRequestClient: this.createHttpRequestClient({
        environment,
      }),
    }
  }

  /**
   * Create HTTP request client
   *
   * @param {{
   *   environment?: object
   * }} params
   * @returns {HttpRequestClient}
   */
  static createHttpRequestClient ({
    environment = env,
  } = {}) {
    return HttpRequestClient.create({
      config: {
        host: environment.CLAUDE_API_BASE_URL,
      },
    })
  }
}

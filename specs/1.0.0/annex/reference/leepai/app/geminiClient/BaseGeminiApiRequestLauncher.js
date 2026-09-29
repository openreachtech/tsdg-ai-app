import {
  GoogleGenAI,
} from '@google/genai'

import {
  require,
  env,
} from '../globals/_.js'

import GeminiApiClient from './GeminiApiClient.js'

const {
  BaseRequestLauncher,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Base request launcher for Gemini API.
 *
 * @extends {BaseRequestLauncher}
 */
export default class BaseGeminiApiRequestLauncher extends BaseRequestLauncher {
  /**
   * Create client
   *
   * @override
   * @param {{
   *   environment?: object
   * }} params
   * @returns {GeminiApiClient}
   */
  static createClient ({
    environment = env,
  } = {}) {
    return GeminiApiClient.create(
      this.createGeminiApiClientOptions({
        environment,
      })
    )
  }

  /**
   * Create Gemini API client options
   *
   * @param {{
   *   environment?: object
   * }} params
   * @returns {{
   *   geminiClient: import('@google/genai').GoogleGenAI
   * }}
   */
  static createGeminiApiClientOptions ({
    environment = env,
  } = {}) {
    return {
      geminiClient: new GoogleGenAI({
        apiKey: environment.GEMINI_API_KEY,
      }),
    }
  }
}

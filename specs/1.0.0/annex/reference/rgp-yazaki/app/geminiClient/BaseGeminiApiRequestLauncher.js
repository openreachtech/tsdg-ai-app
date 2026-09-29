import {
  GoogleGenAI,
} from '@google/genai'

import {
  env,
  require,
} from '../globals/_.js'

import GeminiApiClient from './GeminiApiClient.js'

/*
 * Loaded through the custom `require` rather than as a named import. The package is CommonJS and
 * its index assigns one object literal of `require()` calls, of which Node's interop detects only
 * the first as a named export - so `import { BaseRequestLauncher }` resolves to undefined while
 * `BaseCapsule` happens to work. Going through `require` for every one of them removes the
 * question of which side of that line a given base falls on.
 */
const {
  BaseRequestLauncher,
} = require('@openreachtech/renchan-tools-external-api')

/**
 * Base of every request this system makes to Gemini (`AI-01`).
 *
 * **The API key is read here and nowhere else** (`SEC-003` `ENV-031`). One place to look when
 * asking what authenticates an outbound call, and one place to change when the key rotates.
 *
 * A subclass supplies two things: the capsule it answers with, and which call of the client it
 * makes. Everything else - validating the payload, catching a failed request, wrapping either
 * outcome in a capsule - belongs to the framework base.
 *
 * @abstract
 */
export default class BaseGeminiApiRequestLauncher extends BaseRequestLauncher {
  /**
   * Create the client this launcher requests through.
   *
   * @override
   * @param {{
   *   environment?: Record<string, string>
   * }} [params] - Parameters of this method.
   * @returns {GeminiApiClient} - The client.
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
   * Create what the client is constructed from.
   *
   * Separate from `createClient()` so a test can substitute the SDK instance without standing up
   * an environment, which is the only way to exercise this layer without a key.
   *
   * @param {{
   *   environment: Record<string, string>
   * }} params - Parameters of this method.
   * @returns {{
   *   geminiClient: import('@google/genai').GoogleGenAI
   * }} - Options of the client.
   */
  static createGeminiApiClientOptions ({
    environment,
  }) {
    return {
      geminiClient: new GoogleGenAI({
        apiKey: environment.GEMINI_API_KEY,
      }),
    }
  }
}

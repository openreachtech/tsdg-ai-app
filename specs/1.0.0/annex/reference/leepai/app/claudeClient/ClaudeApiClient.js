import Anthropic from '@anthropic-ai/sdk'

/**
 * Claude API client.
 *
 * Non-streaming + file upload go through the shared HttpRequestClient;
 * streaming uses the official Anthropic SDK.
 */
export default class ClaudeApiClient {
  /**
   * Constructor
   *
   * @param {{
   *   token: string
   *   httpRequestClient: import('../tools/HttpRequestClient.js').default
   * }} params
   */
  constructor ({
    token,
    httpRequestClient,
  }) {
    this.token = token
    this.httpRequestClient = httpRequestClient
  }

  /**
   * Create ClaudeApiClient instance
   *
   * @param {{
   *   token: string
   *   httpRequestClient: import('../tools/HttpRequestClient.js').default
   * }} params
   * @returns {ClaudeApiClient}
   */
  static create (params) {
    return new this(params)
  }

  /**
   * Send message to Claude
   *
   * @param {{
   *   max_tokens: number
   *   temperature: number
   *   system: string
   *   model: string
   *   tools: Array<object>
   *   messages: Array<object>
   *   tool_choice?: object
   * }} params
   * @returns {Promise<import('../tools/HttpRequestClient.js').HttpResponse>}
   */
  async sendMessageToClaude ({
    max_tokens,
    temperature,
    system,
    model,
    tools,
    messages,
    tool_choice,
  }) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.token,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    }

    return this.httpRequestClient.post({
      path: '/messages',
      body: {
        max_tokens,
        temperature,
        system,
        model,
        tools,
        messages,
        tool_choice,
      },
      options: {
        headers,
      },
    })
  }

  /**
   * Upload file to Claude Files API
   *
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   fileType: string
   * }} params
   * @returns {Promise<import('../tools/HttpRequestClient.js').HttpResponse>}
   */
  async uploadFileToClaude ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    const headers = {
      'x-api-key': this.token,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    }

    const fileBlob = new Blob(
      [fileBuffer],
      {
        type: fileType,
      }
    )
    const body = new FormData()

    body.append('file', fileBlob, fileName)

    return this.httpRequestClient.post({
      path: '/files',
      body,
      options: {
        headers,
      },
    })
  }

  /**
   * Stream message from Claude via the Anthropic SDK.
   *
   * @param {{
   *   max_tokens: number
   *   temperature: number
   *   system: string
   *   model: string
   *   tools: Array<object>
   *   tool_choice?: object
   *   messages: Array<object>
   * }} params
   * @returns {*}
   */
  streamMessageFromClaude ({
    max_tokens,
    temperature,
    system,
    model,
    tools,
    tool_choice,
    messages,
  }) {
    const client = this.createAnthropicSDKClient()

    return client.beta.messages.stream({
      max_tokens,
      temperature,
      system,
      model,
      tools,
      tool_choice,
      messages,
      betas: [
        'files-api-2025-04-14',
      ],
    })
  }

  /**
   * Create Anthropic SDK client
   *
   * @param {{
   *   token?: string
   * }} params
   * @returns {Anthropic}
   */
  createAnthropicSDKClient ({
    token = this.token,
  } = {}) {
    return new Anthropic({
      apiKey: token,
    })
  }
}

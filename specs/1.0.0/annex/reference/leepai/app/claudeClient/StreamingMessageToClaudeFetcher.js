import BaseClaudeApiRequestLauncher from './BaseClaudeApiRequestLauncher.js'
import StreamingMessageToClaudeCapsule from './StreamingMessageToClaudeCapsule.js'

/**
 * Fetcher for streaming a message from Claude.
 *
 * @extends {BaseClaudeApiRequestLauncher}
 */
export default class StreamingMessageToClaudeFetcher extends BaseClaudeApiRequestLauncher {
  /**
   * Get CapsuleClass
   *
   * @returns {typeof StreamingMessageToClaudeCapsule}
   */
  get CapsuleClass () {
    return StreamingMessageToClaudeCapsule
  }

  /**
   * Launch stream request
   *
   * @param {object} actualParams
   * @param {{
   *   onText: (text: string) => void
   *   onFunctionCall: (functionCalls: Array<object>) => void
   *   onComplete: (message: string) => void
   *   onError?: (error: object) => void
   * }} callbacks
   * @returns {Promise<void>}
   */
  async launchStreamRequest (
    actualParams,
    {
      onText,
      onFunctionCall,
      onComplete,
      onError,
    }
  ) {
    const stream = await this.client.streamMessageFromClaude({
      ...actualParams,
    })

    const chunks = []
    const functionCalls = []

    stream.on('text', text => {
      chunks.push(text)

      onText(text)
    })

    stream.on('contentBlock', contentBlock => {
      if (contentBlock.type === 'tool_use') {
        functionCalls.push(contentBlock)
      }
    })

    stream.on('message', async () => {
      if (functionCalls.length > 0) {
        await onFunctionCall(functionCalls)
      }

      onComplete(chunks.join(''))
    })

    stream.on('error', error => {
      if (onError) {
        onError(this.formatClaudeError(error))
      }
    })
  }

  /**
   * Format Claude error to normalized structure
   *
   * @param {{
   *   error: {
   *     error: {
   *       type?: string | null
   *       message?: string | null
   *     }
   *     request_id?: string | null
   *   }
   * }} params
   * @returns {{
   *   type: string | null
   *   message: string | null
   *   requestId: string | null
   * }}
   */
  formatClaudeError ({
    error,
  }) {
    return {
      type: error.error?.type ?? null,
      message: error.error?.message ?? null,
      requestId: error.request_id ?? null,
    }
  }
}

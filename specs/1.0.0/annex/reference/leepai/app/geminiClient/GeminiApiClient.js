/**
 * Gemini API client (wraps the official @google/genai SDK).
 */
export default class GeminiApiClient {
  /**
   * Constructor
   *
   * @param {{
   *   geminiClient: import('@google/genai').GoogleGenAI
   * }} params
   */
  constructor ({
    geminiClient,
  }) {
    this.geminiClient = geminiClient
  }

  /**
   * Factory method to create a GeminiApiClient instance
   *
   * @param {{
   *   geminiClient: import('@google/genai').GoogleGenAI
   * }} params
   * @returns {GeminiApiClient}
   */
  static create (params) {
    return new this(params)
  }

  /**
   * Send message to Gemini
   *
   * @param {{
   *   maxOutputTokens: number
   *   temperature: number
   *   systemInstruction: string
   *   model: string
   *   contents: Array<*>
   *   tools: Array<*>
   *   toolConfig?: import('@google/genai').ToolConfig
   * }} params
   * @returns {Promise<import('@google/genai').GenerateContentResponse>}
   */
  async sendMessageToGemini ({
    maxOutputTokens,
    temperature,
    systemInstruction,
    model,
    contents,
    tools,
    toolConfig,
  }) {
    return this.geminiClient.models.generateContent({
      model,
      contents,
      config: {
        temperature,
        systemInstruction,
        maxOutputTokens,
        tools,
        toolConfig,
      },
    })
  }

  /**
   * Stream message from Gemini
   *
   * @param {{
   *   maxOutputTokens: number
   *   temperature: number
   *   systemInstruction: string
   *   model: string
   *   contents: Array<*>
   *   tools: Array<*>
   *   toolConfig?: import('@google/genai').ToolConfig
   * }} params
   * @returns {Promise<AsyncGenerator<*, void, void>>}
   */
  async streamMessageFromGemini ({
    maxOutputTokens,
    temperature,
    systemInstruction,
    model,
    contents,
    tools,
    toolConfig,
  }) {
    return this.geminiClient.models.generateContentStream({
      model,
      contents,
      config: {
        temperature,
        systemInstruction,
        maxOutputTokens,
        tools,
        toolConfig,
      },
    })
  }

  /**
   * Upload file to Gemini File API
   *
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   fileType: string
   * }} params
   * @returns {Promise<import('@google/genai').File>}
   */
  async uploadFileToGemini ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    const fileBlob = new Blob(
      [fileBuffer],
      {
        type: fileType,
      }
    )

    return this.geminiClient.files.upload({
      file: fileBlob,
      config: {
        mimeType: fileType,
        displayName: fileName,
      },
    })
  }
}

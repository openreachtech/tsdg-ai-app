const JSON_RESPONSE_MIME_TYPE = 'application/json'

/**
 * The Gemini SDK, behind the two calls this system makes (`AI-01`).
 *
 * **This class and its launchers are the only place in the repository that reaches the network**
 * (`DR-11` `SEC-003`). Nothing above it imports an HTTP client or a provider SDK, which is what
 * makes "where could a client document go" a question with a short answer.
 *
 * Two operations, no more. The chat and streaming paths of the client this was ported from are
 * deliberately absent: OCR asks one question and waits for the whole answer.
 */
export default class GeminiApiClient {
  /**
   * Constructor.
   *
   * @param {{
   *   geminiClient: import('@google/genai').GoogleGenAI
   * }} params - Parameters of this constructor.
   */
  constructor ({
    geminiClient,
  }) {
    this.geminiClient = geminiClient
  }

  /**
   * Factory method.
   *
   * @param {{
   *   geminiClient: import('@google/genai').GoogleGenAI
   * }} params - Parameters of this method.
   * @returns {GeminiApiClient} - Instance of this class.
   */
  static create ({
    geminiClient,
  }) {
    return new this({
      geminiClient,
    })
  }

  /**
   * Ask the model to read a document.
   *
   * **`responseSchema` is what makes the answer parseable** rather than prose to be regexed. The
   * caller states the shape it needs and the provider is held to it, so an extraction that does
   * not fit is the provider's failure to answer rather than this system's failure to understand
   * (`40-backend.md` §7.2).
   *
   * **`mediaResolution` and `thinkingLevel` are Gemini 3 settings** and have no equivalent on 2.5.
   * The first decides how much of a page the model perceives, which is what a stamp-sized mark
   * depends on; the second bounds how long it reasons before answering. Both are stated by the
   * caller rather than defaulted, because a `TBL-06` row has to describe a request that can be made
   * again (`FR-036`).
   *
   * @param {{
   *   model: string
   *   contents: Array<*>
   *   systemInstruction: string
   *   mediaResolution: string
   *   thinkingLevel: string
   *   maxOutputTokens: number
   *   responseSchema: *
   *   responseMimeType?: string
   * }} params - Parameters of this method.
   * @returns {Promise<import('@google/genai').GenerateContentResponse>} - What the model answered.
   */
  async sendMessageToGemini ({
    model,
    contents,
    systemInstruction,
    mediaResolution,
    thinkingLevel,
    maxOutputTokens,
    responseSchema,
    responseMimeType = JSON_RESPONSE_MIME_TYPE,
  }) {
    return this.geminiClient.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        mediaResolution: /** @type {*} */ (mediaResolution),
        thinkingConfig: {
          thinkingLevel: /** @type {*} */ (thinkingLevel),
        },
        maxOutputTokens,
        responseMimeType,
        responseSchema,
      },
    })
  }

  /**
   * Hand a document to the provider's Files API (`ADR-07` `STORE-02`).
   *
   * This is the call that sends bytes off the host, and the only one. What it returns is recorded
   * in `TBL-08`, which is the sole record of what left and when (`OPS-08`).
   *
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   mimeType: string
   * }} params - Parameters of this method.
   * @returns {Promise<import('@google/genai').File>} - The provider's record of the upload.
   */
  async uploadFileToGemini ({
    fileBuffer,
    fileName,
    mimeType,
  }) {
    const fileBlob = new Blob(
      [
        fileBuffer,
      ],
      {
        type: mimeType,
      }
    )

    return this.geminiClient.files.upload({
      file: fileBlob,
      config: {
        mimeType,
        displayName: fileName,
      },
    })
  }
}

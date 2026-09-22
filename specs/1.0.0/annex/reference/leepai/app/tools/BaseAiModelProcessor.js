import AiModel from '../../sequelize/models/AiModel.js'
import AiModelCapability from '../../sequelize/models/AiModelCapability.js'

/**
 * Abstract base class for provider-specific AI model processors.
 */
export default class BaseAiModelProcessor {
  /**
   * Get the AI model
   *
   * @abstract
   * @returns {string}
   * @throws {Error} If not implemented by subclass
   */
  get aiModel () {
    throw new Error('aiModel must be implemented by subclass')
  }

  /**
   * Send request to AI
   *
   * @abstract
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   instruction: string
   *   documents: Array<*>
   *   fileUrls: Array<AttachedFile>
   *   historyMessages?: Array<model.AiChatRoomMessage>
   *   tools: Array<object>
   *   toolChoices?: Array<object>
   *   isAutoHandleFunctionCall?: boolean
   *   extraToolOptions?: object
   *   shouldPrefetchDynamicDocumentsForBackground?: boolean
   * }} params
   * @returns {Promise<*>}
   * @throws {Error} If not implemented by subclass
   */
  async sendRequestToAi ({
    aiAgent,
    instruction,
    documents,
    fileUrls,
    historyMessages = [],
    tools = [],
    toolChoices = [],
    isAutoHandleFunctionCall = true,
    extraToolOptions = {},
  }) {
    throw new Error('sendRequestToAi must be implemented by subclass')
  }

  /**
   * Send stream request to AI
   *
   * @abstract
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   instruction: string
   *   documents: Array<*>
   *   fileUrls: Array<AttachedFile>
   *   historyMessages?: Array<model.AiChatRoomMessage>
   *   tools: Array<object>
   *   toolChoices?: Array<object>
   *   isAutoHandleFunctionCall?: boolean
   *   extraToolOptions?: object
   *   shouldPrefetchDynamicDocumentsForBackground?: boolean
   *   onText: (text: string) => void
   *   onComplete: (message: object) => void
   * }} params
   * @returns {Promise<*>}
   * @throws {Error} If not implemented by subclass
   */
  async sendStreamRequestToAi ({
    aiAgent,
    instruction,
    documents,
    fileUrls,
    historyMessages = [],
    tools = [],
    toolChoices = [],
    isAutoHandleFunctionCall = true,
    extraToolOptions = {},
    onText,
    onComplete,
  }) {
    throw new Error('sendStreamRequestToAi must be implemented by subclass')
  }

  /**
   * Prepare attached files before passing them to the payload generator.
   *
   * Subclasses can override this to upload provider files or enrich metadata.
   *
   * @param {{
   *   fileUrls: Array<AttachedFile>
   *   now?: Date
   * }} params
   * @returns {Promise<Array<AttachedFile>>}
   */
  async prepareAttachedFiles ({
    fileUrls,
  }) {
    return fileUrls
  }

  /**
   * Find AI model by name
   *
   * @param {{
   *   aiModelName: string
   * }} params
   * @returns {Promise<model.AiModelWithAssociationsEntity>}
   */
  async findAiModelByName ({
    aiModelName,
  }) {
    return /** @type {Promise<*>} */ (
      AiModel.findOne({
        where: {
          name: aiModelName,
        },
        include: [
          AiModelCapability,
        ],
      })
    )
  }
}

/**
 * @typedef {{
 *   id?: number
 *   fileName?: string
 *   fileUrl: string
 *   fileType: string
 *   geminiFileUri?: string
 *   claudeFileId?: string
 *   openAiFileId?: string
 *   AiChatRoomMessageFileGeminiUpload?: {
 *     geminiFileUri?: string
 *   }
 *   AiChatRoomMessageFileClaudeUpload?: {
 *     claudeFileId?: string
 *   }
 *   AiChatRoomMessageFileOpenAiUpload?: {
 *     openAiFileId?: string
 *   }
 * }} AttachedFile
 */

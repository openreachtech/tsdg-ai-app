import BaseGeminiAIProcessor from '../BaseAiModelProviderProcessor/BaseGeminiAIProcessor.js'
import DocumentInstructionComposer from '../DocumentInstructionComposer.js'
import AiModelResponse from '../AiModelResponse.js'
import GeminiMessagePayloadGenerator from '../AiPayloadGenerator/GeminiMessagePayloadGenerator.js'
import SendMessageToGeminiFetcher from '../../geminiClient/SendMessageToGeminiFetcher.js'
import StreamingMessageToGeminiFetcher from '../../geminiClient/StreamingMessageToGeminiFetcher.js'
import CONSTANT_HASH from '../../../constants/aiConstants.cjs'

const {
  AI_MODEL,
} = CONSTANT_HASH

export default class Gemini2_0FlashAiModelProcessor extends BaseGeminiAIProcessor {
  /**
   * Get AI model
   *
   * @returns {string}
   */
  get aiModel () {
    return AI_MODEL.GEMINI_2_0_FLASH.NAME
  }

  /**
   * Send request to AI
   *
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   instruction: string
   *   documents: Array<server.graphql.employee.AiAgentDocumentInput>
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   *   historyMessages?: Array<model.AiChatRoomMessage>
   *   tools: Array<object>
   *   toolChoices?: Array<object>
   *   isAutoHandleFunctionCall?: boolean
   *   extraToolOptions?: object
   *   shouldPrefetchDynamicDocumentsForBackground?: boolean
   * }} params
   * @returns {Promise<AiModelResponse>}
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
    shouldPrefetchDynamicDocumentsForBackground = false,
  }) {
    const aiModel = await this.findAiModelByName({
      aiModelName: this.aiModel,
    })

    const documentInstructionComposer = await this.createDocumentInstructionComposer({
      aiAgent,
      documents,
      extraToolOptions,
      instruction,
      shouldPrefetchDynamicDocumentsForBackground,
    })

    const preparedFileUrls = await this.prepareAttachedFiles({
      fileUrls,
    })

    const geminiMessagePayloadGenerator = this.createGeminiMessagePayloadGenerator({
      aiAgent,
      aiModel,
      message: documentInstructionComposer.generateComposedInstruction(),
      fileUrls: preparedFileUrls,
      historyMessages,
      tools,
      toolChoices,
    })
    const payload = await geminiMessagePayloadGenerator.generateGeminiMessagePayload()

    const geminiFetcher = this.createSendMessageToGeminiFetcher()

    const aiResponseCapsule = await geminiFetcher.launchRequest(payload)

    if (aiResponseCapsule.hasError()) {
      return AiModelResponse.create({ aiResponseCapsule })
    }

    if (!aiResponseCapsule.hasFunctionCallEvent()) {
      return AiModelResponse.create({ aiResponseCapsule })
    }

    if (!isAutoHandleFunctionCall) {
      return AiModelResponse.create({ aiResponseCapsule })
    }

    const payloadForFunctionCalls = await this.handleFunctionCalls({
      payloadParams: payload.params,
      aiResponses: aiResponseCapsule.extractFunctionCalls(),
      extraToolOptions,
    })

    const aiResponseCapsuleForFunctionCalls = await geminiFetcher.launchRequest(payloadForFunctionCalls)

    return AiModelResponse.create({
      aiResponseCapsule: aiResponseCapsuleForFunctionCalls,
    })
  }

  /**
   * generate document instruction composer
   *
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   documents: Array<server.graphql.employee.AiAgentDocumentInput>
   *   extraToolOptions?: object
   *   instruction: string
   *   shouldPrefetchDynamicDocumentsForBackground?: boolean
   * }} params
   * @returns {Promise<DocumentInstructionComposer>}
   */
  async createDocumentInstructionComposer ({
    aiAgent,
    documents,
    extraToolOptions = {},
    instruction,
    shouldPrefetchDynamicDocumentsForBackground = false,
  }) {
    const associatedDocuments = documents.filter(doc => !doc.isOneTimeDocument)
    const associatedOnetimeDocuments = documents.filter(doc => doc.isOneTimeDocument === true)

    return DocumentInstructionComposer.createAsync({
      aiAgentDocumentAssignments: aiAgent.AiAgentDocumentAssignments ?? [],
      defaultInstruction: aiAgent.AiAgentDefaultInstruction.instruction,
      employeeId: extraToolOptions.employeeId ?? null,
      employeeRoleIds: extraToolOptions.employeeRoleIds ?? [],
      shouldPrefetchDynamicDocumentsForBackground,
      taskSpecificInput: {
        associatedDocuments,
        associatedOnetimeDocuments,
        instruction,
      },
    })
  }

  /**
   * Create message payload generator
   *
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   aiModel: model.AiModelWithAssociationsEntity
   *   message: string
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   *   historyMessages: Array<model.AiChatRoomMessage>
   *   tools: Array<object>
   *   toolChoices: Array<object>
   * }} params
   * @returns {GeminiMessagePayloadGenerator}
   */
  createGeminiMessagePayloadGenerator ({
    aiAgent,
    aiModel,
    message,
    fileUrls,
    historyMessages,
    tools,
    toolChoices,
  }) {
    return GeminiMessagePayloadGenerator.create({
      aiAgent,
      targetAiModel: aiModel.targetModelName,
      message,
      maxTokens: aiModel.AiModelCapability.maxOutputToken,
      fileUrls,
      emotionalLevel: Number(aiAgent.AiAgentEmotionalLevel.emotionalLevel),
      aiModel,
      historyMessages,
      tools,
      toolChoices,
    })
  }

  /**
   * Create send message to Gemini fetcher
   *
   * @returns {import('../../geminiClient/BaseGeminiApiRequestLauncher.js').default}
   */
  createSendMessageToGeminiFetcher () {
    return SendMessageToGeminiFetcher.create()
  }

  /**
   * Send stream request to AI
   *
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   instruction: string
   *   documents: Array<server.graphql.employee.AiAgentDocumentInput>
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   *   historyMessages?: Array<model.AiChatRoomMessage>
   *   tools: Array<object>
   *   toolChoices?: Array<object>
   *   extraToolOptions?: object
   *   shouldPrefetchDynamicDocumentsForBackground?: boolean
   *   onText?: (text: string) => void
   *   onComplete?: (message: object) => void
   *   onError?: (error: {
   *     type: string
   *     message: string
   *     requestId: string
   *   }) => void
   * }} params
   * @returns {Promise<*>}
   */
  async sendStreamRequestToAi ({
    aiAgent,
    instruction,
    documents,
    fileUrls,
    historyMessages = [],
    tools = [],
    toolChoices = [],
    extraToolOptions = {},
    shouldPrefetchDynamicDocumentsForBackground = false,
    onText,
    onComplete,
    onError,
  }) {
    const aiModel = await this.findAiModelByName({
      aiModelName: this.aiModel,
    })

    const documentInstructionComposer = await this.createDocumentInstructionComposer({
      aiAgent,
      documents,
      extraToolOptions,
      instruction,
      shouldPrefetchDynamicDocumentsForBackground,
    })

    const preparedFileUrls = await this.prepareAttachedFiles({
      fileUrls,
    })

    const geminiMessagePayloadGenerator = this.createGeminiMessagePayloadGenerator({
      aiAgent,
      aiModel,
      message: documentInstructionComposer.generateComposedInstruction(),
      fileUrls: preparedFileUrls,
      historyMessages,
      tools,
      toolChoices,
    })
    const payload = await geminiMessagePayloadGenerator.generateGeminiStreamingMessagePayload()

    const geminiFetcher = this.createStreamingMessageToGeminiFetcher()

    return geminiFetcher.launchStreamRequest(
      payload.toActualParams(),
      {
        onText,
        onFunctionCall: functionCalls => this.handleStreamingFunctionCalls({
          payloadParams: payload.toActualParams(),
          functionCalls,
          geminiFetcher,
          extraToolOptions,
          onText,
          onComplete,
        }),
        onComplete,
        onError,
      }
    )
  }

  /**
   * Create streaming message to Gemini fetcher
   *
   * @returns {import('../../geminiClient/BaseGeminiApiRequestLauncher.js').default}
   */
  createStreamingMessageToGeminiFetcher () {
    return StreamingMessageToGeminiFetcher.create()
  }
}

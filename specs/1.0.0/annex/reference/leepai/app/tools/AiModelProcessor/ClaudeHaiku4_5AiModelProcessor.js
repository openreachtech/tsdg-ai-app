import BaseClaudeAIProcessor from '../BaseAiModelProviderProcessor/BaseClaudeAIProcessor.js'
import DocumentInstructionComposer from '../DocumentInstructionComposer.js'
import ClaudeMessagePayloadGenerator from '../AiPayloadGenerator/ClaudeMessagePayloadGenerator.js'
import AiModelResponse from '../AiModelResponse.js'
import SendMessageToClaudeFetcher from '../../claudeClient/SendMessageToClaudeFetcher.js'
import StreamingMessageToClaudeFetcher from '../../claudeClient/StreamingMessageToClaudeFetcher.js'
import CONSTANT_HASH from '../../../constants/aiConstants.cjs'

const {
  AI_MODEL,
} = CONSTANT_HASH

export default class ClaudeHaiku4_5AiModelProcessor extends BaseClaudeAIProcessor {
  /**
   * Get AI model
   *
   * @returns {string}
   */
  get aiModel () {
    return AI_MODEL.CLAUDE_HAIKU_4_5.NAME
  }

  /**
   * Send request to AI
   *
   * @param {{
   *   aiAgent: model.AiAgentWithAssociationsEntity
   *   instruction: string
   *   documents: Array<server.graphql.employee.AiAgentDocumentInput>
   *   tools: Array<object>
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   *   historyMessages?: Array<model.AiChatRoomMessage>
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

    const claudeMessagePayloadGenerator = this.createClaudeMessagePayloadGenerator({
      aiAgent,
      aiModel,
      message: documentInstructionComposer.generateComposedInstruction(),
      fileUrls: preparedFileUrls,
      historyMessages,
      tools,
      toolChoices,
    })
    const payload = claudeMessagePayloadGenerator.generateClaudeMessagePayload()

    const claudeFetcher = this.createSendMessageToClaudeFetcher()

    const aiResponseCapsule = await claudeFetcher.launchRequest(payload)

    if (aiResponseCapsule.hasError()) {
      return AiModelResponse.create({
        aiResponseCapsule,
      })
    }

    if (!aiResponseCapsule.hasFunctionCallEvent()) {
      return AiModelResponse.create({
        aiResponseCapsule,
      })
    }

    if (!isAutoHandleFunctionCall) {
      return AiModelResponse.create({
        aiResponseCapsule,
      })
    }

    const payloadForFunctionCalls = await this.handleFunctionCalls({
      payloadParams: payload.params,
      aiResponses: aiResponseCapsule.extractContent(),
      extraToolOptions,
    })

    const aiResponseCapsuleForFunctionCalls = await claudeFetcher.launchRequest(payloadForFunctionCalls)

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
    const associatedDocuments = documents.filter(document => !document.isOneTimeDocument)
    const associatedOnetimeDocuments = documents.filter(document => document.isOneTimeDocument === true)

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
   *   toolChoices?: Array<object>
   * }} params
   * @returns {ClaudeMessagePayloadGenerator}
   */
  createClaudeMessagePayloadGenerator ({
    aiAgent,
    aiModel,
    message,
    fileUrls,
    historyMessages,
    tools,
    toolChoices,
  }) {
    return ClaudeMessagePayloadGenerator.create({
      aiAgent,
      targetAiModel: aiModel.targetModelName,
      message,
      maxTokens: aiModel.AiModelCapability.maxOutputToken,
      fileUrls,
      aiModel,
      emotionalLevel: Number(aiAgent.AiAgentEmotionalLevel.emotionalLevel),
      historyMessages,
      tools,
      toolChoices,
    })
  }

  /**
   * Create send message to Claude fetcher
   *
   * @returns {import('../../claudeClient/BaseClaudeApiRequestLauncher.js').default}
   */
  createSendMessageToClaudeFetcher () {
    return SendMessageToClaudeFetcher.create()
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
   *   onError?: (error: Error) => void
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

    const claudeMessagePayloadGenerator = this.createClaudeMessagePayloadGenerator({
      aiAgent,
      aiModel,
      message: documentInstructionComposer.generateComposedInstruction(),
      fileUrls: preparedFileUrls,
      historyMessages,
      tools,
      toolChoices,
    })
    const payload = claudeMessagePayloadGenerator.generateClaudeStreamingMessagePayload()

    const claudeFetcher = this.createStreamingMessageToClaudeFetcher()

    return claudeFetcher.launchStreamRequest(
      payload.toActualParams(),
      {
        onText,
        onFunctionCall: functionCalls => this.handleStreamingFunctionCalls({
          payloadParams: payload.toActualParams(),
          functionCalls,
          claudeFetcher,
          extraToolOptions,
          onText,
          onComplete,
          onError,
        }),
        onComplete,
        onError,
      }
    )
  }

  /**
   * Create streaming message to Claude fetcher
   *
   * @returns {import('../../claudeClient/BaseClaudeApiRequestLauncher.js').default}
   */
  createStreamingMessageToClaudeFetcher () {
    return StreamingMessageToClaudeFetcher.create()
  }
}

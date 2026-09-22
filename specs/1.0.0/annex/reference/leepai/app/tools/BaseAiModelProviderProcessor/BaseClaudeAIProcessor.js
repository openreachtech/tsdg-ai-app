import axios from 'axios'

import {
  Op,
} from 'sequelize'

import BaseAiModelProcessor from '../BaseAiModelProcessor.js'

import BulkAiToolProcessorsLoader from '../../aiTools/BulkAiToolProcessorsLoader.js'

import SendMessageToClaudePayload from '../../claudeClient/SendMessageToClaudePayload.js'
import UploadFileToClaudeFetcher from '../../claudeClient/UploadFileToClaudeFetcher.js'
import UploadFileToClaudePayload from '../../claudeClient/UploadFileToClaudePayload.js'
import UploadedFile from '../../../sequelize/models/UploadedFile.js'
import ClaudeUploadedFile from '../../../sequelize/models/ClaudeUploadedFile.js'

import {
  env,
} from '../../globals/_.js'

export default class BaseClaudeAIProcessor extends BaseAiModelProcessor {
  /**
   * Factory method to create a new instance of BaseClaudeAIProcessor
   *
   * @returns {BaseClaudeAIProcessor}
   */
  static create () {
    return new this()
  }

  /**
   * Create a loader for bulk AI tool processors
   *
   * @returns {Promise<BulkAiToolProcessorsLoader>}
   */
  async createBulkAiToolProcessorsLoader () {
    return BulkAiToolProcessorsLoader.createAsync()
  }

  /**
   * Handle function calls in AI responses
   *
   * @param {{
   *   payloadParams: {[key: string]: *}
   *   aiResponses: Array<object>
   *   extraToolOptions?: object
   * }} params
   * @returns {Promise<import('@openreachtech/renchan-tools-external-api/lib/bases/BasePayload.js')>}
   */
  async handleFunctionCalls ({
    payloadParams,
    aiResponses,
    extraToolOptions = {},
  }) {
    const bulkAiToolProcessorsLoader = await this.createBulkAiToolProcessorsLoader()

    payloadParams.messages.push({
      role: 'assistant',
      content: aiResponses,
    })

    const functionCalls = aiResponses.filter(response => response.type === 'tool_use')

    const toolResults = await functionCalls.reduce(async (resultsPromise, response) => {
      const collectedResults = await resultsPromise

      const aiToolProcessor = bulkAiToolProcessorsLoader.getProcessor(response.name)
      const toolResult = await aiToolProcessor.process({
        ...response.input,
        extraToolOptions: {
          ...extraToolOptions,
          toolName: response.name,
        },
      })

      collectedResults.push({
        type: 'tool_result',
        tool_use_id: response.id,
        content: toolResult.toString(),
      })

      return collectedResults
    }, Promise.resolve([]))

    payloadParams.messages.push({
      role: 'user',
      content: toolResults,
    })

    return SendMessageToClaudePayload.create({
      params: payloadParams,
    })
  }

  /**
   * Handle streaming function calls
   *
   * @param {{
   *   payloadParams: {[key: string]: string}
   *   functionCalls: Array<object>
   *   claudeFetcher: import('../../claudeClient/BaseClaudeApiRequestLauncher.js').default
   *   extraToolOptions: object
   *   onText: (text: string) => void
   *   onComplete: (message: object) => void
   *   onError: (error: Error) => void
   * }} params
   * @returns {Promise<*>}
   */
  async handleStreamingFunctionCalls ({
    payloadParams,
    functionCalls,
    claudeFetcher,
    extraToolOptions,
    onText,
    onComplete,
    onError,
  }) {
    const payloadForFunctionCalls = await this.handleFunctionCalls({
      payloadParams,
      aiResponses: functionCalls,
      extraToolOptions,
    })

    return claudeFetcher.launchStreamRequest(
      payloadForFunctionCalls.toActualParams(),
      {
        onText,
        onComplete,
        onError,
      }
    )
  }

  /**
   * Prepare Claude attached files by mapping uploaded file URLs to UploadedFile records,
   * then reusing an existing ClaudeUploadedFile file id or uploading to Claude when needed.
   *
   * Claude Files API returns a persistent file id and does not expire uploaded files,
   * so reuse does not require an expiration check.
   *
   * @param {{
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   * }} params
   * @returns {Promise<Array<import('../BaseAiModelProcessor.js').AttachedFile>>}
   */
  async prepareAttachedFiles ({
    fileUrls,
  }) {
    if (fileUrls.length === 0) {
      return []
    }

    const matchedEntries = this.extractUploadedFileUrlEntries({
      fileUrls,
    })

    if (matchedEntries.length === 0) {
      return []
    }

    const uploadedFiles = await this.findUploadedFilesByIdHashes({
      idHashes: matchedEntries.map(entry => entry.idHash),
    })
    const uploadedFileByIdHash = uploadedFiles.reduce(
      (hash, uploadedFile) => ({
        ...hash,
        [uploadedFile.idHash]: uploadedFile,
      }),
      /** @type {Record<string, model.UploadedFile>} */ ({})
    )

    const fileIdEntries = await matchedEntries.reduce(async (entriesPromise, entry) => {
      const entries = await entriesPromise
      const resolvedEntry = await this.resolveClaudeFileIdEntry({
        entry,
        uploadedFileByIdHash,
      })

      return [
        ...entries,
        resolvedEntry,
      ]
    }, Promise.resolve([]))

    const fileIdByIndex = fileIdEntries.reduce(
      (hash, entry) => ({
        ...hash,
        [entry.index]: entry.claudeFileId,
      }),
      {}
    )

    return fileUrls
      .map((file, index) => ({
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        claudeFileId: fileIdByIndex[index] ?? file.claudeFileId,
      }))
      .filter(file => Boolean(file.claudeFileId))
  }

  /**
   * @param {{
   *   entry: {
   *     index: number
   *     idHash: string
   *     file: import('../BaseAiModelProcessor.js').AttachedFile
   *   }
   *   uploadedFileByIdHash: Record<string, model.UploadedFile>
   * }} params
   * @returns {Promise<{
   *   index: number
   *   claudeFileId: string | null
   * }>}
   */
  async resolveClaudeFileIdEntry ({
    entry,
    uploadedFileByIdHash,
  }) {
    const uploadedFile = uploadedFileByIdHash[entry.idHash]

    if (!uploadedFile) {
      return {
        index: entry.index,
        claudeFileId: null,
      }
    }

    const reusableClaudeUploadedFile = await this.findReusableClaudeUploadedFile({
      uploadedFileId: uploadedFile.id,
    })

    if (reusableClaudeUploadedFile) {
      const {
        fileId,
      } = /** @type {{ fileId: string }} */ (reusableClaudeUploadedFile)

      return {
        index: entry.index,
        claudeFileId: fileId,
      }
    }

    const uploadedClaudeFileId = await this.uploadAndSaveClaudeFile({
      uploadedFile,
    })

    return {
      index: entry.index,
      claudeFileId: uploadedClaudeFileId,
    }
  }

  /**
   * @param {{
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   * }} params
   * @returns {Array<{
   *   index: number
   *   idHash: string
   *   file: import('../BaseAiModelProcessor.js').AttachedFile
   * }>}
   */
  extractUploadedFileUrlEntries ({
    fileUrls,
  }) {
    const baseUrlsWithSlash = this.extractNormalizedBaseFileUrls()

    return fileUrls
      .map((file, index) => {
        const isMatchedBase = baseUrlsWithSlash.some(base => file.fileUrl.startsWith(base))

        return {
          index,
          file,
          idHash: isMatchedBase
            ? this.extractIdHashFromPath({
              urlString: file.fileUrl,
            })
            : null,
        }
      })
      .filter(entry => Boolean(entry.idHash))
      .map(entry => ({
        index: entry.index,
        file: entry.file,
        idHash: /** @type {string} */ (entry.idHash),
      }))
  }

  /**
   * Extract the ID hash from the file URL path, assuming the URL starts with a known base file URL.
   *
   * @param {{
   *   urlString: string
   * }} params
   * @returns {string | null}
   */
  extractIdHashFromPath ({
    urlString,
  }) {
    const url = new URL(urlString)
    const pathSegments = url.pathname.split('/')

    return pathSegments.pop() ?? null
  }

  /**
   * @returns {Array<string>}
   */
  extractNormalizedBaseFileUrls () {
    return [
      env.BASE_EMPLOYEE_FILE_URL,
      env.BASE_CLIENT_FILE_URL,
    ]
  }

  /**
   * @param {{
   *   idHashes: Array<string>
   * }} params
   * @returns {Promise<Array<model.UploadedFile>>}
   */
  async findUploadedFilesByIdHashes ({
    idHashes,
  }) {
    return /** @type {Promise<Array<model.UploadedFile>>} */ (
      UploadedFile.findAll({
        where: {
          idHash: {
            [Op.in]: idHashes,
          },
        },
      })
    )
  }

  /**
   * @param {{
   *   uploadedFileId: number
   * }} params
   * @returns {Promise<object | null>}
   */
  async findReusableClaudeUploadedFile ({
    uploadedFileId,
  }) {
    return /** @type {Promise<object | null>} */ (
      ClaudeUploadedFile.findOne({
        where: {
          UploadedFileId: uploadedFileId,
        },
        order: [
          ['createdAt', 'DESC'],
        ],
      })
    )
  }

  /**
   * @param {{
   *   uploadedFile: model.UploadedFile
   * }} params
   * @returns {Promise<string | null>}
   */
  async uploadAndSaveClaudeFile ({
    uploadedFile,
  }) {
    try {
      const fileBuffer = await this.fetchFileBuffer({
        fileUrl: uploadedFile.fileUrl,
      })

      const capsuleResult = await this.uploadFileToClaude({
        fileBuffer,
        fileName: uploadedFile.fileName,
        fileType: uploadedFile.fileType,
      })

      if (capsuleResult.hasError()) {
        return null
      }

      const fileId = capsuleResult.extractUploadedFileId()
      const fileName = capsuleResult.extractUploadedFileName()
      const fileType = capsuleResult.extractUploadedFileMimeType()
      const fileSize = capsuleResult.extractUploadedFileSizeBytes()
      const uploadedAt = capsuleResult.extractUploadedFileCreateTime()

      await this.saveClaudeUploadedFile({
        uploadedFile,
        fileName,
        fileId,
        fileType,
        fileSize,
        uploadedAt,
      })

      return fileId
    } catch (error) {
      return null
    }
  }

  /**
   * @param {{
   *   uploadedFile: model.UploadedFile
   *   fileName: string
   *   fileId: string
   *   fileType: string
   *   fileSize: number
   *   uploadedAt: string
   * }} params
   * @returns {Promise<ClaudeUploadedFile>}
   */
  async saveClaudeUploadedFile ({
    uploadedFile,
    fileName,
    fileId,
    fileType,
    fileSize,
    uploadedAt,
  }) {
    return ClaudeUploadedFile.create({
      UploadedFileId: uploadedFile.id,
      fileName,
      fileId,
      fileType,
      fileSize,
      uploadedAt: new Date(uploadedAt),
    })
  }

  /**
   * @param {{
   *   fileUrl: string
   * }} params
   * @returns {Promise<Buffer>}
   */
  async fetchFileBuffer ({
    fileUrl,
  }) {
    const response = await axios.get(
      fileUrl,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          Accept: 'application/octet-stream',
        },
        responseType: 'arraybuffer',
      }
    )

    return Buffer.from(response.data)
  }

  /**
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   fileType: string
   * }} params
   * @returns {Promise<import('../../claudeClient/UploadFileToClaudeCapsule.js').default>}
   */
  async uploadFileToClaude ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    const uploadFileToClaudeFetcher = this.createUploadFileToClaudeFetcher()

    const uploadFileToClaudePayload = this.createUploadFileToClaudePayload({
      fileBuffer,
      fileName,
      fileType,
    })

    return uploadFileToClaudeFetcher
      .launchRequest(uploadFileToClaudePayload)
  }

  /**
   * @returns {import('@openreachtech/renchan-tools-external-api/lib/bases/BaseRequestLauncher.js')}
   */
  createUploadFileToClaudeFetcher () {
    return UploadFileToClaudeFetcher.create()
  }

  /**
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   fileType: string
   * }} params
   * @returns {import('@openreachtech/renchan-tools-external-api/lib/bases/BasePayload.js')}
   */
  createUploadFileToClaudePayload ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    return UploadFileToClaudePayload.create({
      params: {
        fileBuffer,
        fileName,
        fileType,
      },
    })
  }
}

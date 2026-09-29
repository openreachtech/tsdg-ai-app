import axios from 'axios'
import {
  Op,
} from 'sequelize'

import BaseAiModelProcessor from '../BaseAiModelProcessor.js'

import BulkAiToolProcessorsLoader from '../../aiTools/BulkAiToolProcessorsLoader.js'

import SendMessageToGeminiPayload from '../../geminiClient/SendMessageToGeminiPayload.js'
import UploadFileToGeminiFetcher from '../../geminiClient/UploadFileToGeminiFetcher.js'
import UploadFileToGeminiPayload from '../../geminiClient/UploadFileToGeminiPayload.js'
import UploadedFile from '../../../sequelize/models/UploadedFile.js'
import GeminiUploadedFile from '../../../sequelize/models/GeminiUploadedFile.js'

import {
  env,
} from '../../globals/_.js'

export default class BaseGeminiAIProcessor extends BaseAiModelProcessor {
  /**
   * Factory method to create a new instance of BaseGeminiAIProcessor
   *
   * @returns {BaseGeminiAIProcessor}
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

    await aiResponses.reduce(async (resultsPromise, response) => {
      const collectedResults = await resultsPromise

      const aiToolProcessor = bulkAiToolProcessorsLoader.getProcessor(response.name)
      const toolResult = await aiToolProcessor.process({
        ...response.arguments,
        extraToolOptions: {
          ...extraToolOptions,
          toolName: response.name,
        },
      })

      payloadParams.contents.push({
        role: 'model',
        parts: [
          {
            functionCall: {
              name: response.name,
              args: response.arguments,
            },
          },
        ],
      })

      payloadParams.contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: response.name,
              response: {
                result: toolResult.toString(),
              },
            },
          },
        ],
      })

      return collectedResults
    }, Promise.resolve([]))

    return SendMessageToGeminiPayload.create({
      params: payloadParams,
    })
  }

  /**
   * Handle streaming function calls
   *
   * @param {{
   *   payloadParams: {[key: string]: string}
   *   functionCalls: Array<object>
   *   geminiFetcher: import('../../geminiClient/BaseGeminiApiRequestLauncher.js').default
   *   extraToolOptions: object
   *   onText: (text: string) => void
   *   onComplete: (message: object) => void
   * }} params
   * @returns {Promise<*>}
   */
  async handleStreamingFunctionCalls ({
    payloadParams,
    functionCalls,
    geminiFetcher,
    extraToolOptions,
    onText,
    onComplete,
  }) {
    const payloadForFunctionCalls = await this.handleFunctionCalls({
      payloadParams,
      aiResponses: functionCalls,
      extraToolOptions,
    })

    return geminiFetcher.launchStreamRequest(
      payloadForFunctionCalls.toActualParams(),
      {
        onText,
        onComplete,
      }
    )
  }

  /**
   * Prepare Gemini attached files by mapping uploaded file URLs to UploadedFile records,
   * then reusing non-expired GeminiUploadedFile uri or re-uploading when needed.
   *
   * @param {{
   *   fileUrls: Array<import('../BaseAiModelProcessor.js').AttachedFile>
   *   now?: Date
   * }} params
   * @returns {Promise<Array<import('../BaseAiModelProcessor.js').AttachedFile>>}
   */
  async prepareAttachedFiles ({
    fileUrls,
    now = new Date(),
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

    const uriEntries = await matchedEntries.reduce(async (entriesPromise, entry) => {
      const entries = await entriesPromise
      const resolvedEntry = await this.resolveGeminiFileUriEntry({
        entry,
        uploadedFileByIdHash,
        now,
      })

      return [
        ...entries,
        resolvedEntry,
      ]
    }, Promise.resolve([]))

    const uriHashByIndex = uriEntries.reduce(
      (hash, entry) => ({
        ...hash,
        [entry.index]: entry.geminiFileUri,
      }),
      {}
    )

    return fileUrls
      .map((file, index) => ({
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        geminiFileUri: uriHashByIndex[index] ?? file.geminiFileUri,
      }))
      .filter(file => Boolean(file.geminiFileUri))
  }

  /**
   * @param {{
   *   entry: {
   *     index: number
   *     idHash: string
   *     file: import('../BaseAiModelProcessor.js').AttachedFile
   *   }
   *   uploadedFileByIdHash: Record<string, model.UploadedFile>
   *   now: Date
   * }} params
   * @returns {Promise<{
   *   index: number
   *   geminiFileUri: string | null
   * }>}
   */
  async resolveGeminiFileUriEntry ({
    entry,
    uploadedFileByIdHash,
    now,
  }) {
    const uploadedFile = uploadedFileByIdHash[entry.idHash]

    if (!uploadedFile) {
      return {
        index: entry.index,
        geminiFileUri: null,
      }
    }

    const reusableGeminiUploadedFile = await this.findReusableGeminiUploadedFile({
      uploadedFileId: uploadedFile.id,
      now,
    })

    if (reusableGeminiUploadedFile) {
      const {
        fileUri,
      } = /** @type {{ fileUri: string }} */ (reusableGeminiUploadedFile)

      return {
        index: entry.index,
        geminiFileUri: fileUri,
      }
    }

    const uploadedGeminiFileUri = await this.uploadAndSaveGeminiFile({
      uploadedFile,
    })

    return {
      index: entry.index,
      geminiFileUri: uploadedGeminiFileUri,
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
   *   now: Date
   * }} params
   * @returns {Promise<object | null>}
   */
  async findReusableGeminiUploadedFile ({
    uploadedFileId,
    now,
  }) {
    const geminiUploadedFile = await /** @type {Promise<object | null>} */ (
      GeminiUploadedFile.findOne({
        where: {
          UploadedFileId: uploadedFileId,
        },
        order: [
          ['expiresAt', 'DESC'],
        ],
      })
    )

    if (!geminiUploadedFile) {
      return null
    }

    const {
      expiresAt,
    } = /** @type {{ expiresAt: Date | string }} */ (geminiUploadedFile)

    if (new Date(expiresAt) <= now) {
      return null
    }

    return geminiUploadedFile
  }

  /**
   * @param {{
   *   uploadedFile: model.UploadedFile
   * }} params
   * @returns {Promise<string | null>}
   */
  async uploadAndSaveGeminiFile ({
    uploadedFile,
  }) {
    try {
      const fileBuffer = await this.fetchFileBuffer({
        fileUrl: uploadedFile.fileUrl,
      })

      const capsuleResult = await this.uploadFileToGemini({
        fileBuffer,
        fileName: uploadedFile.fileName,
        fileType: uploadedFile.fileType,
      })

      if (capsuleResult.hasError()) {
        return null
      }

      const fileUri = capsuleResult.extractUploadedFileUri()
      const fileName = capsuleResult.extractUploadedFileName()
      const fileType = capsuleResult.extractUploadedFileMimeType()
      const fileSize = capsuleResult.extractUploadedFileSizeBytes()
      const uploadedAt = capsuleResult.extractUploadedFileCreateTime()
      const expiresAt = capsuleResult.extractUploadedFileExpirationTime()

      await this.saveGeminiUploadedFile({
        uploadedFile,
        fileName,
        fileUri,
        fileType,
        fileSize,
        uploadedAt,
        expiresAt,
      })

      return fileUri
    } catch (error) {
      return null
    }
  }

  /**
   * @param {{
   *   uploadedFile: model.UploadedFile
   *   fileName: string
   *   fileUri: string
   *   fileType: string
   *   fileSize: string
   *   uploadedAt: Date
   *   expiresAt: Date
   * }} params
   * @returns {Promise<GeminiUploadedFile>}
   */
  async saveGeminiUploadedFile ({
    uploadedFile,
    fileName,
    fileUri,
    fileType,
    fileSize,
    uploadedAt,
    expiresAt,
  }) {
    return GeminiUploadedFile.create({
      UploadedFileId: uploadedFile.id,
      fileName,
      fileUri,
      fileType,
      fileSize,
      uploadedAt: new Date(uploadedAt),
      expiresAt: new Date(expiresAt),
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
   * @returns {Promise<import('../../geminiClient/UploadFileToGeminiCapsule.js').default>}
   */
  async uploadFileToGemini ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    const uploadFileToGeminiFetcher = this.createUploadFileToGeminiFetcher()

    const uploadFileToGeminiPayload = this.createUploadFileToGeminiPayload({
      fileBuffer,
      fileName,
      fileType,
    })

    return uploadFileToGeminiFetcher
      .launchRequest(uploadFileToGeminiPayload)
  }

  /**
   * @returns {import('@openreachtech/renchan-tools-external-api/lib/bases/BaseRequestLauncher.js')}
   */
  createUploadFileToGeminiFetcher () {
    return UploadFileToGeminiFetcher.create()
  }

  /**
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   fileType: string
   * }} params
   * @returns {import('@openreachtech/renchan-tools-external-api/lib/bases/BasePayload.js')}
   */
  createUploadFileToGeminiPayload ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    return UploadFileToGeminiPayload.create({
      params: {
        fileBuffer,
        fileName,
        fileType,
      },
    })
  }
}

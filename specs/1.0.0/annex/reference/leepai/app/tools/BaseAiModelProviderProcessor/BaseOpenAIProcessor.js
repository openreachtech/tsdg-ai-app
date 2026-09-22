import axios from 'axios'

import {
  Op,
} from 'sequelize'

import BaseAiModelProcessor from '../BaseAiModelProcessor.js'

import BulkAiToolProcessorsLoader from '../../aiTools/BulkAiToolProcessorsLoader.js'

import SendMessageToOpenAiPayload from '../../openAiClient/SendMessageToOpenAiPayload.js'
import UploadFileToOpenAiFetcher from '../../openAiClient/UploadFileToOpenAiFetcher.js'
import UploadFileToOpenAiPayload from '../../openAiClient/UploadFileToOpenAiPayload.js'
import UploadedFile from '../../../sequelize/models/UploadedFile.js'
import OpenAiUploadedFile from '../../../sequelize/models/OpenAiUploadedFile.js'

import {
  env,
} from '../../globals/_.js'

export default class BaseOpenAIProcessor extends BaseAiModelProcessor {
  /**
   * Factory method to create a new instance of BaseOpenAIProcessor
   *
   * @returns {BaseOpenAIProcessor}
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
   *   payloadParams: {[key: string]: string}
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

    const functionCalls = aiResponses.filter(response => response.type === 'function_call')

    const updatedPayloadParams = await functionCalls.reduce(async (resultsPromise, response) => {
      const collectedResults = await resultsPromise

      const aiToolProcessor = bulkAiToolProcessorsLoader.getProcessor(response.name)

      const toolResult = await aiToolProcessor.process({
        ...JSON.parse(response.arguments),
        extraToolOptions: {
          ...extraToolOptions,
          toolName: response.name,
        },
      })
      collectedResults.input.push(response)
      collectedResults.input.push({
        type: 'function_call_output',
        call_id: response.call_id,
        output: toolResult.toString(),
      })

      return collectedResults
    }, Promise.resolve(payloadParams))

    return SendMessageToOpenAiPayload.create({
      params: updatedPayloadParams,
    })
  }

  /**
   * Handle streaming function calls
   *
   * @param {{
   *   payloadParams: {[key: string]: string}
   *   functionCalls: Array<object>
   *   openAiFetcher: import('../../openAiClient/BaseOpenAiApiRequestLauncher.js').default
   *   extraToolOptions: object
   *   onText: (text: string) => void
   *   onComplete: (message: object) => void
   *   onError: (error: {
   *     type: string
   *     message: string
   *     requestId: string
   *   }) => void
   * }} params
   * @returns {Promise<*>}
   */
  async handleStreamingFunctionCalls ({
    payloadParams,
    functionCalls,
    openAiFetcher,
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

    return openAiFetcher.launchStreamRequest(
      payloadForFunctionCalls.toActualParams(),
      {
        onText,
        onComplete,
        onError,
      }
    )
  }

  /**
   * Prepare OpenAI attached files by mapping uploaded file URLs to UploadedFile records,
   * then reusing a non-expired OpenAiUploadedFile file id or uploading to OpenAI when needed.
   *
   * OpenAI Files API returns a persistent file id. Files uploaded with `purpose=user_data`
   * do not expire (expires_at is null) unless an expiration policy is set, so a stored
   * record without an expiration is always reusable.
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

    const fileIdEntries = await matchedEntries.reduce(async (entriesPromise, entry) => {
      const entries = await entriesPromise
      const resolvedEntry = await this.resolveOpenAiFileIdEntry({
        entry,
        uploadedFileByIdHash,
        now,
      })

      return [
        ...entries,
        resolvedEntry,
      ]
    }, Promise.resolve([]))

    const fileIdByIndex = fileIdEntries.reduce(
      (hash, entry) => ({
        ...hash,
        [entry.index]: entry.openAiFileId,
      }),
      {}
    )

    return fileUrls
      .map((file, index) => ({
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        openAiFileId: fileIdByIndex[index] ?? file.openAiFileId,
      }))
      .filter(file => Boolean(file.openAiFileId))
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
   *   openAiFileId: string | null
   * }>}
   */
  async resolveOpenAiFileIdEntry ({
    entry,
    uploadedFileByIdHash,
    now,
  }) {
    const uploadedFile = uploadedFileByIdHash[entry.idHash]

    if (!uploadedFile) {
      return {
        index: entry.index,
        openAiFileId: null,
      }
    }

    const reusableOpenAiUploadedFile = await this.findReusableOpenAiUploadedFile({
      uploadedFileId: uploadedFile.id,
      now,
    })

    if (reusableOpenAiUploadedFile) {
      const {
        fileId,
      } = /** @type {{ fileId: string }} */ (reusableOpenAiUploadedFile)

      return {
        index: entry.index,
        openAiFileId: fileId,
      }
    }

    const uploadedOpenAiFileId = await this.uploadAndSaveOpenAiFile({
      uploadedFile,
    })

    return {
      index: entry.index,
      openAiFileId: uploadedOpenAiFileId,
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
  async findReusableOpenAiUploadedFile ({
    uploadedFileId,
    now,
  }) {
    const openAiUploadedFile = await /** @type {Promise<object | null>} */ (
      OpenAiUploadedFile.findOne({
        where: {
          UploadedFileId: uploadedFileId,
        },
        order: [
          ['createdAt', 'DESC'],
        ],
      })
    )

    if (!openAiUploadedFile) {
      return null
    }

    const {
      expiresAt,
    } = /** @type {{ expiresAt: Date | string | null }} */ (openAiUploadedFile)

    if (!expiresAt) {
      return openAiUploadedFile
    }

    if (new Date(expiresAt) <= now) {
      return null
    }

    return openAiUploadedFile
  }

  /**
   * @param {{
   *   uploadedFile: model.UploadedFile
   * }} params
   * @returns {Promise<string | null>}
   */
  async uploadAndSaveOpenAiFile ({
    uploadedFile,
  }) {
    try {
      const fileBuffer = await this.fetchFileBuffer({
        fileUrl: uploadedFile.fileUrl,
      })

      const capsuleResult = await this.uploadFileToOpenAi({
        fileBuffer,
        fileName: uploadedFile.fileName,
        fileType: uploadedFile.fileType,
      })

      if (capsuleResult.hasError()) {
        return null
      }

      const fileId = capsuleResult.extractUploadedFileId()
      const fileName = capsuleResult.extractUploadedFileName()
      const fileSize = capsuleResult.extractUploadedFileSizeBytes()
      const uploadedAt = capsuleResult.extractUploadedFileCreateTime()
      const expiresAt = capsuleResult.extractUploadedFileExpirationTime()

      await this.saveOpenAiUploadedFile({
        uploadedFile,
        fileName,
        fileId,
        fileType: uploadedFile.fileType,
        fileSize,
        uploadedAt,
        expiresAt,
      })

      return fileId
    } catch (error) {
      return null
    }
  }

  /**
   * Convert an OpenAI Unix timestamp (in seconds) into a Date instance.
   *
   * @param {{
   *   unixSeconds: number | null
   * }} params
   * @returns {Date | null}
   */
  convertUnixSecondsToDate ({
    unixSeconds,
  }) {
    if (!unixSeconds) {
      return null
    }

    return new Date(unixSeconds * 1000)
  }

  /**
   * @param {{
   *   uploadedFile: model.UploadedFile
   *   fileName: string
   *   fileId: string
   *   fileType: string
   *   fileSize: number
   *   uploadedAt: number
   *   expiresAt: number | null
   * }} params
   * @returns {Promise<OpenAiUploadedFile>}
   */
  async saveOpenAiUploadedFile ({
    uploadedFile,
    fileName,
    fileId,
    fileType,
    fileSize,
    uploadedAt,
    expiresAt,
  }) {
    return OpenAiUploadedFile.create({
      UploadedFileId: uploadedFile.id,
      fileName,
      fileId,
      fileType,
      fileSize,
      uploadedAt: this.convertUnixSecondsToDate({
        unixSeconds: uploadedAt,
      }),
      expiresAt: this.convertUnixSecondsToDate({
        unixSeconds: expiresAt,
      }),
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
   * @returns {Promise<import('../../openAiClient/UploadFileToOpenAiCapsule.js').default>}
   */
  async uploadFileToOpenAi ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    const uploadFileToOpenAiFetcher = this.createUploadFileToOpenAiFetcher()

    const uploadFileToOpenAiPayload = this.createUploadFileToOpenAiPayload({
      fileBuffer,
      fileName,
      fileType,
    })

    return uploadFileToOpenAiFetcher
      .launchRequest(uploadFileToOpenAiPayload)
  }

  /**
   * @returns {import('@openreachtech/renchan-tools-external-api/lib/bases/BaseRequestLauncher.js')}
   */
  createUploadFileToOpenAiFetcher () {
    return UploadFileToOpenAiFetcher.create()
  }

  /**
   * @param {{
   *   fileBuffer: Buffer
   *   fileName: string
   *   fileType: string
   * }} params
   * @returns {import('@openreachtech/renchan-tools-external-api/lib/bases/BasePayload.js')}
   */
  createUploadFileToOpenAiPayload ({
    fileBuffer,
    fileName,
    fileType,
  }) {
    return UploadFileToOpenAiPayload.create({
      params: {
        fileBuffer,
        fileName,
        fileType,
      },
    })
  }
}

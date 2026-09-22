import {
  readFile,
} from 'fs/promises'

import AI_PROVIDER_CONSTANT_HASH from '../../constants/aiProvider.js'

import {
  env,
  timber,
} from '../../globals/_.js'

import SendMessageToGeminiFetcher from '../../geminiClient/SendMessageToGeminiFetcher.js'
import SendMessageToGeminiPayload from '../../geminiClient/SendMessageToGeminiPayload.js'
import UploadFileToGeminiFetcher from '../../geminiClient/UploadFileToGeminiFetcher.js'
import UploadFileToGeminiPayload from '../../geminiClient/UploadFileToGeminiPayload.js'

import GeminiUploadedFile from '../../../sequelize/models/GeminiUploadedFile.js'

import BaseAiModelProcessor from '../BaseAiModelProcessor.js'

import {
  AMOUNT_VALUE_SCHEMA,
  buildEnvelopeSchema,
  FLAG_VALUE_SCHEMA,
  SCHEMA_TYPE,
  TEXT_VALUE_SCHEMA,
} from './geminiSchemaVocabulary.js'

const {
  AI_PROVIDER,
} = AI_PROVIDER_CONSTANT_HASH

/*
 * What a debit note is, and what every document was declared as until 2026-08-27.
 *
 * It is the default rather than the rule: see `#get:documentMimeType`.
 */
const PDF_MIME_TYPE = 'application/pdf'

/*
 * The SDK's own key for a reference to a file it already holds.
 *
 * Written as a computed key rather than spelled in the object literal because `Data` is a denied
 * suffix (`40-backend.md` §9) and a literal key counts as an identifier - the same device
 * `TimberMock` uses for the borrowed name `info`. Renaming is not on offer: the provider decides
 * what its request keys are called.
 */
const FILE_REFERENCE_KEY = 'fileData'

/*
 * How much of each page the model is allowed to look at.
 *
 * **This is the setting check ④ lives or dies by.** An approval is a stamp or a signature - a small
 * mark, not a line of text - and the provider states outright that a higher resolution is what lets
 * fine detail be perceived at all. `MEDIA_RESOLUTION_HIGH` is the most the `generateContent` path
 * offers; the newer interactions API adds an `ultra_high` above it, which is a reason to revisit this
 * once accuracy on real documents is measured (`OPEN-1` `FR-032`).
 *
 * **Temperature is not set here, and `AI_TEMPERATURE` defaults to not setting it.** It was 0 while
 * the model was Gemini 2.5, on the reasoning that transcription must not be creative. Gemini 3
 * reverses that advice: the provider strongly recommends leaving it at its default of 1.0 and warns
 * that lowering it causes looping or degraded output. Determinism (`NFR-030`) is a property of the
 * engine, which computes the judgment from the extraction; it was never something a sampling
 * temperature could promise.
 *
 * **That default is also what makes agreement mean anything** (`FR-140`). Readings have to differ
 * for `TERM-15` to be a measurement, and 1.0 is where they differ most - a lower figure would buy
 * less variance, not more, which is the opposite of what repeated reading is for.
 */
const MEDIA_RESOLUTION = 'MEDIA_RESOLUTION_HIGH'

/*
 * How deeply the model may reason before answering.
 *
 * **`LOW` until 2026-08-28, and what raised it is the measurement `OPEN-1` was waiting for.** The
 * argument for asking less was that thinking is spent out of the output budget above, so a higher
 * level on a long document risks an answer that is empty or stops mid-array - read as an unreadable
 * document, and `NG-005` on a debit note that was fine. Read against the client's own bundles that
 * risk did not appear: all twelve documents, up to twelve pages, finished on `STOP` at this level,
 * well inside a `JOB_TIMEOUT_SECONDS` of 900 (`ENV-024`).
 *
 * **What it buys is the one thing reading three times cannot.** These documents are 1-bit 200 DPI
 * scans with no text layer, and on one of them the transcription of a printed reference code would
 * not settle: with the prompt as it now stands, `LOW` got the code right in 9 readings of 18 and
 * this level in 25 of 28, while every other field of the same readings agreed every time.
 * Repetition cannot rescue a character the model never settles on - it only measures how unsettled
 * it is (`ENG-05` `NG-008`).
 *
 * **The residual is real and the counts above are how to think about it.** Around one reading in
 * ten still drops or doubles a character, so three readings land a majority on the right code
 * roughly 97 times in 100 and are unanimous about it roughly 70. **Only a reading with no majority
 * becomes `NG-008`**; a two-of-three keeps the right value and says on the screen that it was two
 * of three (`FR-142` `FieldConsensusResolver`). Closing the rest is not a prompt or a setting - it
 * is `OPEN-1`'s own mitigation, a re-scan in grayscale, because what is being read here is a
 * character that bitonal capture has already thinned.
 *
 * **`MEDIUM` rather than `HIGH`, decided on what is billed.** `HIGH` measured 32 readings of 34 of
 * the same document against this level's 25 of 28 - a difference well inside the noise of samples
 * that size - while spending around 4000 thinking tokens a reading where this level spends around
 * 1400, for an answer of the same 530. Raise it if the residual ever proves to matter; nothing
 * measured so far says it buys anything. `MINIMAL` is not on offer: the model refuses it outright.
 *
 * **Both branches of §7.2 were measured, which is why this is the provider base's setting.** The
 * cover-sheet read was measured at `LOW` and at `HIGH` and answers identically at both, so nothing
 * yet asks for a branch to disagree.
 *
 * A lower sampling temperature was measured beside this and is not the lever: at `LOW` thinking it
 * made the same reading worse rather than steadier, exactly as `#resolveTemperature()` says
 * (`ENV-042`).
 *
 * Stated rather than inherited because `TBL-06` exists so a reading can be made again (`FR-036`), and
 * a request whose parameters come from a default that moves between model versions cannot promise
 * that. It is a getter, so a per-model class can still disagree.
 */
const THINKING_LEVEL = 'MEDIUM'

/*
 * The range a temperature may be set to, which is the provider's own.
 *
 * Bounds rather than a free number, because the failure they catch is a decimal point in the wrong
 * place: `40` instead of `0.40` is accepted by every arithmetic check and is not a temperature.
 */
const MINIMUM_TEMPERATURE = 0
const MAXIMUM_TEMPERATURE = 2

/*
 * The whole output budget the model is allowed, which is its maximum.
 *
 * **Thinking tokens are spent out of this same budget**, and a thinking model will expand to fill
 * most of whatever it is given. A budget sized for the JSON alone is therefore how a long document
 * comes back empty or cut off mid-array: the thoughts consume it and nothing is left to answer with.
 * Asking for the maximum is what keeps both inside it (`FR-032`).
 */
const MAX_OUTPUT_TOKENS = 65536

/*
 * How long the provider keeps an uploaded file, used **only** when the provider's answer did not say
 * (`TBL-08.expires_at`, `ST-03`).
 *
 * Falling back rather than refusing the upload is deliberate: by then the document has already left
 * the host, and a row that is absent because the expiration was unreadable would make `TBL-08` claim
 * the transfer never happened - the one thing it exists to be able to answer (`OPS-08`).
 */
const PROVIDER_RETENTION_HOURS = 48

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

/*
 * The shape the answer must take, stated in the dialect the provider's structured output speaks.
 *
 * It mirrors §7.2's debit-note branch field for field, out of the envelope pieces both branches
 * share (`geminiSchemaVocabulary.js`).
 *
 * **Every field is required and the nullable ones are declared nullable.** A schema that let the
 * model omit `amount` would get a document back with no amount and no statement that it could not be
 * read, which are different things (`DR-03`).
 */
const OCR_RESPONSE_SCHEMA = {
  type: SCHEMA_TYPE.OBJECT,
  properties: {
    debitNoteNumber: buildEnvelopeSchema({
      valueSchema: TEXT_VALUE_SCHEMA,
    }),
    amount: buildEnvelopeSchema({
      valueSchema: AMOUNT_VALUE_SCHEMA,
    }),
    pageCount: {
      type: SCHEMA_TYPE.INTEGER,
    },
    approvalBlocks: {
      type: SCHEMA_TYPE.ARRAY,
      items: {
        type: SCHEMA_TYPE.OBJECT,
        properties: {
          // A plain integer, not an envelope: the page is half of a block's identity rather than
          // one of its read values, so there is no per-reading provenance to carry (§7.2).
          pageNumber: {
            type: SCHEMA_TYPE.INTEGER,
          },
          blockLabel: buildEnvelopeSchema({
            valueSchema: TEXT_VALUE_SCHEMA,
          }),
          approverLastName: buildEnvelopeSchema({
            valueSchema: TEXT_VALUE_SCHEMA,
          }),
          approverDepartment: buildEnvelopeSchema({
            valueSchema: TEXT_VALUE_SCHEMA,
          }),
          isSignaturePresent: buildEnvelopeSchema({
            valueSchema: FLAG_VALUE_SCHEMA,
          }),
        },
        required: [
          'pageNumber',
          'blockLabel',
          'approverLastName',
          'approverDepartment',
          'isSignaturePresent',
        ],
      },
    },
  },
  required: [
    'debitNoteNumber',
    'amount',
    'pageCount',
    'approvalBlocks',
  ],
}

/**
 * Everything Gemini-specific about reading a debit note (`AI-03` `FR-091`).
 *
 * Three things happen here and nowhere else: the document is put where the provider can see it, the
 * request is configured the way this provider takes configuration, and `TBL-08` is written. A second
 * provider gets a sibling of this class - which is what `40-backend.md` §10 means by marking this
 * row "changes: yes" while the engine's row says no.
 *
 * **The upload is the moment a client document leaves the host** (`SEC-003` `ADR-07`), so it is
 * recorded before the reading is even asked for. An upload that went through and was not recorded
 * would be worse than a failed one.
 *
 * A per-model subclass adds one member: which model it is (`AI-04`).
 *
 * @abstract
 * @extends {BaseAiModelProcessor}
 */
export default class BaseGeminiAIProcessor extends BaseAiModelProcessor {
  /**
   * Resolve the sampling temperature these readings are taken at (`ENV-042`).
   *
   * **Unset is the default, and it means the provider's own** - which for Gemini 3 is 1.0, the value
   * it asks to be left at. That default is also what makes an agreement level a measurement: readings
   * have to differ for `TERM-15` to say anything, and a lower figure buys less variance rather than
   * more (`FR-140`).
   *
   * **A value that is not a temperature stops the process rather than being ignored.** An operator
   * measuring the setting (`OPS-13`) has to be able to trust that what they typed is what was sent;
   * silently falling back would leave the difference visible only in `TBL-06` afterwards, which is
   * the shape of failure `90-operations.md` §2.4 exists to prevent.
   *
   * @override
   * @returns {number | null} - The temperature, or null when nothing chose one.
   * @throws {Error} When the variable is set to something that is not a temperature.
   */
  static resolveTemperature () {
    const temperatureText = env.AI_TEMPERATURE

    if (!temperatureText) {
      return null
    }

    const temperature = Number(temperatureText)

    if (!Number.isFinite(temperature) || temperature < MINIMUM_TEMPERATURE || temperature > MAXIMUM_TEMPERATURE) {
      throw new Error(
        `AI_TEMPERATURE is ${temperatureText}, which is not a temperature between`
        + ` ${MINIMUM_TEMPERATURE} and ${MAXIMUM_TEMPERATURE}.`
        + ' Leave it empty to use the provider default, which is what Gemini 3 asks for.'
      )
    }

    return temperature
  }

  /**
   * get: Where this writes its operational record.
   *
   * A getter rather than a direct reference, so a test reads what was logged instead of the console
   * doing it (`OPS-09`).
   *
   * @returns {Console} - The logger.
   */
  get timber () {
    return timber
  }

  /**
   * get: Which provider this speaks to.
   *
   * @override
   * @returns {string} - Provider name.
   */
  get providerName () {
    return AI_PROVIDER.GEMINI.NAME
  }

  /**
   * get: How much of each page the model may look at.
   *
   * @returns {string} - Media resolution.
   */
  get mediaResolution () {
    return MEDIA_RESOLUTION
  }

  /**
   * get: How deeply the model may reason before answering.
   *
   * @returns {string} - Thinking level.
   */
  get thinkingLevel () {
    return THINKING_LEVEL
  }

  /**
   * get: How long an answer may run.
   *
   * @returns {number} - Maximum output tokens.
   */
  get maxOutputTokens () {
    return MAX_OUTPUT_TOKENS
  }

  /**
   * get: The shape the answer is held to.
   *
   * @returns {*} - Response schema.
   */
  get responseSchema () {
    return OCR_RESPONSE_SCHEMA
  }

  /**
   * get: What this processor's documents are, as the provider is told.
   *
   * **The provider is told twice and believes it both times**: once when the bytes are handed to
   * the Files API and once when the uploaded file is referenced in the request. Neither call looks
   * inside the bytes, so a document declared as something it is not uploads without complaint and
   * then fails at the read with `INVALID_ARGUMENT` - which names no field and points at nothing.
   *
   * It was a module constant reading `application/pdf`, applied to every upload including the
   * cover sheet. Measured against the provider on 2026-08-27: a workbook declared as a PDF is
   * refused at the read, and the same workbook declared as a workbook is read. The cover-sheet
   * read (`ENV-043`) had therefore never worked, and could not have - and because a refused
   * reading writes no `TBL-06` row, `API-Q005` answered a null `aiReading`, which is the same
   * answer it gives when the read is switched off (`FR-112`). A screen cannot tell those apart.
   *
   * @returns {string} - The MIME type.
   */
  get documentMimeType () {
    return PDF_MIME_TYPE
  }

  /**
   * Ask Gemini to read one document.
   *
   * @override
   * @param {import('../BaseAiModelProcessor.js').DebitNoteExtractionParams} params - Parameters of this method.
   * @returns {Promise<string | null>} - The answer, or null when it could not be obtained.
   */
  async requestExtraction ({
    batchFileId,
    filePath,
    fileName,
    now = new Date(),
  }) {
    const providerFileUri = await this.ensureProviderUpload({
      batchFileId,
      filePath,
      fileName,
      now,
    })

    if (!providerFileUri) {
      return null
    }

    const sendMessageToGeminiFetcher = this.createSendMessageToGeminiFetcher()

    const sendMessageToGeminiPayload = this.createSendMessageToGeminiPayload({
      params: this.buildOcrRequestParams({
        providerFileUri,
      }),
    })

    const requestedAtMilliseconds = Date.now()

    const ocrResponseCapsule = await sendMessageToGeminiFetcher.launchRequest(sendMessageToGeminiPayload)

    this.logProviderCall({
      batchFileId,
      latencyMilliseconds: Date.now() - requestedAtMilliseconds,
      providerErrorMessage: ocrResponseCapsule.extractErrorMessage(),
    })

    if (ocrResponseCapsule.hasError()) {
      return null
    }

    return ocrResponseCapsule.extractResponseText()
  }

  /**
   * Log what the provider call cost, and what it said when it refused (`OPS-09`).
   *
   * **These are the two figures that tell our bug from their outage.** A slow batch is diagnosed
   * from latency, and a refusal is diagnosed from the provider's own message - a quota, an
   * unsupported file, a bad key - which `FAIL-03` flattens into one code by the time the operator
   * sees it (`OPS-10`). The message was already dug out of the SDK's error by
   * `SendMessageToGeminiCapsule#extractErrorMessage()` and, until this line existed, thrown away.
   *
   * **Logged on the way through rather than only on failure**, because a call that succeeded slowly
   * is the thing `NFR-005` is measured against and it raises no error to hang a log line on.
   *
   * `providerErrorMessage` is null on a call that worked, which is the capsule's own answer rather
   * than a substitute: a line reading null says the provider did not refuse.
   *
   * Nothing here carries document content (`SEC-003`): the file is named by its row id, and what
   * the model read never reaches this line.
   *
   * @param {{
   *   batchFileId: number
   *   latencyMilliseconds: number
   *   providerErrorMessage: string | null
   * }} params - Parameters of this method.
   * @returns {void}
   */
  logProviderCall ({
    batchFileId,
    latencyMilliseconds,
    providerErrorMessage,
  }) {
    this.timber.info({
      providerName: this.providerName,
      modelName: this.modelName,
      batchFileId,
      latencyMilliseconds,
      providerErrorMessage,
    })
  }

  /**
   * Make sure the provider holds this document, and answer with what points at it.
   *
   * A document already uploaded and not yet expired is pointed at again rather than sent a second
   * time (`ST-03`): a retry of one file inside the provider's retention window is the common case,
   * and re-sending would be one more transfer of a client document for nothing.
   *
   * @param {import('../BaseAiModelProcessor.js').DebitNoteExtractionParams} params - Parameters of this method.
   * @returns {Promise<string | null>} - The uri, or null when the document could not be handed over.
   */
  async ensureProviderUpload ({
    batchFileId,
    filePath,
    fileName,
    now = new Date(),
  }) {
    const reusableUploadedFile = await this.findReusableUploadedFile({
      batchFileId,
      comparedAt: now,
    })

    if (reusableUploadedFile) {
      return /** @type {string} */ (
        reusableUploadedFile.get('providerFileUri')
      )
    }

    const uploadCapsule = await this.uploadDocument({
      filePath,
      fileName,
    })

    if (uploadCapsule.hasError()) {
      return null
    }

    const providerFileUri = uploadCapsule.extractUploadedFileUri()

    if (!providerFileUri) {
      return null
    }

    await this.saveUploadedFile({
      uploadedFileAttributes: this.buildUploadedFileAttributes({
        batchFileId,
        fileName,
        providerFileUri,
        uploadCapsule,
        now,
      }),
    })

    return providerFileUri
  }

  /**
   * Find an upload of this file the provider has not deleted yet.
   *
   * @param {{
   *   batchFileId: number
   *   comparedAt: Date
   * }} params - Parameters of this method.
   * @returns {Promise<GeminiUploadedFile | null>} - The upload, or null when there is none to reuse.
   */
  async findReusableUploadedFile ({
    batchFileId,
    comparedAt,
  }) {
    const uploadedFile = /** @type {GeminiUploadedFile | null} */ (
      await GeminiUploadedFile.findOne({
        where: {
          BatchFileId: batchFileId,
        },
      })
    )

    if (!uploadedFile) {
      return null
    }

    if (uploadedFile.isExpired({
      comparedAt,
    })) {
      return null
    }

    return uploadedFile
  }

  /**
   * Hand one document to the provider.
   *
   * @param {{
   *   filePath: string
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {Promise<import('../../geminiClient/UploadFileToGeminiCapsule.js').default>} - What the provider answered.
   */
  async uploadDocument ({
    filePath,
    fileName,
  }) {
    const uploadFileToGeminiFetcher = this.createUploadFileToGeminiFetcher()

    const uploadFileToGeminiPayload = this.createUploadFileToGeminiPayload({
      params: {
        fileBuffer: await readFile(filePath),
        fileName,
        mimeType: this.documentMimeType,
      },
    })

    return uploadFileToGeminiFetcher.launchRequest(uploadFileToGeminiPayload)
  }

  /**
   * Build the `TBL-08` row of one upload.
   *
   * What the provider stated is preferred over what this system would assume, for every column it
   * stated (`UploadFileToGeminiCapsule`).
   *
   * @param {{
   *   batchFileId: number
   *   fileName: string
   *   providerFileUri: string
   *   uploadCapsule: import('../../geminiClient/UploadFileToGeminiCapsule.js').default
   *   now: Date
   * }} params - Parameters of this method.
   * @returns {{
   *   BatchFileId: number
   *   providerFileUri: string
   *   providerFileName: string
   *   uploadedAt: Date
   *   expiresAt: Date
   * }} - The attributes.
   */
  buildUploadedFileAttributes ({
    batchFileId,
    fileName,
    providerFileUri,
    uploadCapsule,
    now,
  }) {
    const uploadedAt = this.readProviderTime({
      providerTime: uploadCapsule.extractUploadedFileCreateTime(),
      defaultTime: now,
    })

    return {
      BatchFileId: batchFileId,
      providerFileUri,
      providerFileName: uploadCapsule.extractUploadedFileName() ?? fileName,
      uploadedAt,
      expiresAt: this.readProviderTime({
        providerTime: uploadCapsule.extractUploadedFileExpirationTime(),
        defaultTime: this.buildDefaultExpiresAt({
          uploadedAt,
        }),
      }),
    }
  }

  /**
   * Read one time the provider stated, falling back when it stated none this system can read.
   *
   * @param {{
   *   providerTime: string | null
   *   defaultTime: Date
   * }} params - Parameters of this method.
   * @returns {Date} - The time.
   */
  readProviderTime ({
    providerTime,
    defaultTime,
  }) {
    if (!providerTime) {
      return defaultTime
    }

    const readTime = new Date(providerTime)

    if (Number.isNaN(readTime.getTime())) {
      return defaultTime
    }

    return readTime
  }

  /**
   * Build when the provider is assumed to delete a file it said nothing about.
   *
   * @param {{
   *   uploadedAt: Date
   * }} params - Parameters of this method.
   * @returns {Date} - The assumed expiration.
   */
  buildDefaultExpiresAt ({
    uploadedAt,
  }) {
    return new Date(
      uploadedAt.getTime() + (PROVIDER_RETENTION_HOURS * MILLISECONDS_PER_HOUR)
    )
  }

  /**
   * Record that this document is at the provider.
   *
   * The row is **replaced rather than added to** (`DR-06`): `TBL-08` holds one row per file, so a
   * retry after the previous upload expired must leave one record of where the file is now, not a
   * history of everywhere it has been.
   *
   * @param {{
   *   uploadedFileAttributes: {
   *     BatchFileId: number
   *     providerFileUri: string
   *     providerFileName: string
   *     uploadedAt: Date
   *     expiresAt: Date
   *   }
   * }} params - Parameters of this method.
   * @returns {Promise<GeminiUploadedFile>} - The recorded upload.
   */
  async saveUploadedFile ({
    uploadedFileAttributes,
  }) {
    return /** @type {Promise<GeminiUploadedFile>} */ (
      GeminiUploadedFile.beginTransaction(async transaction => {
        await GeminiUploadedFile.destroy({
          where: {
            BatchFileId: uploadedFileAttributes.BatchFileId,
          },
          transaction,
        })

        return GeminiUploadedFile.create(
          uploadedFileAttributes,
          {
            transaction,
          }
        )
      })
    )
  }

  /**
   * Build what one OCR request carries, in this system's own keys.
   *
   * The document travels as a reference to what was uploaded rather than as bytes, which is what
   * makes a retry cheap and what `TBL-08` exists to keep track of.
   *
   * @param {{
   *   providerFileUri: string
   * }} params - Parameters of this method.
   * @returns {{
   *   modelName: string
   *   contents: Array<*>
   *   instructionText: string
   *   mediaResolution: string
   *   thinkingLevel: string
   *   maxOutputTokens: number
   *   responseSchema: *
   *   temperature?: number
   * }} - Parameters of the request.
   */
  buildOcrRequestParams ({
    providerFileUri,
  }) {
    return {
      modelName: this.modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              [FILE_REFERENCE_KEY]: {
                fileUri: providerFileUri,
                mimeType: this.documentMimeType,
              },
            },
          ],
        },
      ],
      instructionText: this.ocrPrompt.instructionText,
      mediaResolution: this.mediaResolution,
      thinkingLevel: this.thinkingLevel,
      maxOutputTokens: this.maxOutputTokens,
      responseSchema: this.responseSchema,

      ...this.buildTemperatureRequestParams(),
    }
  }

  /**
   * Build the temperature this request carries, or nothing at all.
   *
   * **Omitted rather than sent as null**, because the two are different requests: omitting it leaves
   * Gemini 3 at the default it asks to be left at, and sending null asks the provider to interpret
   * an empty setting. Nothing chose a temperature unless `AI_TEMPERATURE` says so (`ENV-042`).
   *
   * @returns {{ temperature?: number }} - The setting, or an empty object.
   */
  buildTemperatureRequestParams () {
    if (this.temperature === null) {
      return {}
    }

    return {
      temperature: this.temperature,
    }
  }

  /**
   * Create the fetcher one OCR request is made through.
   *
   * @returns {SendMessageToGeminiFetcher} - The fetcher.
   */
  createSendMessageToGeminiFetcher () {
    return /** @type {SendMessageToGeminiFetcher} */ (
      SendMessageToGeminiFetcher.create()
    )
  }

  /**
   * Create the payload of one OCR request.
   *
   * @param {{
   *   params: *
   * }} params - Parameters of this method.
   * @returns {SendMessageToGeminiPayload} - The payload.
   */
  createSendMessageToGeminiPayload ({
    params,
  }) {
    return /** @type {SendMessageToGeminiPayload} */ (
      SendMessageToGeminiPayload.create({
        params,
      })
    )
  }

  /**
   * Create the fetcher one upload is made through.
   *
   * @returns {UploadFileToGeminiFetcher} - The fetcher.
   */
  createUploadFileToGeminiFetcher () {
    return /** @type {UploadFileToGeminiFetcher} */ (
      UploadFileToGeminiFetcher.create()
    )
  }

  /**
   * Create the payload of one upload.
   *
   * @param {{
   *   params: *
   * }} params - Parameters of this method.
   * @returns {UploadFileToGeminiPayload} - The payload.
   */
  createUploadFileToGeminiPayload ({
    params,
  }) {
    return /** @type {UploadFileToGeminiPayload} */ (
      UploadFileToGeminiPayload.create({
        params,
      })
    )
  }
}

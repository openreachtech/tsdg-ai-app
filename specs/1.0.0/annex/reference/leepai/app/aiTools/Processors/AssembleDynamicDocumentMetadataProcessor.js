import DocumentSkill from '../../../sequelize/models/DocumentSkill.js'
import DocumentSkillGenerationOutcome from '../../../sequelize/models/DocumentSkillGenerationOutcome.js'

import AssembleDynamicDocumentMetadataToolInputValidator from '../../tools/Validator/aiTools/AssembleDynamicDocumentMetadataToolInputValidator.js'
import IntegerNumberValueInspector from '../../tools/Inspector/IntegerNumberValueInspector.js'
import Timber from '../../tools/Timber.js'

import {
  require,
} from '../../globals/_.js'

const {
  DOCUMENT_SKILL_GENERATION_STATUS,
} = require('../../constants/aiConstants.cjs')

/**
 * Persists SKILL-style metadata for one dynamic document into {@link DocumentSkill}
 * and marks {@link DocumentSkillGenerationOutcome} complete or failed, without calling another AI model.
 * Structure mirrors employee mutation resolvers: validate → transaction callback → format response.
 * Validation and transaction failures persist a FAILED {@link DocumentSkillGenerationOutcome} when a
 * document id can be resolved, and return a plain error string (no throw) so tool pipelines receive a string.
 *
 * @class AssembleDynamicDocumentMetadataProcessor
 */
export default class AssembleDynamicDocumentMetadataProcessor {
  /**
   * Factory method.
   *
   * @returns {AssembleDynamicDocumentMetadataProcessor}
   */
  static create () {
    return new this()
  }

  /**
   * AI tool name (must match `ai_tools.payload` in `constants/aiToolsConstants.cjs`).
   *
   * @returns {string}
   */
  get aiToolName () {
    return 'assemble_dynamic_document_metadata'
  }

  /**
   * Entry point: validate, run DB work inside a transaction, return JSON string on success.
   * Validation and transaction failures return a plain error string after persisting FAILED outcome when possible.
   *
   * @param {{
   *   documentSelection: unknown
   *   name: unknown
   *   description: unknown
   *   contextHint?: unknown
   *   extraToolOptions?: AssembleExtraToolOptions
   * }} params
   * @returns {Promise<string>}
   */
  async process ({
    documentSelection,
    name,
    description,
    contextHint,
    extraToolOptions = {},
  }) {
    const validationErrorMessage = this.validateToolInput({
      contextHint,
      description,
      documentSelection,
      name,
    })

    if (validationErrorMessage) {
      return this.handleValidationFailureReturn({
        documentSelection,
        extraToolOptions,
        validationErrorMessage,
      })
    }

    const validatedToolArguments = /** @type {AssembleDynamicDocumentMetadataToolInput} */ ({
      contextHint,
      description,
      documentSelection,
      name,
    })

    const normalizedArguments = this.buildNormalizedToolArguments(validatedToolArguments)

    const documentSkillFieldValues = this.buildDocumentSkillFieldValues({
      contextHint: normalizedArguments.contextHint,
      description: normalizedArguments.description,
      name: normalizedArguments.name,
    })

    const generatedAt = new Date()

    const transactionCallback = this.generateTransactionCallback({
      documentId: normalizedArguments.documentId,
      documentSkillFieldValues,
      generatedAt,
    })

    return this.runDocumentSkillTransaction({
      transactionCallback,
    })
      .then(savedDocumentSkill =>
        this.formatResponse({
          normalizedArguments,
          savedDocumentSkill,
        })
      )
      .catch(async error => {
        Timber.log('[AssembleDynamicDocumentMetadataProcessor] document skill transaction failed', {
          error,
        })

        await this.persistFailedDocumentSkillGenerationOutcome({
          documentId: normalizedArguments.documentId,
          generationErrorMessage: error.message,
        })

        return error.message
      })
  }

  /**
   * Persist FAILED outcome when possible and return the same validation message string.
   *
   * @param {{
   *   documentSelection: unknown
   *   extraToolOptions: AssembleExtraToolOptions
   *   validationErrorMessage: string
   * }} params
   * @returns {Promise<string>}
   */
  async handleValidationFailureReturn ({
    documentSelection,
    extraToolOptions,
    validationErrorMessage,
  }) {
    const documentIdForFailedOutcome = this.resolveDocumentIdForFailedOutcome({
      documentSelection,
      extraToolOptions,
    })

    if (documentIdForFailedOutcome === null) {
      Timber.log(
        '[AssembleDynamicDocumentMetadataProcessor] validation failed; document id not resolved; outcome not persisted',
        {
          validationErrorMessage,
        }
      )

      return validationErrorMessage
    }

    await this.persistFailedDocumentSkillGenerationOutcome({
      documentId: documentIdForFailedOutcome,
      generationErrorMessage: validationErrorMessage,
    })

    return validationErrorMessage
  }

  /**
   * Resolve document primary key for a FAILED {@link DocumentSkillGenerationOutcome} row.
   * Prefers caller-supplied {@link AssembleExtraToolOptions#documentId}, else parses from tool arguments.
   *
   * @param {{
   *   documentSelection: unknown
   *   extraToolOptions: AssembleExtraToolOptions
   * }} params
   * @returns {number | null}
   */
  resolveDocumentIdForFailedOutcome ({
    extraToolOptions,
    documentSelection = null,
  }) {
    const optionInspector = IntegerNumberValueInspector.create({
      value: extraToolOptions.documentId,
    })

    const fromExtraToolOptions = this.extractPositiveIntegerDocumentIdFromInspector({
      inspector: optionInspector,
    })

    if (fromExtraToolOptions !== null) {
      return fromExtraToolOptions
    }

    if (documentSelection === null) {
      return null
    }

    const selection = /** @type {{ documentId?: unknown }} */ (documentSelection)

    const selectionInspector = IntegerNumberValueInspector.create({
      value: selection.documentId,
    })

    return this.extractPositiveIntegerDocumentIdFromInspector({
      inspector: selectionInspector,
    })
  }

  /**
   * @param {{
   *   inspector: IntegerNumberValueInspector
   * }} params
   * @returns {number | null}
   */
  extractPositiveIntegerDocumentIdFromInspector ({
    inspector,
  }) {
    if (!inspector.isIntegerLike()) {
      return null
    }

    const normalized = inspector.normalizeInteger()

    if (!Number.isInteger(normalized)) {
      return null
    }

    if (normalized <= 0) {
      return null
    }

    return normalized
  }

  /**
   * Find one {@link DocumentSkillGenerationOutcome} by document primary key.
   *
   * @param {{
   *   documentId: number
   *   transaction?: import('sequelize').Transaction
   * }} params
   * @returns {Promise<import('sequelize').Model | null>}
   */
  async findDocumentSkillGenerationOutcome ({
    documentId,
    transaction,
  }) {
    const queryOptions = {
      where: {
        DocumentId: documentId,
      },
    }

    if (transaction) {
      queryOptions.transaction = transaction
    }

    return DocumentSkillGenerationOutcome.findOne(queryOptions)
  }

  /**
   * Create a {@link DocumentSkillGenerationOutcome} row.
   *
   * @param {{
   *   transaction?: import('sequelize').Transaction
   *   values: object
   * }} params
   * @returns {Promise<import('sequelize').Model>}
   */
  async createDocumentSkillGenerationOutcome ({
    transaction,
    values,
  }) {
    const sequelizeOptions = {}

    if (transaction) {
      sequelizeOptions.transaction = transaction
    }

    return DocumentSkillGenerationOutcome.create(
      values,
      sequelizeOptions
    )
  }

  /**
   * Save changes on an existing {@link DocumentSkillGenerationOutcome} instance.
   *
   * @param {{
   *   outcome: import('sequelize').Model
   *   transaction?: import('sequelize').Transaction
   * }} params
   * @returns {Promise<import('sequelize').Model>}
   */
  async saveDocumentSkillGenerationOutcomeInstance ({
    outcome,
    transaction,
  }) {
    const saveOptions = {}

    if (transaction) {
      saveOptions.transaction = transaction
    }

    return outcome.save(saveOptions)
  }

  /**
   * @returns {Date}
   */
  generateCurrentDatetime () {
    return new Date()
  }

  /**
   * Persist a failed {@link DocumentSkillGenerationOutcome} without writing {@link DocumentSkill} rows.
   *
   * @param {{
   *   documentId: number
   *   generationErrorMessage: string
   * }} params
   * @returns {Promise<import('sequelize').Model | void>}
   */
  async persistFailedDocumentSkillGenerationOutcome ({
    documentId,
    generationErrorMessage,
  }) {
    const transactionCallback = this.generatePersistFailedDocumentSkillGenerationOutcomeTransactionCallback({
      documentId,
      generationErrorMessage,
    })

    return this.runDocumentSkillTransaction({
      transactionCallback,
    })
  }

  /**
   * Sequelize transaction callback for persisting a FAILED {@link DocumentSkillGenerationOutcome} only.
   *
   * @param {{
   *   documentId: number
   *   generationErrorMessage: string
   * }} params
   * @returns {(transaction: import('sequelize').Transaction) => Promise<import('sequelize').Model>}
   */
  generatePersistFailedDocumentSkillGenerationOutcomeTransactionCallback ({
    documentId,
    generationErrorMessage,
  }) {
    return async transaction => {
      const generatedAt = this.generateCurrentDatetime()
      const existing = await this.findDocumentSkillGenerationOutcome({
        documentId,
        transaction,
      })

      if (!existing) {
        return this.createDocumentSkillGenerationOutcome({
          transaction,
          values: {
            DocumentId: documentId,
            DocumentSkillGenerationStatusId: DOCUMENT_SKILL_GENERATION_STATUS.FAILED.ID,
            generatedAt,
            generationErrorMessage,
          },
        })
      }

      existing.set({
        DocumentSkillGenerationStatusId: DOCUMENT_SKILL_GENERATION_STATUS.FAILED.ID,
        generatedAt,
        generationErrorMessage,
      })

      return this.saveDocumentSkillGenerationOutcomeInstance({
        outcome: existing,
        transaction,
      })
    }
  }

  /**
   * Validate tool arguments (plain string errors, not GraphQL errors).
   *
   * @param {AssembleDynamicDocumentMetadataToolRawInput} params
   * @returns {string | null}
   */
  validateToolInput ({
    documentSelection,
    name,
    description,
    contextHint,
  }) {
    const validator = this.createToolInputValidator({
      input: {
        contextHint,
        description,
        documentSelection,
        name,
      },
    })

    return validator.validateInput()
  }

  /**
   * @param {{
   *   input: AssembleDynamicDocumentMetadataToolRawInput
   * }} params
   * @returns {import('../../tools/Validator/aiTools/AssembleDynamicDocumentMetadataToolInputValidator.js').default}
   */
  createToolInputValidator ({
    input,
  }) {
    return AssembleDynamicDocumentMetadataToolInputValidator.create({
      input,
    })
  }

  /**
   * @param {AssembleDynamicDocumentMetadataToolInput} params
   * @returns {NormalizedAssembleDynamicDocumentMetadataToolArguments}
   */
  buildNormalizedToolArguments ({
    documentSelection,
    name,
    description,
    contextHint,
  }) {
    const selection = /** @type {{ documentId: unknown, documentTitle: string }} */ (documentSelection)

    const documentId = IntegerNumberValueInspector.create({
      value: selection.documentId,
    })
      .normalizeInteger()

    const normalizedContextHint = this.normalizeOptionalTrimmedString({
      value: contextHint,
    })

    return {
      contextHint: normalizedContextHint,
      description: /** @type {string} */ (description).trim(),
      documentId,
      documentTitle: selection.documentTitle.trim(),
      name: /** @type {string} */ (name).trim(),
    }
  }

  /**
   * @param {{
   *   value?: unknown
   * }} params
   * @returns {string | null}
   */
  normalizeOptionalTrimmedString ({
    value = null,
  }) {
    if (value === null) {
      return null
    }

    if (typeof value !== 'string') {
      return null
    }

    const trimmed = value.trim()

    if (trimmed.length === 0) {
      return null
    }

    return trimmed
  }

  /**
   * Values persisted on {@link DocumentSkill} (per document; document title is not stored here).
   *
   * @param {{
   *   name: string
   *   description: string
   *   contextHint: string | null
   * }} params
   * @returns {DocumentSkillFieldValues}
   */
  buildDocumentSkillFieldValues ({
    name,
    description,
    contextHint,
  }) {
    return {
      contextHint,
      skillCoverageDescription: description,
      skillName: name,
    }
  }

  /**
   * Sequelize transaction callback (same role as mutation resolver `#generateTransactionCallback`).
   *
   * @param {{
   *   documentId: number
   *   generatedAt: Date
   *   documentSkillFieldValues: DocumentSkillFieldValues
   * }} params
   * @returns {(transaction: import('sequelize').Transaction) => Promise<DocumentSkill>}
   */
  generateTransactionCallback ({
    documentId,
    documentSkillFieldValues,
    generatedAt,
  }) {
    return async transaction => {
      const documentSkill = await this.saveDocumentSkill({
        documentId,
        documentSkillFieldValues,
        generatedAt,
        transaction,
      })

      await this.saveDocumentSkillGenerationOutcome({
        documentId,
        generatedAt,
        transaction,
      })

      return documentSkill
    }
  }

  /**
   * Run the Sequelize transaction that persists {@link DocumentSkill} and outcome rows.
   *
   * @param {{
   *   transactionCallback: (transaction: import('sequelize').Transaction) => Promise<import('sequelize').Model>
   * }} params
   * @returns {Promise<import('sequelize').Model>}
   */
  async runDocumentSkillTransaction ({
    transactionCallback,
  }) {
    return DocumentSkill.beginTransaction(
      transactionCallback
    )
  }

  /**
   * @param {{
   *   documentId: number
   *   documentSkillFieldValues: DocumentSkillFieldValues
   *   generatedAt: Date
   *   transaction: import('sequelize').Transaction
   * }} params
   * @returns {Promise<DocumentSkill>}
   */
  async saveDocumentSkill ({
    documentId,
    documentSkillFieldValues,
    generatedAt,
    transaction,
  }) {
    const existingDocumentSkill = await DocumentSkill.findOne({
      transaction,
      where: {
        DocumentId: documentId,
      },
    })

    if (!existingDocumentSkill) {
      return DocumentSkill.create(
        {
          ...documentSkillFieldValues,
          DocumentId: documentId,
          generatedAt,
        },
        {
          transaction,
        }
      )
    }

    existingDocumentSkill.set({
      ...documentSkillFieldValues,
      generatedAt,
    })

    return existingDocumentSkill.save({
      transaction,
    })
  }

  /**
   * @param {{
   *   documentId: number
   *   generatedAt: Date
   *   transaction: import('sequelize').Transaction
   * }} params
   * @returns {Promise<void>}
   */
  async saveDocumentSkillGenerationOutcome ({
    documentId,
    generatedAt,
    transaction,
  }) {
    const existingOutcome = await this.findDocumentSkillGenerationOutcome({
      documentId,
      transaction,
    })

    if (!existingOutcome) {
      await this.createDocumentSkillGenerationOutcome({
        transaction,
        values: {
          DocumentId: documentId,
          DocumentSkillGenerationStatusId: DOCUMENT_SKILL_GENERATION_STATUS.COMPLETE.ID,
          generatedAt,
          generationErrorMessage: null,
        },
      })

      return
    }

    existingOutcome.set({
      DocumentSkillGenerationStatusId: DOCUMENT_SKILL_GENERATION_STATUS.COMPLETE.ID,
      generatedAt,
      generationErrorMessage: null,
    })

    await this.saveDocumentSkillGenerationOutcomeInstance({
      outcome: existingOutcome,
      transaction,
    })
  }

  /**
   * Format successful tool output (JSON string for the model).
   *
   * @param {{
   *   savedDocumentSkill: DocumentSkill
   *   normalizedArguments: NormalizedAssembleDynamicDocumentMetadataToolArguments
   * }} params
   * @returns {string}
   */
  formatResponse ({
    savedDocumentSkill,
    normalizedArguments,
  }) {
    const responseBody = {
      description: normalizedArguments.description,
      documentId: normalizedArguments.documentId,
      documentSkillId: savedDocumentSkill.id,
      documentTitle: normalizedArguments.documentTitle,
      name: normalizedArguments.name,
      isPersisted: true,
    }

    return JSON.stringify(responseBody)
  }
}

/**
 * @typedef {{
 *   documentId?: number
 *   toolName?: string
 * }} AssembleExtraToolOptions
 */

/**
 * Raw AI tool arguments before validation (runtime shapes may be invalid).
 *
 * @typedef {{
 *   documentSelection: unknown
 *   name: unknown
 *   description: unknown
 *   contextHint?: unknown
 * }} AssembleDynamicDocumentMetadataToolRawInput
 */

/**
 * Validated tool arguments (after {@link AssembleDynamicDocumentMetadataToolInputValidator#validateInput} returns null).
 *
 * @typedef {{
 *   documentSelection: {
 *     documentId: number
 *     documentTitle: string
 *   }
 *   name: string
 *   description: string
 *   contextHint?: string | null
 * }} AssembleDynamicDocumentMetadataToolInput
 */

/**
 * @typedef {{
 *   documentId: number
 *   documentTitle: string
 *   name: string
 *   description: string
 *   contextHint: string | null
 * }} NormalizedAssembleDynamicDocumentMetadataToolArguments
 */

/**
 * @typedef {{
 *   skillName: string
 *   skillCoverageDescription: string
 *   contextHint: string | null
 * }} DocumentSkillFieldValues
 */

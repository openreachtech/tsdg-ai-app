import {
  Op,
} from 'sequelize'

import Document from '../../../sequelize/models/Document.js'

import IntegerNumberValueInspector from '../../tools/Inspector/IntegerNumberValueInspector.js'
import RetrieveDynamicDocumentsToolInputValidator from '../../tools/Validator/aiTools/RetrieveDynamicDocumentsToolInputValidator.js'

/**
 * Fetches `Document` bodies for dynamic-attachment tool calls and returns them as XML
 * (`retrieve_dynamic_documents_result`).
 *
 * Phase-1 (A2) note: per-document access control (permission categories, sharing, creator
 * linkages, roles) is intentionally omitted here — the full ACL is restored in Phase 1.5.
 * Documents are returned by id in request order.
 *
 * @class RetrieveDynamicDocumentsProcessor
 */
export default class RetrieveDynamicDocumentsProcessor {
  /**
   * Factory method.
   *
   * @returns {RetrieveDynamicDocumentsProcessor}
   */
  static create () {
    return new this()
  }

  /**
   * @returns {string}
   */
  get aiToolName () {
    return 'retrieve_dynamic_documents'
  }

  /**
   * @param {{
   *   documentIds: unknown
   *   contextHint?: unknown
   *   extraToolOptions?: object
   * }} [params]
   * @returns {Promise<string>}
   */
  async process ({
    contextHint,
    documentIds,
    extraToolOptions = {},
  } = {}) {
    const inputError = this.validateToolInput({
      contextHint,
      documentIds,
    })

    if (inputError) {
      return inputError
    }

    const normalized = this.buildNormalizedProcessArguments({
      contextHint,
      documentIds,
    })

    const documentRows = await this.findDocuments({
      documentIds: normalized.documentIds,
    })

    const documentByPrimaryKey = this.buildDocumentRowsByPrimaryKey({
      documentRows,
    })

    const payload = this.buildRetrievedDocumentsPayload({
      documentByPrimaryKey,
      orderedDocumentIds: normalized.documentIds,
    })

    return this.formatResponse({
      payload,
    })
  }

  /**
   * @param {{
   *   contextHint: unknown
   *   documentIds: unknown
   * }} params
   * @returns {string | null}
   */
  validateToolInput ({
    contextHint,
    documentIds,
  }) {
    const validator = this.createToolInputValidator({
      input: {
        contextHint,
        documentIds,
      },
    })

    return validator.validateInput()
  }

  /**
   * @param {{
   *   input: {
   *     documentIds: unknown
   *     contextHint?: unknown
   *   }
   * }} params
   * @returns {RetrieveDynamicDocumentsToolInputValidator}
   */
  createToolInputValidator ({
    input,
  }) {
    return RetrieveDynamicDocumentsToolInputValidator.create({
      input,
    })
  }

  /**
   * @param {{
   *   contextHint: unknown
   *   documentIds: unknown
   * }} params
   * @returns {{
   *   contextHint: string | null
   *   documentIds: Array<number>
   * }}
   */
  buildNormalizedProcessArguments ({
    contextHint,
    documentIds,
  }) {
    const documentIdInputValues = /** @type {Array<unknown>} */ (documentIds)
    const normalizedDocumentIds = documentIdInputValues
      .map(documentIdValue =>
        IntegerNumberValueInspector.create({
          value: documentIdValue,
        })
          .normalizeInteger()
      )

    return {
      contextHint: this.normalizeOptionalTrimmedString({
        value: contextHint,
      }),
      documentIds: normalizedDocumentIds,
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
  } = {}) {
    if (!value) {
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
   * @param {{
   *   documentIds: Array<number>
   * }} params
   * @returns {Promise<Array<import('sequelize').Model>>}
   */
  async findDocuments ({
    documentIds,
  }) {
    if (documentIds.length === 0) {
      return []
    }

    return /** @type {Promise<Array<import('sequelize').Model>>} */ (
      Document.findAll({
        where: {
          id: {
            [Op.in]: documentIds,
          },
        },
      })
    )
  }

  /**
   * @param {{
   *   documentRows: Array<import('sequelize').Model>
   * }} params
   * @returns {Map<number, import('sequelize').Model>}
   */
  buildDocumentRowsByPrimaryKey ({
    documentRows,
  }) {
    return new Map(
      documentRows.map(documentRow =>
        [
          /** @type {number} */ (documentRow.id),
          documentRow,
        ]
      )
    )
  }

  /**
   * @param {{
   *   documentByPrimaryKey: Map<number, *>
   *   orderedDocumentIds: Array<number>
   * }} params
   * @returns {Array<import('sequelize').Model | null>}
   */
  pickOrderedDocumentRows ({
    documentByPrimaryKey,
    orderedDocumentIds,
  }) {
    return orderedDocumentIds
      .map(documentId =>
        documentByPrimaryKey.get(documentId) ?? null
      )
  }

  /**
   * @param {{
   *   documentByPrimaryKey: Map<number, *>
   *   orderedDocumentIds: Array<number>
   * }} params
   * @returns {{
   *   documentIds: Array<number>
   *   documents: Array<RetrieveDynamicDocumentsDocumentBlock>
   * }}
   */
  buildRetrievedDocumentsPayload ({
    documentByPrimaryKey,
    orderedDocumentIds,
  }) {
    const rowsInRequestOrder = this.pickOrderedDocumentRows({
      documentByPrimaryKey,
      orderedDocumentIds,
    })

    const retrievedBlocks = rowsInRequestOrder
      .map(requestedDocumentRow =>
        this.mapRowToRetrievedBlockOrOmission({
          document: requestedDocumentRow,
        })
      )
      .filter(candidateBlock =>
        candidateBlock !== null
      )

    return {
      documentIds: retrievedBlocks
        .map(retrievedBlock =>
          retrievedBlock.documentId
        ),
      documents: retrievedBlocks,
    }
  }

  /**
   * @param {{
   *   document: (import('sequelize').Model | null)
   * }} params
   * @returns {RetrieveDynamicDocumentsDocumentBlock | null}
   */
  mapRowToRetrievedBlockOrOmission ({
    document,
  }) {
    if (document === null) {
      return null
    }

    const {
      id,
    } = document
    const documentId = /** @type {number} */ (id)

    return {
      documentBody: document.content,
      documentId,
      documentTitle: document.name,
    }
  }

  /**
   * @param {{
   *   payload: {
   *     documentIds: Array<number>
   *     documents: Array<RetrieveDynamicDocumentsDocumentBlock>
   *   }
   * }} params
   * @returns {string}
   */
  formatResponse ({
    payload,
  }) {
    const documentIdentifierLines = payload.documentIds
      .map(documentId =>
        `    <document_id>${documentId}</document_id>`
      )

    const documentEntryLines = payload.documents
      .map(documentBlock =>
        this.buildDocumentEntryXml({
          documentBlock,
        })
      )

    const documentIdentifiersSection = [
      '  <document_ids>',
      ...documentIdentifierLines,
      '  </document_ids>',
    ].join('\n')

    const documentsSection = [
      '  <documents>',
      ...documentEntryLines,
      '  </documents>',
    ].join('\n')

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<retrieve_dynamic_documents_result>',
      documentIdentifiersSection,
      documentsSection,
      '</retrieve_dynamic_documents_result>',
    ].join('\n')
  }

  /**
   * One document block as XML under `<documents>`.
   *
   * @param {{
   *   documentBlock: RetrieveDynamicDocumentsDocumentBlock
   * }} params
   * @returns {string}
   */
  buildDocumentEntryXml ({
    documentBlock,
  }) {
    const escapedTitle = this.escapeXmlText({
      text: documentBlock.documentTitle,
    })
    const escapedBody = this.escapeXmlText({
      text: documentBlock.documentBody,
    })

    return [
      '    <document>',
      `      <document_id>${documentBlock.documentId}</document_id>`,
      `      <document_title>${escapedTitle}</document_title>`,
      `      <document_body>${escapedBody}</document_body>`,
      '    </document>',
    ].join('\n')
  }

  /**
   * Minimal XML text escaping for element text.
   *
   * @param {{
   *   text: string | null | undefined
   * }} params
   * @returns {string}
   */
  escapeXmlText ({
    text,
  }) {
    if (!text) {
      return ''
    }

    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
  }
}

/**
 * @typedef {{
 *   documentBody: string
 *   documentId: number
 *   documentTitle: string
 * }} RetrieveDynamicDocumentsDocumentBlock
 */

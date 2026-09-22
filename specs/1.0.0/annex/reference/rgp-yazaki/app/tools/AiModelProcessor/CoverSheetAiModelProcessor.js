import AI_MODEL_NAME_CONSTANT_HASH from '../../constants/aiModelName.js'
import BATCH_FILE_KIND_CONSTANT_HASH from '../../constants/batchFileKind.js'

import BaseGeminiAIProcessor from '../BaseAiModelProviderProcessor/BaseGeminiAIProcessor.js'
import {
  AMOUNT_VALUE_SCHEMA,
  buildEnvelopeSchema,
  SCHEMA_TYPE,
  TEXT_VALUE_SCHEMA,
} from '../BaseAiModelProviderProcessor/geminiSchemaVocabulary.js'
import CoverSheetOcrPrompt from '../CoverSheetOcrPrompt.js'

const {
  AI_MODEL_NAME,
} = AI_MODEL_NAME_CONSTANT_HASH

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH

/*
 * What an `.xlsx` cover sheet is, as the provider is told.
 *
 * The long name is the registered one for the format Excel writes; there is no shorter spelling the
 * provider accepts. Declaring it is what makes the read possible at all - see
 * `BaseGeminiAIProcessor#get:documentMimeType`.
 */
const WORKBOOK_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/*
 * The shape a cover-sheet answer must take (§7.2 cover-sheet branch).
 *
 * **`rowNumber` and a subtotal's `currencyCode` are plain and required**, because they are identity
 * rather than read values: `ENG-04` matches a read row to a parsed row by the number and a subtotal
 * to a subtotal by the currency, and there is nothing else to tell two of either apart. Making them
 * nullable would let the model hand back rows nothing could ever be compared against.
 *
 * **No `approvalBlocks` and no `pageCount`.** It is a spreadsheet: there is nothing to sign and no
 * page to count, and a field that could only ever be null is a field a reader has to ask about.
 */
const COVER_SHEET_RESPONSE_SCHEMA = {
  type: SCHEMA_TYPE.OBJECT,
  properties: {
    sheetName: buildEnvelopeSchema({
      valueSchema: TEXT_VALUE_SCHEMA,
    }),
    rows: {
      type: SCHEMA_TYPE.ARRAY,
      items: {
        type: SCHEMA_TYPE.OBJECT,
        properties: {
          rowNumber: {
            type: SCHEMA_TYPE.INTEGER,
          },
          debitNoteNumber: buildEnvelopeSchema({
            valueSchema: TEXT_VALUE_SCHEMA,
          }),
          currencyCode: buildEnvelopeSchema({
            valueSchema: TEXT_VALUE_SCHEMA,
          }),
          amount: buildEnvelopeSchema({
            valueSchema: AMOUNT_VALUE_SCHEMA,
          }),
        },
        required: [
          'rowNumber',
          'debitNoteNumber',
          'currencyCode',
          'amount',
        ],
      },
    },
    statedSubtotals: {
      type: SCHEMA_TYPE.ARRAY,
      items: {
        type: SCHEMA_TYPE.OBJECT,
        properties: {
          currencyCode: {
            type: SCHEMA_TYPE.STRING,
          },
          amount: buildEnvelopeSchema({
            valueSchema: AMOUNT_VALUE_SCHEMA,
          }),
        },
        required: [
          'currencyCode',
          'amount',
        ],
      },
    },
  },
  required: [
    'sheetName',
    'rows',
    'statedSubtotals',
  ],
}

/**
 * Gemini reading a cover sheet, as the second opinion that never judges (`AI-05` `FR-110`).
 *
 * **A sibling of the per-model debit-note processor rather than a tier of its own**: same client,
 * same model, same repeat loop. What differs is the three things a reading of a different document
 * has to differ in - the prompt, the schema the answer is held to, and the branch of §7.2 the answer
 * is normalized into. Everything else about talking to this provider is inherited.
 *
 * **What it reads is never the client's workbook.** `JOB-01` hands it a single-worksheet file the
 * judged worksheet was extracted into (`ADR-23`), so the six previous months the real workbook
 * carries never leave the host - and the reading's own `sheetName` is checked afterwards, because a
 * bug in that extraction would otherwise surface as a disagreement we caused (`SEC-009`).
 *
 * **It is reached only where `ENV-043` says so**, and that switch is checked independently of
 * `AI_PROVIDER`: a decision to send debit note scans is not a decision to send the workbook, which
 * carries every debit note number and every amount of a month in one structured file (`SEC-009`
 * `ADR-16` `OPEN-3`).
 *
 * @extends {BaseGeminiAIProcessor}
 */
export default class CoverSheetAiModelProcessor extends BaseGeminiAIProcessor {
  /**
   * Create the prompt this processor asks with.
   *
   * @override
   * @returns {CoverSheetOcrPrompt} - The prompt.
   */
  static createOcrPrompt () {
    return CoverSheetOcrPrompt.create()
  }

  /**
   * get: Which model this is.
   *
   * **The same model the debit notes are read with**, which is why "which model" does not identify a
   * processor on its own and the loader dispatches on the kind of file as well. A second model would
   * bring a second pair of these classes rather than a branch inside either of them (`ENV-032`).
   *
   * @override
   * @returns {string} - Model name.
   */
  get modelName () {
    return AI_MODEL_NAME.GEMINI_3_7_FLASH
  }

  /**
   * get: Which kind of file this reads.
   *
   * @override
   * @returns {string} - Batch file kind name.
   */
  get batchFileKindName () {
    return BATCH_FILE_KIND.COVER_SHEET.NAME
  }

  /**
   * get: The shape the answer is held to.
   *
   * @override
   * @returns {*} - Response schema.
   */
  get responseSchema () {
    return COVER_SHEET_RESPONSE_SCHEMA
  }

  /**
   * get: What this processor's documents are, as the provider is told.
   *
   * A workbook, which is the one thing that separates this processor's request from the debit note
   * one. `DR-01` keeps the two subjects apart everywhere else; here they differ in a header.
   *
   * @override
   * @returns {string} - The MIME type.
   */
  get documentMimeType () {
    return WORKBOOK_MIME_TYPE
  }

  /**
   * Build the extraction the engine reads from the provider's answer.
   *
   * §7.2 is one interface with two shapes, and this is how a processor says which of them it
   * answers in. The envelope reading underneath is the same for both, which is why this is a line
   * rather than a second hierarchy.
   *
   * @override
   * @param {{
   *   responseBody: string
   * }} params - Parameters of this method.
   * @returns {*} - The extraction, empty when the answer was unusable.
   */
  buildNormalizedExtraction ({
    responseBody,
  }) {
    return this.buildNormalizedCoverSheetExtraction({
      responseBody,
    })
  }
}

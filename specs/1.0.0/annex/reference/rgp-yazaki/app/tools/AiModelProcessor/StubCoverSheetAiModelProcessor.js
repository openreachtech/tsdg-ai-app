import AI_MODEL_NAME_CONSTANT_HASH from '../../constants/aiModelName.js'
import AI_PROVIDER_CONSTANT_HASH from '../../constants/aiProvider.js'
import BATCH_FILE_KIND_CONSTANT_HASH from '../../constants/batchFileKind.js'
import STUB_COVER_SHEET_EXTRACTION_CONSTANT_HASH from '../../constants/stubCoverSheetExtraction.js'

import BaseAiModelProcessor from '../BaseAiModelProcessor.js'
import CoverSheetOcrPrompt from '../CoverSheetOcrPrompt.js'

const {
  AI_MODEL_NAME,
} = AI_MODEL_NAME_CONSTANT_HASH

const {
  AI_PROVIDER,
} = AI_PROVIDER_CONSTANT_HASH

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH

const {
  STUB_COVER_SHEET_EXTRACTION,
} = STUB_COVER_SHEET_EXTRACTION_CONSTANT_HASH

/*
 * The page every value of a worksheet is reported on.
 *
 * A rendered worksheet is one page to a reader, and the fixture table says nothing about where on it
 * anything sits - so a page travels and a region never does, exactly as the debit note's stub
 * answers. Claiming a region would be claiming to have located something on a page this processor
 * never opened, and `FR-131` exists so that "not located" can be said rather than guessed at.
 */
const FIRST_PAGE_NUMBER = 1

/**
 * The driver that reads the mock cover sheets and calls nobody (`AI-05` `NFR-041` `SEC-004`).
 *
 * **`ENV-043` is the only gate, and this class is why that can be true** (`FR-112`). Switching the
 * cover-sheet read on under `stub` still produces readings and still runs check ⑤; what it skips is
 * the upload, so `TBL-06` fills and `TBL-08` stays empty. A driver that could turn a check off would
 * make the stub a way of disabling verification rather than a way of running it offline.
 *
 * **What it answers is what a reader looking at the rendered sheet sees, not what the cells hold**,
 * and on one fixture those differ. `constants/stubCoverSheetExtraction.cjs` carries the reasoning;
 * the short version is that a stub answering with a second parse would agree with the first by
 * construction, and `ENG-04` would be a check that can never find anything.
 *
 * It answers JSON and lets the base parse it back, exactly as the debit note's stub does. That is
 * not a detour: the parsing is where an answer is held to §7.2 without being trusted, and a stub
 * that skipped it would be the one caller whose answer never went through the check every other
 * answer does.
 *
 * @extends {BaseAiModelProcessor}
 */
export default class StubCoverSheetAiModelProcessor extends BaseAiModelProcessor {
  /**
   * Constructor.
   *
   * @param {{
   *   ocrPrompt: import('../BaseOcrPrompt.js').default
   *   temperature: number | null
   *   stubCoverSheetExtractionHash: Record<string, StubCoverSheetReading>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    ocrPrompt,
    temperature,

    stubCoverSheetExtractionHash,
  }) {
    super({
      ocrPrompt,
      temperature,
    })

    this.stubCoverSheetExtractionHash = stubCoverSheetExtractionHash
  }

  /**
   * Factory method.
   *
   * @param {{
   *   ocrPrompt?: import('../BaseOcrPrompt.js').default
   *   temperature?: number | null
   *   stubCoverSheetExtractionHash?: Record<string, StubCoverSheetReading>
   * }} [params] - Parameters of this method.
   * @returns {StubCoverSheetAiModelProcessor} - Instance of this class.
   */
  static create ({
    ocrPrompt = this.createOcrPrompt(),
    temperature = this.resolveTemperature(),

    stubCoverSheetExtractionHash = STUB_COVER_SHEET_EXTRACTION,
  } = {}) {
    return new this({
      ocrPrompt,
      temperature,

      stubCoverSheetExtractionHash,
    })
  }

  /**
   * Create the prompt this processor asks with.
   *
   * Carried even though nothing is sent anywhere, because `TBL-06.prompt_version` is recorded for a
   * stub run too - and a reading whose version said nothing would be one the evaluation could not
   * place beside the readings a provider took (`FR-036`).
   *
   * @override
   * @returns {CoverSheetOcrPrompt} - The prompt.
   */
  static createOcrPrompt () {
    return CoverSheetOcrPrompt.create()
  }

  /**
   * get: Which provider this speaks to, which is itself.
   *
   * @override
   * @returns {string} - Provider name.
   */
  get providerName () {
    return AI_PROVIDER.STUB.NAME
  }

  /**
   * get: Which model this is.
   *
   * @override
   * @returns {string} - Model name.
   */
  get modelName () {
    return AI_MODEL_NAME.STUB
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
   * Answer for one worksheet, without leaving the host.
   *
   * @override
   * @param {import('../BaseAiModelProcessor.js').DocumentExtractionParams} params - Parameters of this method.
   * @returns {Promise<string>} - The answer.
   */
  async requestExtraction ({
    fileName,
  }) {
    return JSON.stringify(
      this.buildAnsweredExtraction({
        fileName,
      })
    )
  }

  /**
   * Build the answer a provider would have sent for one cover sheet (§7.2 cover-sheet branch).
   *
   * **A workbook with no fixture answers as unread**, which is the honest answer from a reader that
   * has never seen the file. It matters beyond the tests: the default driver meeting a real cover
   * sheet says it read nothing rather than something plausible, so check ⑤ never compares the parse
   * against a reading nobody took (`DR-03`).
   *
   * **The same answer every time, however many readings are asked for.** The debit note's stub has
   * two documents that answer differently between readings, because a hand-corrected total is a
   * judgment rather than a transcription; a spreadsheet cell is neither, so there is nothing here
   * for two careful readers to differ about and a stub that varied at random would make a green
   * suite depend on which figure came back (`NFR-041`).
   *
   * @param {{
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The answer, in the shape a provider answers in.
   */
  buildAnsweredExtraction ({
    fileName,
  }) {
    const reading = this.findStubCoverSheetReading({
      fileName,
    })

    if (!reading) {
      return this.buildEmptyNormalizedCoverSheetExtraction()
    }

    return {
      sheetName: this.buildAnsweredEnvelope({
        value: reading.sheetName,
      }),
      rows: reading.rows
        .map(row => this.buildAnsweredRow({
          row,
        })),
      statedSubtotals: reading.statedSubtotals
        .map(statedSubtotal => this.buildAnsweredStatedSubtotal({
          statedSubtotal,
        })),
    }
  }

  /**
   * Find what this processor knows about one cover sheet.
   *
   * @param {{
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {StubCoverSheetReading | null} - The reading, or null when the file is not in the table.
   */
  findStubCoverSheetReading ({
    fileName,
  }) {
    return this.stubCoverSheetExtractionHash[fileName]
      ?? null
  }

  /**
   * Build the answer for one line item row.
   *
   * @param {{
   *   row: StubCoverSheetReadingRow
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The row, in the shape a provider answers in.
   */
  buildAnsweredRow ({
    row,
  }) {
    return {
      rowNumber: row.rowNumber,
      debitNoteNumber: this.buildAnsweredEnvelope({
        value: row.debitNoteNumber,
      }),
      currencyCode: this.buildAnsweredEnvelope({
        value: row.currencyCode,
      }),
      amount: this.buildAnsweredEnvelope({
        value: {
          amount: row.amount,
          currencyCode: row.currencyCode,
        },
      }),
    }
  }

  /**
   * Build the answer for one stated subtotal.
   *
   * @param {{
   *   statedSubtotal: StubCoverSheetReadingSubtotal
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The subtotal, in the shape a provider answers in.
   */
  buildAnsweredStatedSubtotal ({
    statedSubtotal,
  }) {
    return {
      currencyCode: statedSubtotal.currencyCode,
      amount: this.buildAnsweredEnvelope({
        value: {
          amount: statedSubtotal.amount,
          currencyCode: statedSubtotal.currencyCode,
        },
      }),
    }
  }

  /**
   * Wrap one fixture value in the provenance envelope §7.2 asks for.
   *
   * @param {{
   *   value: *
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The envelope.
   */
  buildAnsweredEnvelope ({
    value,
  }) {
    return {
      value,
      pageNumber: FIRST_PAGE_NUMBER,
      region: null,
    }
  }

  /**
   * Build the extraction the engine reads from this processor's own answer.
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

/**
 * @typedef {{
 *   sheetName: string
 *   rows: Array<StubCoverSheetReadingRow>
 *   statedSubtotals: Array<StubCoverSheetReadingSubtotal>
 * }} StubCoverSheetReading
 */

/**
 * @typedef {{
 *   rowNumber: number
 *   debitNoteNumber: string
 *   currencyCode: string
 *   amount: string
 * }} StubCoverSheetReadingRow
 */

/**
 * @typedef {{
 *   currencyCode: string
 *   amount: string
 * }} StubCoverSheetReadingSubtotal
 */

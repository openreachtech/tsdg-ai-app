import AI_MODEL_NAME_CONSTANT_HASH from '../../constants/aiModelName.js'
import AI_PROVIDER_CONSTANT_HASH from '../../constants/aiProvider.js'
import BATCH_FILE_KIND_CONSTANT_HASH from '../../constants/batchFileKind.js'
import STUB_OCR_EXTRACTION_CONSTANT_HASH from '../../constants/stubOcrExtraction.js'

import BaseAiModelProcessor from '../BaseAiModelProcessor.js'

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
  STUB_OCR_EXTRACTION,
} = STUB_OCR_EXTRACTION_CONSTANT_HASH

/*
 * The page the document number and the total are read from.
 *
 * Both sit on page 1 of every mock document, and for the total that is not a property of the mocks
 * but of the contract: `ADR-22` reads it from page 1 or not at all.
 */
const FIRST_PAGE_NUMBER = 1

/**
 * The driver that reads the mock documents and calls nobody (`AI-03` `NFR-041` `SEC-004`).
 *
 * **This is the default in every environment** (`ENV-030` `ADR-12`), which is why it is a processor
 * rather than a test double: the whole pipeline - the job, the three checks, the report - runs on a
 * machine with no API key and no outbound access, and what it runs is the real code path. A stub
 * reachable only from tests would leave the production path unexercised until the day a key arrives.
 *
 * **A run of this processor leaves `TBL-08` empty**, because nothing was uploaded anywhere. A stub
 * run that produced a row there is a bug, and a useful one to assert.
 *
 * It answers JSON, exactly as a provider would, and lets the base parse it back. That is not a
 * detour: the parsing is where a provider's answer is held to §7.2 without being trusted, and a stub
 * that skipped it would be the one caller whose answer never went through the check every other
 * answer does.
 *
 * **The fixture table is flat and this class does the wrapping.** `constants/stubOcrExtraction.cjs`
 * states what each mock document says - one line per document, so the set reads as a table and the
 * generator can build the documents from the same rows. Turning those rows into the provenance
 * envelopes of §7.2 is a processor's job, not a constant's.
 *
 * **It reports pages and never a region.** The page a value is on is something the table knows; a
 * region would be a claim to have located something on a page this processor never opened, and
 * `FR-131` exists so that "not located" can be said rather than guessed at.
 *
 * **Two documents answer differently from one reading to the next, and nothing else does**
 * (`NFR-041` `FR-140`). A page whose total was corrected by hand shows more than one figure, and
 * which one is "the total" is a judgment rather than a transcription - so `FAKE-DN-1010` and
 * `FAKE-DN-1011` are read here the way two careful readers would read them, and `ENG-05` has a
 * disagreement to reduce with no key and no network. Every other document answers the same thing
 * however many times it is read: a stub that varied at random would make a green suite depend on
 * which figure came back.
 *
 * @extends {BaseAiModelProcessor}
 */
export default class StubAiModelProcessor extends BaseAiModelProcessor {
  /**
   * Constructor.
   *
   * @param {{
   *   ocrPrompt: import('../BaseOcrPrompt.js').default
   *   temperature: number | null
   *   stubOcrExtractionHash: Record<string, StubDebitNoteReading>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    ocrPrompt,
    temperature,

    stubOcrExtractionHash,
  }) {
    super({
      ocrPrompt,
      temperature,
    })

    this.stubOcrExtractionHash = stubOcrExtractionHash
  }

  /**
   * Factory method.
   *
   * @param {{
   *   ocrPrompt?: import('../BaseOcrPrompt.js').default
   *   temperature?: number | null
   *   stubOcrExtractionHash?: Record<string, StubDebitNoteReading>
   * }} [params] - Parameters of this method.
   * @returns {StubAiModelProcessor} - Instance of this class.
   */
  static create ({
    ocrPrompt = this.createOcrPrompt(),
    temperature = this.resolveTemperature(),

    stubOcrExtractionHash = STUB_OCR_EXTRACTION,
  } = {}) {
    return new this({
      ocrPrompt,
      temperature,

      stubOcrExtractionHash,
    })
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
    return BATCH_FILE_KIND.DEBIT_NOTE_PDF.NAME
  }

  /**
   * Answer for one document, without leaving the host.
   *
   * @override
   * @param {import('../BaseAiModelProcessor.js').DebitNoteExtractionParams} params - Parameters of this method.
   * @returns {Promise<string>} - The answer.
   */
  async requestExtraction ({
    fileName,
    readingIndex,
  }) {
    return JSON.stringify(
      this.buildAnsweredExtraction({
        fileName,
        readingIndex,
      })
    )
  }

  /**
   * Build the answer a provider would have sent for one document (§7.2).
   *
   * **A document with no fixture answers every field as unread.** That is the honest answer from a
   * reader that has never seen the file, and it matters beyond the tests: the default driver meeting
   * a real debit note answers "unreadable" rather than something plausible, so no judgment is ever
   * an OK earned by a driver that did not open the document (`DR-03`).
   *
   * @param {{
   *   fileName: string
   *   readingIndex: number
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The answer, in the shape a provider answers in.
   */
  buildAnsweredExtraction ({
    fileName,
    readingIndex,
  }) {
    const reading = this.findStubDebitNoteReading({
      fileName,
    })

    if (!reading) {
      return this.buildEmptyNormalizedExtraction()
    }

    return {
      debitNoteNumber: this.buildAnsweredEnvelope({
        value: reading.debitNoteNumber,
        pageNumber: FIRST_PAGE_NUMBER,
      }),
      amount: this.buildAnsweredEnvelope({
        value: {
          amount: this.resolveAnsweredAmount({
            reading,
            readingIndex,
          }),
          currencyCode: reading.currencyCode,
        },
        pageNumber: FIRST_PAGE_NUMBER,
      }),
      pageCount: reading.pageCount,
      approvalBlocks: reading.approvalBlocks
        .map(approvalBlock => this.buildAnsweredApprovalBlock({
          approvalBlock,
        })),
    }
  }

  /**
   * Find what this processor knows about one document.
   *
   * @param {{
   *   fileName: string
   * }} params - Parameters of this method.
   * @returns {StubDebitNoteReading | null} - The row, or null when there is none.
   */
  findStubDebitNoteReading ({
    fileName,
  }) {
    return this.stubOcrExtractionHash[fileName]
      ?? null
  }

  /**
   * Work out which of a page's figures this reading answers.
   *
   * Every document but two shows one total, and every reading of it answers that. A page whose total
   * was corrected shows the struck figures as well, and this walks back through them: reading 0
   * answers the figure standing at the end, reading 1 the correction before it, and so on. **Once the
   * corrections run out, every further reading answers the standing figure again** - which is what
   * turns one struck figure into a two-of-three majority and two struck figures into three answers
   * that all differ (`ENG-05` `NG-008`).
   *
   * The most recent correction comes first because that is the plausible misreading: a reader who
   * does not stop at the last figure written stops at the one before it, not at the oldest one on the
   * page.
   *
   * @param {{
   *   reading: StubDebitNoteReading
   *   readingIndex: number
   * }} params - Parameters of this method.
   * @returns {string} - The amount this reading answers, as §7.2 writes one.
   */
  resolveAnsweredAmount ({
    reading,
    readingIndex,
  }) {
    const answerableAmounts = this.buildAnswerableAmounts({
      reading,
    })

    return answerableAmounts[readingIndex]
      ?? reading.amount
  }

  /**
   * Build every figure a reader of this page could land on, in the order a reader lands on them.
   *
   * @param {{
   *   reading: StubDebitNoteReading
   * }} params - Parameters of this method.
   * @returns {Array<string>} - The standing figure, then the struck ones, most recent first.
   */
  buildAnswerableAmounts ({
    reading,
  }) {
    const struckTotalAmounts = reading.struckTotalAmounts
      ?? []

    return [reading.amount]
      .concat(
        struckTotalAmounts.toReversed()
      )
  }

  /**
   * Build the answer for one approval block.
   *
   * Every field of a block sits on the block's own page, so the page is stated once in the fixture
   * and repeated into each envelope here rather than written four times per block.
   *
   * @param {{
   *   approvalBlock: StubApprovalBlock
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The block, in the shape a provider answers in.
   */
  buildAnsweredApprovalBlock ({
    approvalBlock,
  }) {
    return {
      pageNumber: approvalBlock.pageNumber,
      blockLabel: this.buildAnsweredEnvelope({
        value: approvalBlock.blockLabel,
        pageNumber: approvalBlock.pageNumber,
      }),
      approverLastName: this.buildAnsweredEnvelope({
        value: approvalBlock.approverLastName,
        pageNumber: approvalBlock.pageNumber,
      }),
      approverDepartment: this.buildAnsweredEnvelope({
        value: approvalBlock.approverDepartment,
        pageNumber: approvalBlock.pageNumber,
      }),
      isSignaturePresent: this.buildAnsweredEnvelope({
        value: approvalBlock.isSignaturePresent,
        pageNumber: approvalBlock.pageNumber,
      }),
    }
  }

  /**
   * Wrap one fixture value in the envelope §7.2 asks for.
   *
   * `region` is null for every value: this processor answers from a table rather than from a page,
   * and reporting a box would claim it located something it never looked at (`FR-131`).
   *
   * @param {{
   *   value: *
   *   pageNumber: number
   * }} params - Parameters of this method.
   * @returns {Record<string, *>} - The envelope.
   */
  buildAnsweredEnvelope ({
    value,
    pageNumber,
  }) {
    return {
      value,
      pageNumber,
      region: null,
    }
  }
}

/**
 * What one mock document says, as `constants/stubOcrExtraction.cjs` states it.
 *
 * Flat on purpose - the envelopes of §7.2 are built from it here, and the mock documents are drawn
 * from the same rows by `scripts/generateMockDocuments.js`. One table, two consumers.
 *
 * @typedef {{
 *   debitNoteNumber: string
 *   amount: string
 *   currencyCode: string
 *   struckTotalAmounts?: Array<string>
 *   pageCount: number
 *   approvalBlocks: Array<StubApprovalBlock>
 * }} StubDebitNoteReading
 */

/**
 * @typedef {{
 *   pageNumber: number
 *   blockLabel: string | null
 *   approverLastName: string | null
 *   approverDepartment: string | null
 *   isSignaturePresent: boolean | null
 * }} StubApprovalBlock
 */

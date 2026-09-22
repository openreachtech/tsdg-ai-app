import DebitNoteOcrPrompt from './DebitNoteOcrPrompt.js'

const DEFAULT_PAGE_COUNT = 0

/*
 * Which of a file's readings a caller is taking when it does not say.
 *
 * **The ordinal is this system's own vocabulary, not a provider's**: it is the `reading_index` of the
 * `TBL-06` row the answer becomes, and the repeat loop that produces it lives in `JOB-01` (`ADR-21`).
 * A processor is told which reading it is being asked for; it never decides how many there are.
 *
 * A caller taking one reading is taking the first, which is exactly what `OCR_REPEAT_COUNT=1` means
 * (`FR-144`). Defaulting rather than requiring it keeps that call honest instead of leaving the
 * index undefined and letting a driver read whatever an undefined index happens to select.
 */
const FIRST_READING_INDEX = 0

const DEFAULT_PAGE_NUMBER = 1

/*
 * The first row a spreadsheet has, and the floor a read row number is held to.
 *
 * The number asked for is the one the sheet prints in its left margin, so `0` is not a row that
 * exists and a negative one is not a row at all. `ENG-04` matches on this number, so a value that
 * could not have come off a worksheet identifies nothing.
 */
const FIRST_ROW_NUMBER = 1

/*
 * What a currency code looks like, and nothing about which ones exist.
 *
 * Whether `TBL-15` carries the code is a question about this database, and answering it here would
 * put the master inside the provider-neutral contract. An unrecognized code travels as read and
 * fails to equal the cover sheet's, which is `NG-002` - the same answer a wrong currency gets, and
 * the right one for a currency nobody checked.
 */
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u

/*
 * What an amount looks like written out, and nothing about what it is worth.
 *
 * Digits with at most one decimal point, which is how §7.2 asks for it: `897.95`, never `89795` and
 * never `1,110,000`. A separator or a symbol is refused rather than stripped - stripping would make
 * this the place that decides which malformations count, and a figure guessed out of a malformed
 * string is exactly the confident wrong answer `NG-005` exists instead of (`DR-05` `ADR-09`).
 */
const AMOUNT_TEXT_PATTERN = /^\d+(?:\.\d+)?$/u

/*
 * The page an amount is read from, and the only one (`ADR-22`).
 *
 * A figure reported from any other page is a line item or a running subtotal far more often than the
 * document total, so the reading is discarded rather than believed - which reads downstream as an
 * amount nobody could find, `NG-005`.
 */
const TOTAL_AMOUNT_PAGE_NUMBER = 1

/*
 * The bounds of the coordinate space, on both axes (`FR-132`).
 *
 * A region outside them is not a region this system can place on a page, so it is dropped and the
 * value keeps its page without a box - which `FR-131` requires to be sayable.
 */
const REGION_MINIMUM = 0
const REGION_MAXIMUM = 1000

const REGION_SIDE_NAME = [
  'left',
  'top',
  'right',
  'bottom',
]

/**
 * The provider-neutral contract of the AI layer: one debit note PDF in, one extraction out
 * (`AI-02` `FR-090` `FR-091`).
 *
 * **This class declares no provider vocabulary**, and that is the whole point of it. Everything
 * above the AI layer - the job, the engine, the screens - is written against what is here, so
 * replacing the provider means adding a sibling of `BaseGeminiAIProcessor` and changing
 * configuration. If a swap ever forces a change in this file, the neutrality `FR-091` claims has
 * been lost and `ADR-02` needs revisiting rather than patching (`40-backend.md` §10).
 *
 * **It never judges** (`DR-02`). A processor reports what it read and how it read it; whether that
 * is OK or NG is decided in `app/verification/`, which imports nothing from here.
 *
 * A subclass supplies one thing: how the provider's answer is obtained. Measuring the round trip,
 * turning the answer into the shape of §7.2 and stating which provider, model and prompt produced
 * it are the same work whoever answers, so they belong here.
 *
 * @abstract
 */
export default class BaseAiModelProcessor {
  /**
   * Constructor.
   *
   * @param {{
   *   ocrPrompt: import('./BaseOcrPrompt.js').default
   *   temperature: number | null
   * }} params - Parameters of this constructor.
   */
  constructor ({
    ocrPrompt,
    temperature,
  }) {
    this.ocrPrompt = ocrPrompt
    this.temperature = temperature
  }

  /**
   * Factory method.
   *
   * Every argument has a default, because `BulkAiModelProcessorsLoader` instantiates each processor
   * it discovers without knowing what any of them needs (`AI-04`).
   *
   * @param {{
   *   ocrPrompt?: import('./BaseOcrPrompt.js').default
   *   temperature?: number | null
   * }} [params] - Parameters of this method.
   * @returns {BaseAiModelProcessor} - Instance of this class.
   */
  static create ({
    ocrPrompt = this.createOcrPrompt(),
    temperature = this.resolveTemperature(),
  } = {}) {
    return new this({
      ocrPrompt,
      temperature,
    })
  }

  /**
   * Create the prompt this processor asks with.
   *
   * The debit note's, because that is what every processor but the cover sheet's reads - and a
   * processor reading something else overrides this rather than being handed a prompt by whoever
   * built it (`AI-05`). The loader instantiates each processor it discovers with no arguments, so
   * the default has to be right for the processor rather than for the caller.
   *
   * @returns {import('./BaseOcrPrompt.js').default} - The prompt.
   */
  static createOcrPrompt () {
    return DebitNoteOcrPrompt.create()
  }

  /**
   * Resolve the sampling temperature this processor's readings are taken at.
   *
   * **Null here, and null is what gets recorded.** Whether a provider accepts a temperature at all
   * is provider vocabulary (`40-backend.md` §10), so the neutral layer only carries the number for
   * `TBL-06` to store - a processor that chooses one overrides this.
   *
   * @returns {number | null} - The temperature, or null when nothing chose one.
   */
  static resolveTemperature () {
    return null
  }

  /**
   * get: Which provider this speaks to, as `TBL-06.provider_name` records it.
   *
   * @abstract
   * @returns {string} - Provider name.
   * @throws {Error} - this function must be inherited
   */
  get providerName () {
    throw new Error('this function must be inherited')
  }

  /**
   * get: Which model this is, which is what the loader dispatches on (`ENV-032`).
   *
   * @abstract
   * @returns {string} - Model name.
   * @throws {Error} - this function must be inherited
   */
  get modelName () {
    throw new Error('this function must be inherited')
  }

  /**
   * get: Which kind of file this reads, which is the loader's second dispatch key (`TBL-12`).
   *
   * **A processor reads one kind of document and one only.** The cover sheet and the debit note are
   * asked different questions, held to different response schemas and normalized into different
   * shapes (§7.2), so "which model" does not identify a processor on its own - `AI-04` and `AI-05`
   * are the same model reading two different things. Naming the kind here is what lets
   * `BulkAiModelProcessorsLoader` hand each branch of `JOB-01` the processor written for it, instead
   * of the branch knowing which class it wants.
   *
   * It is the same word `BulkBatchFileAnalysisProcessorsLoader` dispatches on, deliberately: two
   * registries keyed on one vocabulary cannot come to disagree about what a kind is called.
   *
   * @abstract
   * @returns {string} - Batch file kind name.
   * @throws {Error} - this function must be inherited
   */
  get batchFileKindName () {
    throw new Error('this function must be inherited')
  }

  /**
   * Read one document, whatever kind of document this processor reads.
   *
   * **Answers `null` when the reading could not be attempted at all** - the document could not be
   * handed over, or the provider did not answer. That is an infrastructure failure and the job
   * records it as one (`FAIL-03`), which has to stay distinguishable from a document the AI read
   * and could make nothing of: that one answers an outcome whose extraction is empty, and the
   * engine turns it into an explicit NG (`DR-03`). A provider outage that produced two hundred NG
   * judgments would be indistinguishable from two hundred bad documents.
   *
   * @param {DocumentExtractionParams} params - Parameters of this method.
   * @returns {Promise<ai.OcrExtractionOutcome | null>} - What was read, or null when nothing was.
   */
  async extractDocument ({
    batchFileId,
    filePath,
    fileName,
    readingIndex = FIRST_READING_INDEX,
    now = new Date(),
  }) {
    const requestedAtMilliseconds = Date.now()

    const responseBody = await this.requestExtraction({
      batchFileId,
      filePath,
      fileName,
      readingIndex,
      now,
    })

    if (responseBody === null) {
      return null
    }

    return this.buildOcrExtractionOutcome({
      normalizedExtraction: this.buildNormalizedExtraction({
        responseBody,
      }),
      extractedAt: now,
      latencyMilliseconds: Date.now() - requestedAtMilliseconds,
    })
  }

  /**
   * Ask the provider to read one document, and answer with what it said.
   *
   * The answer is returned as the text it arrived as rather than as a parsed shape, because parsing
   * it is held to §7.2's schema in one place - and a provider is held to a schema without being
   * trusted to honor it. **What gets stored is the normalized form, not this text** (`TBL-06`): the
   * consensus has to be recomputable from that table alone, which a provider envelope would make
   * provider-specific (`NFR-031`).
   *
   * @abstract
   * @param {DocumentExtractionParams} params - Parameters of this method.
   * @returns {Promise<string | null>} - The answer, or null when it could not be obtained.
   * @throws {Error} - this function must be inherited
   */
  async requestExtraction ({
    batchFileId,
    filePath,
    fileName,
    now,
  }) {
    throw new Error('this function must be inherited')
  }

  /**
   * Build the extraction the engine reads from the provider's answer (§7.2).
   *
   * **Every field is taken only when it arrived in the shape it was asked for.** A provider is held
   * to a schema but not trusted to honor it, and the safe direction is always the same: what cannot
   * be read stays null and becomes an explicit NG, rather than becoming a value the engine would
   * compare (`DR-03` `DR-05`).
   *
   * @param {{
   *   responseBody: string
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedExtraction} - The extraction, empty when the answer was unusable.
   */
  buildNormalizedExtraction ({
    responseBody,
  }) {
    const answeredExtraction = this.parseResponseBody({
      responseBody,
    })

    if (!answeredExtraction) {
      return this.buildEmptyNormalizedExtraction()
    }

    return {
      debitNoteNumber: this.readTextEnvelope({
        answeredEnvelope: answeredExtraction.debitNoteNumber,
      }),
      amount: this.readAmountEnvelope({
        answeredEnvelope: answeredExtraction.amount,
      }),
      pageCount: this.readCount({
        countLike: answeredExtraction.pageCount,
        defaultCount: DEFAULT_PAGE_COUNT,
      }),
      approvalBlocks: this.buildNormalizedApprovalBlocks({
        answeredBlocks: answeredExtraction.approvalBlocks,
      }),
    }
  }

  /**
   * Read the provider's answer as the object it was asked to be.
   *
   * @param {{
   *   responseBody: string
   * }} params - Parameters of this method.
   * @returns {*} - The parsed answer, or null when it is not one.
   */
  parseResponseBody ({
    responseBody,
  }) {
    try {
      const parsedResponseBody = JSON.parse(responseBody)

      if (typeof parsedResponseBody !== 'object' || parsedResponseBody === null) {
        return null
      }

      return parsedResponseBody
    } catch {
      return null
    }
  }

  /**
   * Build the approval blocks of the extraction.
   *
   * **An answer that is not an array becomes no blocks, which is `NG-010` and not `NG-003`.** The
   * two must never merge: one says the supplier did not get the document approved, the other says
   * this system could not tell (`ENG-03` rule 3).
   *
   * A block is placed on page 1 when the provider numbered it unusably, because the page is half of
   * a block's identity and `ENG-05` matches on it - a block with no page could not be paired with
   * itself across readings, and `FR-051` would have nowhere to send the operator.
   *
   * @param {{
   *   answeredBlocks: *
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedApprovalBlock>} - The blocks, in the order they were answered.
   */
  buildNormalizedApprovalBlocks ({
    answeredBlocks,
  }) {
    if (!Array.isArray(answeredBlocks)) {
      return []
    }

    return answeredBlocks.map(answeredBlock => ({
      pageNumber: this.readCount({
        countLike: answeredBlock?.pageNumber,
        defaultCount: DEFAULT_PAGE_NUMBER,
      }),
      blockLabel: this.readTextEnvelope({
        answeredEnvelope: answeredBlock?.blockLabel,
      }),
      approverLastName: this.readTextEnvelope({
        answeredEnvelope: answeredBlock?.approverLastName,
      }),
      approverDepartment: this.readTextEnvelope({
        answeredEnvelope: answeredBlock?.approverDepartment,
      }),
      isSignaturePresent: this.readFlagEnvelope({
        answeredEnvelope: answeredBlock?.isSignaturePresent,
      }),
    }))
  }

  /**
   * Build the cover sheet's own extraction from the provider's answer (§7.2 cover-sheet branch).
   *
   * **The other branch of the same contract, and the reason it lives beside its sibling.** §7.2 is
   * one interface with two shapes, and a processor reading a workbook says so by overriding
   * `#buildNormalizedExtraction()` to call this - which is one line, where a second hierarchy of
   * envelope readers would be two hundred (`AI-05`).
   *
   * **Neither `approvalBlocks` nor `pageCount` appears here.** A spreadsheet has nothing to sign and
   * no page to count, and a field that could only ever be null is a field a reader has to ask about.
   *
   * @param {{
   *   responseBody: string
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedCoverSheetExtraction} - The extraction, empty when the answer was unusable.
   */
  buildNormalizedCoverSheetExtraction ({
    responseBody,
  }) {
    const answeredExtraction = this.parseResponseBody({
      responseBody,
    })

    if (!answeredExtraction) {
      return this.buildEmptyNormalizedCoverSheetExtraction()
    }

    return {
      sheetName: this.readTextEnvelope({
        answeredEnvelope: answeredExtraction.sheetName,
      }),
      rows: this.buildNormalizedCoverSheetRows({
        answeredRows: answeredExtraction.rows,
      }),
      statedSubtotals: this.buildNormalizedStatedSubtotals({
        answeredSubtotals: answeredExtraction.statedSubtotals,
      }),
    }
  }

  /**
   * Build the line item rows of a cover-sheet extraction.
   *
   * **A row the model gave no usable row number is dropped**, and that is the rule an approval
   * block's page follows for the same reason: the row number is the row's identity here. `ENG-04`
   * matches a read row to a parsed row by that number and never by content, and `ENG-05` pairs one
   * reading's rows with another's the same way - so a row that cannot be identified cannot be
   * reduced, compared, or reported against. Keeping it under a made-up number would put it in front
   * of the operator as a disagreement about a row that does not exist.
   *
   * @param {{
   *   answeredRows: *
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedCoverSheetRow>} - The rows, in the order they were answered.
   */
  buildNormalizedCoverSheetRows ({
    answeredRows,
  }) {
    if (!Array.isArray(answeredRows)) {
      return []
    }

    return answeredRows
      .filter(answeredRow => this.isRowNumber({
        rowNumberLike: answeredRow?.rowNumber,
      }))
      .map(answeredRow => this.buildNormalizedCoverSheetRow({
        answeredRow,
      }))
  }

  /**
   * Check whether one value is a row number a spreadsheet could have printed.
   *
   * @param {{
   *   rowNumberLike: *
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the value identifies a row.
   */
  isRowNumber ({
    rowNumberLike,
  }) {
    return Number.isInteger(rowNumberLike)
      && rowNumberLike >= FIRST_ROW_NUMBER
  }

  /**
   * Build one line item row of a cover-sheet extraction.
   *
   * **The currency arrives twice and that is not a duplication to tidy away.** `currencyCode` is the
   * `Cur` column of the worksheet, read as its own value with its own region, and check ⑤ compares
   * it against what the parse made of that column; the code inside `amount` is the one the figure is
   * denominated in, which never travels apart from its figure (`DR-05`). A sheet where the two
   * disagree is exactly the finding `NG-007` exists to surface.
   *
   * @param {{
   *   answeredRow: *
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedCoverSheetRow} - The row.
   */
  buildNormalizedCoverSheetRow ({
    answeredRow,
  }) {
    return {
      rowNumber: answeredRow.rowNumber,
      debitNoteNumber: this.readTextEnvelope({
        answeredEnvelope: answeredRow?.debitNoteNumber,
      }),
      currencyCode: this.readTextEnvelope({
        answeredEnvelope: answeredRow?.currencyCode,
      }),
      amount: this.readSheetAmountEnvelope({
        answeredEnvelope: answeredRow?.amount,
      }),
    }
  }

  /**
   * Build the subtotals a cover-sheet extraction says the totals block states.
   *
   * **A subtotal whose currency could not be read is dropped**, for the reason a row with no number
   * is: the currency is what identifies a subtotal, both to `ENG-04` and across readings. There is
   * one subtotal per currency and nothing else to tell two of them apart.
   *
   * @param {{
   *   answeredSubtotals: *
   * }} params - Parameters of this method.
   * @returns {Array<ai.NormalizedStatedSubtotal>} - The subtotals, in the order they were answered.
   */
  buildNormalizedStatedSubtotals ({
    answeredSubtotals,
  }) {
    if (!Array.isArray(answeredSubtotals)) {
      return []
    }

    return answeredSubtotals
      .map(answeredSubtotal => this.buildNormalizedStatedSubtotal({
        answeredSubtotal,
      }))
      .filter(normalizedSubtotal => normalizedSubtotal !== null)
  }

  /**
   * Build one stated subtotal, or nothing when its currency could not be read.
   *
   * @param {{
   *   answeredSubtotal: *
   * }} params - Parameters of this method.
   * @returns {ai.NormalizedStatedSubtotal | null} - The subtotal, or null when it identifies none.
   */
  buildNormalizedStatedSubtotal ({
    answeredSubtotal,
  }) {
    const currencyCode = this.readOptionalCurrencyCode({
      currencyCodeLike: answeredSubtotal?.currencyCode,
    })

    if (currencyCode === null) {
      return null
    }

    return {
      currencyCode,
      amount: this.readSheetAmountEnvelope({
        answeredEnvelope: answeredSubtotal?.amount,
      }),
    }
  }

  /**
   * Read one answered envelope as an amount printed on a worksheet.
   *
   * The debit note's own reader refuses a figure reported from any page but the first (`ADR-22`);
   * this one does not, because a worksheet's rows are line items on purpose and that rule would
   * refuse every one of them.
   *
   * @param {{
   *   answeredEnvelope: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingEnvelope<ai.ReadingAmount>} - The envelope, null value when unread.
   */
  readSheetAmountEnvelope ({
    answeredEnvelope,
  }) {
    return this.buildReadingEnvelope({
      answeredEnvelope,
      value: this.readOptionalAmountPair({
        answeredEnvelope,
      }),
    })
  }

  /**
   * Read one value as text, or as the absence of it.
   *
   * @param {{
   *   textLike: *
   * }} params - Parameters of this method.
   * @returns {string | null} - The text, or null when there is none.
   */
  readOptionalText ({
    textLike,
  }) {
    if (typeof textLike !== 'string') {
      return null
    }

    const trimmedText = textLike.trim()

    if (!trimmedText) {
      return null
    }

    return trimmedText
  }

  /**
   * Read one answered envelope as text and the place it was seen.
   *
   * @param {{
   *   answeredEnvelope: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingEnvelope<string>} - The envelope, whose value is null when none was read.
   */
  readTextEnvelope ({
    answeredEnvelope,
  }) {
    return this.buildReadingEnvelope({
      answeredEnvelope,
      value: this.readOptionalText({
        textLike: answeredEnvelope?.value,
      }),
    })
  }

  /**
   * Read one answered envelope as a flag and the place it was seen.
   *
   * **Three states, and the third is the point.** `true` and `false` are answers about the document;
   * anything else is "the model did not tell us", which `ENG-03` rule 5 turns into `NG-010`. Reading
   * this with a truthiness test would fold the third state into `false` and accuse a subsidiary of
   * something nobody saw (`DR-03`).
   *
   * @param {{
   *   answeredEnvelope: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingEnvelope<boolean>} - The envelope, whose value is null when none was read.
   */
  readFlagEnvelope ({
    answeredEnvelope,
  }) {
    return this.buildReadingEnvelope({
      answeredEnvelope,
      value: this.readOptionalFlag({
        flagLike: answeredEnvelope?.value,
      }),
    })
  }

  /**
   * Read one value as a flag, or as the absence of one.
   *
   * @param {{
   *   flagLike: *
   * }} params - Parameters of this method.
   * @returns {boolean | null} - The flag, or null when the value is not one.
   */
  readOptionalFlag ({
    flagLike,
  }) {
    if (typeof flagLike !== 'boolean') {
      return null
    }

    return flagLike
  }

  /**
   * Read one answered envelope as an amount, its currency, and the place it was seen.
   *
   * **The figure and its currency are null together** (`DR-05`). A currency without a figure
   * describes nothing, and a figure whose currency arrived separately is the bare number 1.0.0
   * compared across currencies without noticing - which is what lets `TBL-07.CurrencyId` state "null
   * exactly when the amount is".
   *
   * **A page other than 1 discards the figure** (`ADR-22`). The page still travels, because saying
   * "a total was read on page 6 and not used" is more use to an operator than saying nothing.
   *
   * @param {{
   *   answeredEnvelope: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingEnvelope<ai.ReadingAmount>} - The envelope, null value when unread.
   */
  readAmountEnvelope ({
    answeredEnvelope,
  }) {
    return this.buildReadingEnvelope({
      answeredEnvelope,
      value: this.readOptionalAmount({
        answeredEnvelope,
      }),
    })
  }

  /**
   * Read the figure and currency of an answered amount envelope, or the absence of them.
   *
   * @param {{
   *   answeredEnvelope: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingAmount | null} - The amount, or null when there is not one to use.
   */
  readOptionalAmount ({
    answeredEnvelope,
  }) {
    const isUsablePageNumber = this.isTotalAmountPageNumber({
      pageNumberLike: answeredEnvelope?.pageNumber,
    })

    if (!isUsablePageNumber) {
      return null
    }

    return this.readOptionalAmountPair({
      answeredEnvelope,
    })
  }

  /**
   * Read the figure and currency of an answered amount envelope, with no rule about where it sat.
   *
   * **`ADR-22`'s page rule is the debit note's, not every amount's.** It exists because the inner
   * pages of a bundle carry line items and running subtotals that read like a document total; a
   * cover sheet's rows are line items on purpose, and refusing them for not being on page 1 would
   * refuse the whole worksheet.
   *
   * @param {{
   *   answeredEnvelope: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingAmount | null} - The amount, or null when there is not one to use.
   */
  readOptionalAmountPair ({
    answeredEnvelope,
  }) {
    const amount = this.readOptionalAmountText({
      amountTextLike: answeredEnvelope?.value?.amount,
    })

    if (amount === null) {
      return null
    }

    const currencyCode = this.readOptionalCurrencyCode({
      currencyCodeLike: answeredEnvelope?.value?.currencyCode,
    })

    if (currencyCode === null) {
      return null
    }

    return {
      amount,
      currencyCode,
    }
  }

  /**
   * Check whether an answered page is the one page a document total is read from (`ADR-22`).
   *
   * **A page the provider did not state counts as page 1** rather than as a refusal. The prompt asks
   * for page 1 and nowhere else, so an answer with no page is one that did not contradict it - and
   * throwing the figure away over a missing field would turn a readable document into `NG-005`.
   *
   * @param {{
   *   pageNumberLike: *
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the figure may be used.
   */
  isTotalAmountPageNumber ({
    pageNumberLike,
  }) {
    if (!Number.isInteger(pageNumberLike)) {
      return true
    }

    return pageNumberLike === TOTAL_AMOUNT_PAGE_NUMBER
  }

  /**
   * Read one value as an amount written out, or as the absence of one.
   *
   * **Only a decimal string is an amount** (§7.2). A JSON number is refused because a binary float
   * cannot hold `897.95`, and a separator or a symbol is refused rather than stripped: stripping
   * would make this the place that decides which malformations count. An amount refused here becomes
   * `NG-005` and never a zero (`DR-05` `ADR-09`).
   *
   * @param {{
   *   amountTextLike: *
   * }} params - Parameters of this method.
   * @returns {string | null} - The amount as written, or null when the value is not one.
   */
  readOptionalAmountText ({
    amountTextLike,
  }) {
    const amountText = this.readOptionalText({
      textLike: amountTextLike,
    })

    if (amountText === null) {
      return null
    }

    if (!AMOUNT_TEXT_PATTERN.test(amountText)) {
      return null
    }

    return amountText
  }

  /**
   * Build one envelope around a value that has already been read.
   *
   * The page and the region come off the answer whatever became of the value, because a reading that
   * located something it could not transcribe is still telling the operator where to look
   * (`FR-051`).
   *
   * @param {{
   *   answeredEnvelope: *
   *   value: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingEnvelope<*>} - The envelope.
   */
  buildReadingEnvelope ({
    answeredEnvelope,
    value,
  }) {
    return {
      value,
      pageNumber: this.readOptionalPageNumber({
        pageNumberLike: answeredEnvelope?.pageNumber,
      }),
      region: this.readOptionalRegion({
        regionLike: answeredEnvelope?.region,
      }),
    }
  }

  /**
   * Read one value as a page number, or as the absence of one.
   *
   * @param {{
   *   pageNumberLike: *
   * }} params - Parameters of this method.
   * @returns {number | null} - The page, or null when the value is not one.
   */
  readOptionalPageNumber ({
    pageNumberLike,
  }) {
    if (!Number.isInteger(pageNumberLike) || pageNumberLike < DEFAULT_PAGE_NUMBER) {
      return null
    }

    return pageNumberLike
  }

  /**
   * Read one value as a region, or as the absence of one.
   *
   * **All four sides or none** (`FR-131`). A box missing a side is not a box, and completing it from
   * the others would be drawing an outline the model never reported - the one thing a null region
   * exists to avoid.
   *
   * @param {{
   *   regionLike: *
   * }} params - Parameters of this method.
   * @returns {ai.ReadingRegion | null} - The region, or null when the value is not one.
   */
  readOptionalRegion ({
    regionLike,
  }) {
    const isCompleteRegion = REGION_SIDE_NAME
      .every(sideName => this.isRegionCoordinate({
        coordinateLike: regionLike?.[sideName],
      }))

    if (!isCompleteRegion) {
      return null
    }

    return {
      left: regionLike.left,
      top: regionLike.top,
      right: regionLike.right,
      bottom: regionLike.bottom,
    }
  }

  /**
   * Check whether one value is a coordinate of the space `FR-132` fixes.
   *
   * @param {{
   *   coordinateLike: *
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the value is a coordinate.
   */
  isRegionCoordinate ({
    coordinateLike,
  }) {
    return Number.isInteger(coordinateLike)
      && coordinateLike >= REGION_MINIMUM
      && coordinateLike <= REGION_MAXIMUM
  }

  /**
   * Read one value as a currency code, or as the absence of one.
   *
   * Upper-cased rather than refused when a provider answers `usd`: the case of a three-letter code
   * carries no meaning, and every comparison downstream is against an upper-case master code.
   *
   * @param {{
   *   currencyCodeLike: *
   * }} params - Parameters of this method.
   * @returns {string | null} - The code, or null when the value is not one.
   */
  readOptionalCurrencyCode ({
    currencyCodeLike,
  }) {
    const currencyText = this.readOptionalText({
      textLike: currencyCodeLike,
    })

    if (currencyText === null) {
      return null
    }

    const currencyCode = currencyText.toUpperCase()

    if (!CURRENCY_CODE_PATTERN.test(currencyCode)) {
      return null
    }

    return currencyCode
  }

  /**
   * Read one value as a count of pages or rows, falling back when it is not one.
   *
   * @param {{
   *   countLike: *
   *   defaultCount: number
   * }} params - Parameters of this method.
   * @returns {number} - The count.
   */
  readCount ({
    countLike,
    defaultCount,
  }) {
    if (!Number.isInteger(countLike) || countLike < 0) {
      return defaultCount
    }

    return countLike
  }

  /**
   * Build what one reading produced, which is one `TBL-06` row plus the extraction.
   *
   * The four identifiers are read off the processor rather than taken from the caller, so a stored
   * row cannot name a provider, model, prompt or temperature other than the one that answered
   * (`FR-036`).
   *
   * @param {{
   *   normalizedExtraction: ai.NormalizedExtraction
   *   extractedAt: Date
   *   latencyMilliseconds: number
   * }} params - Parameters of this method.
   * @returns {ai.OcrExtractionOutcome} - The outcome.
   */
  buildOcrExtractionOutcome ({
    normalizedExtraction,
    extractedAt,
    latencyMilliseconds,
  }) {
    return {
      providerName: this.providerName,
      modelName: this.modelName,
      promptVersion: this.ocrPrompt.promptVersion,
      extractedAt,
      latencyMilliseconds,
      temperature: this.temperature,
      normalizedExtraction,
    }
  }

  /**
   * Build the extraction of a document nothing could be read from.
   *
   * One shape for "nothing was read" spares the engine a second code path: an answer that would not
   * parse, a document the stub has no fixture for and a genuinely illegible scan all arrive here,
   * and all of them fail check ③ on a null amount rather than passing anything (`DR-03`).
   *
   * @returns {ai.NormalizedExtraction} - An extraction that read nothing.
   */
  buildEmptyNormalizedExtraction () {
    return {
      debitNoteNumber: this.buildEmptyReadingEnvelope(),
      amount: this.buildEmptyReadingEnvelope(),
      pageCount: DEFAULT_PAGE_COUNT,
      approvalBlocks: [],
    }
  }

  /**
   * Build the cover-sheet extraction of a workbook nothing could be read from.
   *
   * **The empty sheet name is what the guard reads.** A reading with no name cannot be shown to be
   * of the judged worksheet, so it is discarded and counted as unread rather than compared against
   * rows it may not belong to (`SEC-009` `ADR-23`) - which is the same answer this shape gives for
   * every other field, and the right one.
   *
   * @returns {ai.NormalizedCoverSheetExtraction} - An extraction that read nothing.
   */
  buildEmptyNormalizedCoverSheetExtraction () {
    return {
      sheetName: this.buildEmptyReadingEnvelope(),
      rows: [],
      statedSubtotals: [],
    }
  }

  /**
   * Build the envelope of a value nothing was read for.
   *
   * The wrapper is still there, because §7.2 makes it non-null: a field with no value reports a page
   * and a region of its own, which is what lets the screen say "read nothing here" rather than show
   * nothing at all.
   *
   * @returns {ai.ReadingEnvelope<*>} - An envelope that read nothing.
   */
  buildEmptyReadingEnvelope () {
    return {
      value: null,
      pageNumber: null,
      region: null,
    }
  }
}

/**
 * @typedef {{
 *   batchFileId: number
 *   filePath: string
 *   fileName: string
 *   readingIndex?: number
 *   now?: Date
 * }} DocumentExtractionParams
 */

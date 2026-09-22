import BATCH_FILE_KIND_CONSTANT_HASH from '../../constants/batchFileKind.js'
import CURRENCY_CONSTANT_HASH from '../../constants/currency.js'

import {
  env,
} from '../../globals/_.js'

import ExtractedWorkbookStorage from '../../storage/ExtractedWorkbookStorage.js'

import EnvironmentSwitch from '../../tools/EnvironmentSwitch.js'

import CoverSheetParser from '../../verification/CoverSheetParser.js'
import CoverSheetReadingAgreementVerifier from '../../verification/CoverSheetReadingAgreementVerifier.js'
import CoverSheetReadingConsensusReducer from '../../verification/CoverSheetReadingConsensusReducer.js'
import DebitNoteNumberNormalizer from '../../verification/DebitNoteNumberNormalizer.js'
import ExcelTotalReconciler from '../../verification/ExcelTotalReconciler.js'
import JudgedSheetWorkbookExtractor from '../../verification/JudgedSheetWorkbookExtractor.js'

import BatchFile from '../../../sequelize/models/BatchFile.js'
import CoverSheetNgReason from '../../../sequelize/models/CoverSheetNgReason.js'
import CoverSheetRow from '../../../sequelize/models/CoverSheetRow.js'
import CoverSheetSheet from '../../../sequelize/models/CoverSheetSheet.js'
import OcrExtraction from '../../../sequelize/models/OcrExtraction.js'
import ReadingFieldAgreement from '../../../sequelize/models/ReadingFieldAgreement.js'

import BaseBatchFileAnalysisProcessor from '../BaseBatchFileAnalysisProcessor.js'
import CoverSheetNgReasonWriter from '../CoverSheetNgReasonWriter.js'
import ExcelTotalCheckPropagator from '../ExcelTotalCheckPropagator.js'
import MismatchedSheetReadingReplacer from '../MismatchedSheetReadingReplacer.js'
import OcrExtractionWriter from '../OcrExtractionWriter.js'
import ReadingFieldAgreementWriter from '../ReadingFieldAgreementWriter.js'

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH

const {
  CURRENCY,
} = CURRENCY_CONSTANT_HASH

/*
 * How many readings a cover sheet takes while `ENV-043` says the AI must not see it.
 *
 * None, which is the complete and intended behavior of every check but ⑤ (`FR-112` `SEC-009`): the
 * sheet is parsed deterministically and nothing about it leaves the host.
 */
const NO_READING_TAKEN = 0

/**
 * Turns a cover sheet into the worksheets the preview renders and the rows the Excel side of the
 * verification compares against (`TBL-13` `TBL-05` `ENG-01`).
 *
 * **An unreadable sheet is a completed file, not a failed one** (`FR-033` `DR-03`). The parser
 * answers with a reason instead of rows, this writes no rows, and check ② concludes `NG-004` for
 * every debit note of the batch. The file reaches `completed` because it was processed - what
 * failed is the document, and a document defect is the output of this system rather than an
 * interruption of it. A file only fails when the run itself could not happen.
 *
 * @extends {BaseBatchFileAnalysisProcessor}
 */
export default class CoverSheetAnalysisProcessor extends BaseBatchFileAnalysisProcessor {
  /** @override */
  get batchFileKindName () {
    return BATCH_FILE_KIND.COVER_SHEET.NAME
  }

  /**
   * Analyze one cover sheet.
   *
   * @override
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async analyzeBatchFile ({
    batchFile,
  }) {
    const parseResult = await this.parseCoverSheet({
      batchFile,
    })

    await this.storeParsedCoverSheet({
      batchFile,
      parseResult,
    })

    await this.destroyStoredReadingOutcomes({
      batchFile,
    })

    await this.readJudgedWorksheet({
      batchFile,
      parseResult,
    })

    await this.repairJudgedDebitNotes({
      batchFile,
    })
  }

  /**
   * get: How many times this worksheet is read (`ENV-041` `ENV-043` `FR-112`).
   *
   * **`ENV-043` is the only gate, and it is checked here rather than in the AI layer.** Under
   * `stub` the readings are still produced and only the upload is skipped, because a driver must
   * not be able to turn a check off (`NFR-041`) - so the question "does this file get read at all"
   * is configuration about the cover sheet and belongs beside the file, not beside the provider.
   *
   * @override
   * @returns {number} - How many readings to take.
   */
  get targetReadingCount () {
    const isCoverSheetAiReadEnabled = this.createCoverSheetAiReadSwitch()
      .isTurnedOn()

    if (!isCoverSheetAiReadEnabled) {
      return NO_READING_TAKEN
    }

    return this.configuredReadingCount
  }

  /**
   * Create the switch that says whether the workbook may be read at all.
   *
   * @param {{
   *   coverSheetAiReadEnabledLike?: string
   * }} [params] - Parameters of this method.
   * @returns {EnvironmentSwitch} - The switch.
   */
  createCoverSheetAiReadSwitch ({
    coverSheetAiReadEnabledLike = env.COVER_SHEET_AI_READ_ENABLED,
  } = {}) {
    return EnvironmentSwitch.create({
      switchLike: coverSheetAiReadEnabledLike,
    })
  }

  /**
   * Delete everything a previous read of this file wrote (`DR-06`).
   *
   * **Separate from the writers, because the writers only run when the read does.** Each of them
   * replaces its own table inside its own transaction, which covers a retry that reads again; what
   * it cannot cover is a retry taken after `ENV-043` was turned off, where nothing runs and the
   * readings of the previous configuration would stay on the screen as though the switch had never
   * moved. A file processed with the read off has no readings, and that has to be true of a file
   * processed twice as well.
   *
   * The three tables are the whole of what a read of a cover sheet writes: the readings themselves
   * (`TBL-06`), what they agreed on (`TBL-14`) and what check ⑤ made of that (`TBL-16`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async destroyStoredReadingOutcomes ({
    batchFile,
  }) {
    await BatchFile.beginTransaction(async transaction => {
      await CoverSheetNgReason.destroy({
        where: {
          BatchFileId: batchFile.id,
        },
        transaction,
      })

      await ReadingFieldAgreement.destroy({
        where: {
          BatchFileId: batchFile.id,
        },
        transaction,
      })

      await OcrExtraction.destroy({
        where: {
          BatchFileId: batchFile.id,
        },
        transaction,
      })
    })
  }

  /**
   * Read the judged worksheet with the AI, and compare what it says with the parse (§5.3 steps 5 and 7).
   *
   * **Only the judged worksheet is ever sent** (`ADR-23`): it is extracted into a workbook of its
   * own, that file is what the provider sees, and it is deleted as soon as the last reading returns
   * - on the failure path as much as on the success one (`STORE-03`). The stored original never
   * leaves the host.
   *
   * **A workbook with no judged worksheet is not read.** There is nothing to extract and nothing to
   * compare a reading against: `NG-009` has already been concluded about the file, and asking a
   * model to read a month nobody chose would produce values check ⑤ could only report as
   * disagreements with rows that were never parsed.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async readJudgedWorksheet ({
    batchFile,
    parseResult,
  }) {
    if (this.targetReadingCount === NO_READING_TAKEN) {
      return
    }

    if (parseResult.judgedSheetIndex === null) {
      return
    }

    const extractedWorkbookStorage = this.createExtractedWorkbookStorage()

    await extractedWorkbookStorage.createStorageDirectory()

    try {
      await this.readExtractedWorksheet({
        batchFile,
        parseResult,
        extractedWorkbookStorage,
      })
    } finally {
      await extractedWorkbookStorage.removeExtractedFile({
        batchFileId: batchFile.id,
      })
    }
  }

  /**
   * Create the scratch store the extracted workbook lives in for the length of one job.
   *
   * @returns {ExtractedWorkbookStorage} - The store.
   */
  createExtractedWorkbookStorage () {
    return ExtractedWorkbookStorage.create()
  }

  /**
   * Extract the judged worksheet, read it, and run check 5 on what the readings agreed on.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   *   extractedWorkbookStorage: ExtractedWorkbookStorage
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async readExtractedWorksheet ({
    batchFile,
    parseResult,
    extractedWorkbookStorage,
  }) {
    const extractedFilePath = extractedWorkbookStorage.resolveExtractedFilePath({
      batchFileId: batchFile.id,
    })

    const judgedSheetName = await this.extractJudgedSheet({
      batchFile,
      parseResult,
      extractedFilePath,
    })

    if (judgedSheetName === null) {
      return
    }

    const ocrExtractionOutcomes = await this.takeEachReading({
      batchFile,
      extractedFilePath,
    })

    await this.storeOcrExtractions({
      batchFile,
      ocrExtractionOutcomes,
    })

    const readingConsensus = await this.reduceReadings({
      ocrExtractionOutcomes,
      judgedSheetName,
    })

    await this.storeReadingFieldAgreements({
      batchFile,
      readingConsensus,
    })

    await this.verifyReadingAgreement({
      batchFile,
      parseResult,
      readingConsensus,
      totalReadingCount: ocrExtractionOutcomes.length,
      judgedSheetName,
    })
  }

  /**
   * Write the judged worksheet out as a workbook of its own (`ADR-23`).
   *
   * Answers the worksheet's name, which is what each reading is afterwards checked against, or
   * `null` when there was nothing to extract - in which case no reading is taken at all rather than
   * one being taken of a file nobody wrote.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   *   extractedFilePath: string
   * }} params - Parameters of this method.
   * @returns {Promise<string | null>} - The worksheet's name, or null.
   */
  async extractJudgedSheet ({
    batchFile,
    parseResult,
    extractedFilePath,
  }) {
    return this.createJudgedSheetWorkbookExtractor()
      .extractJudgedSheet({
        filePath: this.resolveStoredFilePath({
          batchFile,
        }),
        sheetIndex: parseResult.judgedSheetIndex,
        destinationPath: extractedFilePath,
      })
  }

  /**
   * Create the extraction one run is narrowed by.
   *
   * A new one per file, never a held one, for the reason the parser is: it owns an
   * `ExcelJS.Workbook`, and this processor is built once per process and shared by every run.
   *
   * @returns {JudgedSheetWorkbookExtractor} - The extraction.
   */
  createJudgedSheetWorkbookExtractor () {
    return JudgedSheetWorkbookExtractor.create()
  }

  /**
   * Read the extracted worksheet once per reading, one after another (`ADR-21`).
   *
   * **Sequential, not parallel**, and for the reason the debit note branch gives: `JOB_CONCURRENCY`
   * already bounds how hard the provider is pushed, and taking one file's readings at once would
   * multiply that bound by `OCR_REPEAT_COUNT` without anybody changing a setting (`NFR-011`).
   *
   * **A reading that does not arrive is skipped rather than thrown.** The cover-sheet read is a
   * second opinion that changes no verdict (`DR-01`), so a provider that refuses it must not fail a
   * file whose three real checks are unaffected - which is the opposite of the debit note branch,
   * where a missing reading is `FAIL-03` because the judgment depends on it.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   extractedFilePath: string
   * }} params - Parameters of this method.
   * @returns {Promise<Array<ai.OcrExtractionOutcome>>} - What each reading said, in order.
   */
  async takeEachReading ({
    batchFile,
    extractedFilePath,
  }) {
    return this.buildReadingIndexes()
      .reduce(
        async (previousOutcomes, readingIndex) => {
          const ocrExtractionOutcomes = await previousOutcomes

          const ocrExtractionOutcome = await this.extractWorksheet({
            batchFile,
            extractedFilePath,
            readingIndex,
          })

          // A reading that did not arrive concatenates nothing. `concat([])` is what says "this
          // one is skipped" without a branch inside a higher-order function.
          return ocrExtractionOutcomes.concat(
            ocrExtractionOutcome
            ?? []
          )
        },
        /** @type {Promise<Array<ai.OcrExtractionOutcome>>} */ (Promise.resolve([]))
      )
  }

  /**
   * Ask the AI layer what the extracted worksheet says.
   *
   * **The bytes are the extraction's and the name is the cover sheet's own** (`TBL-04.file_name`).
   * They differ on purpose: what left the host is one worksheet (`ADR-23`), and what identifies the
   * transfer is the `TBL-08` row's `BatchFileId` rather than a name - while the stub resolves its
   * fixtures by the name the operator uploaded, which is the only name a fixture table could be
   * keyed on.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   extractedFilePath: string
   *   readingIndex: number
   * }} params - Parameters of this method.
   * @returns {Promise<ai.OcrExtractionOutcome | null>} - What was read, or null when nothing was.
   */
  async extractWorksheet ({
    batchFile,
    extractedFilePath,
    readingIndex,
  }) {
    const aiModelProcessor = await this.resolveAiModelProcessor()

    return aiModelProcessor.extractDocument({
      batchFileId: batchFile.id,
      filePath: extractedFilePath,
      fileName: batchFile.fileName,
      readingIndex,
    })
  }

  /**
   * Store every reading of the worksheet, as one set (`TBL-06`).
   *
   * The rows are written even where the sheet name did not match, because they are the evidence a
   * mismatch happened at all - a discarded reading that left nothing behind would make an
   * extraction bug indistinguishable from a model that read nothing.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async storeOcrExtractions ({
    batchFile,
    ocrExtractionOutcomes,
  }) {
    await OcrExtractionWriter.create({
      batchFileId: batchFile.id,
      ocrExtractionOutcomes,
    })
      .writeExtractions()
  }

  /**
   * Reduce every usable reading of the worksheet to one consensus (`ENG-05`).
   *
   * **The sheet-name guard runs first** (`SEC-009`): a reading of some other worksheet is replaced
   * by one that read nothing, so it keeps its place in the denominator and contributes no value.
   * Comparing rows from the wrong month would report a worksheet of disagreements caused by our own
   * extraction rather than by anything the subsidiary sent.
   *
   * @param {{
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   *   judgedSheetName: string
   * }} params - Parameters of this method.
   * @returns {Promise<verification.CoverSheetReadingConsensus>} - What the readings agreed on.
   */
  async reduceReadings ({
    ocrExtractionOutcomes,
    judgedSheetName,
  }) {
    const normalizedExtractions = await this.replaceMismatchedReadings({
      ocrExtractionOutcomes,
      judgedSheetName,
    })

    return CoverSheetReadingConsensusReducer.create({
      normalizedExtractions,
    })
      .reduceReadings()
  }

  /**
   * Replace every reading that is not of the judged worksheet with one that read nothing.
   *
   * The empty shape comes off the AI layer itself rather than being written here, so what "read
   * nothing" means stays §7.2's answer and not this file's copy of it.
   *
   * @param {{
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   *   judgedSheetName: string
   * }} params - Parameters of this method.
   * @returns {Promise<Array<ai.NormalizedCoverSheetExtraction>>} - One entry per reading taken.
   */
  async replaceMismatchedReadings ({
    ocrExtractionOutcomes,
    judgedSheetName,
  }) {
    const aiModelProcessor = await this.resolveAiModelProcessor()

    return MismatchedSheetReadingReplacer.create({
      judgedSheetName,
      emptyExtraction: aiModelProcessor.buildEmptyNormalizedCoverSheetExtraction(),
    })
      .replaceMismatchedReadings({
        normalizedExtractions: /** @type {*} */ (
          ocrExtractionOutcomes
            .map(ocrExtractionOutcome => ocrExtractionOutcome.normalizedExtraction)
        ),
      })
  }

  /**
   * Store what the readings agreed on, field by field (`ENG-05` `TBL-14`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   readingConsensus: verification.CoverSheetReadingConsensus
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async storeReadingFieldAgreements ({
    batchFile,
    readingConsensus,
  }) {
    await ReadingFieldAgreementWriter.create({
      batchFileId: batchFile.id,
      fieldConsensuses: readingConsensus.fieldConsensuses,
    })
      .writeAgreements()
  }

  /**
   * Run check ⑤ and write down what it found (`ENG-04`, §5.3 step 7).
   *
   * **This is where the step ends** (`DR-01` `FR-092`). No `is_*_passed` value is touched, no
   * `TBL-11` row is written and no `TBL-05` row is corrected: a disagreement between two readings of
   * the cover sheet is a finding about the system, and a batch judged with the read on has to be
   * judged identically with it off.
   *
   * **The parse is taken from memory rather than read back out of `TBL-05`.** It is the same read
   * that wrote those rows, a few statements earlier in the same job - going back to the database for
   * it would compare against a copy that can only differ if something else has written in between,
   * which is a state the job would rather fail on than quietly judge.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   *   readingConsensus: verification.CoverSheetReadingConsensus
   *   totalReadingCount: number
   *   judgedSheetName: string
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async verifyReadingAgreement ({
    batchFile,
    parseResult,
    readingConsensus,
    totalReadingCount,
    judgedSheetName,
  }) {
    const judgedWorksheet = this.findJudgedWorksheet({
      parseResult,
    })

    if (!judgedWorksheet) {
      return
    }

    const ngReasons = this.createCoverSheetReadingAgreementVerifier({
      judgedWorksheet,
      readingConsensus,
      totalReadingCount,
      fileName: batchFile.fileName,
      sheetName: judgedSheetName,
    })
      .verifyReadingAgreement()

    await CoverSheetNgReasonWriter.create({
      batchFileId: batchFile.id,
      ngReasons,
    })
      .writeNgReasons()
  }

  /**
   * Find the worksheet the rule of §6.3 chose, among everything the parse read.
   *
   * Null where no rule could choose one (`NG-009`), which is the same worksheet the read is skipped
   * for: there is nothing to compare a reading against and no `row_number` for a finding to name.
   *
   * @param {{
   *   parseResult: verification.CoverSheetParseResult
   * }} params - Parameters of this method.
   * @returns {verification.ParsedCoverSheetWorksheet | null} - The worksheet, or null.
   */
  findJudgedWorksheet ({
    parseResult,
  }) {
    return parseResult.parsedWorksheets
      .find(parsedWorksheet => parsedWorksheet.sheetIndex === parseResult.judgedSheetIndex)
      ?? null
  }

  /**
   * Create check ⑤.
   *
   * @param {{
   *   judgedWorksheet: verification.ParsedCoverSheetWorksheet
   *   readingConsensus: verification.CoverSheetReadingConsensus
   *   totalReadingCount: number
   *   fileName: string
   *   sheetName: string
   *   CoverSheetReadingAgreementVerifierCtor?: typeof CoverSheetReadingAgreementVerifier
   * }} params - Parameters of this method.
   * @returns {CoverSheetReadingAgreementVerifier} - The check.
   */
  createCoverSheetReadingAgreementVerifier ({
    judgedWorksheet,
    readingConsensus,
    totalReadingCount,
    fileName,
    sheetName,
    CoverSheetReadingAgreementVerifierCtor = CoverSheetReadingAgreementVerifier,
  }) {
    return CoverSheetReadingAgreementVerifierCtor.create({
      parsedRows: judgedWorksheet.coverSheetRows,
      parsedStatedSubtotals: judgedWorksheet.statedSubtotals,
      readingConsensus,
      totalReadingCount,
      fileName,
      sheetName,
    })
  }

  /**
   * Read the workbook.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<verification.CoverSheetParseResult>} - The parse.
   */
  async parseCoverSheet ({
    batchFile,
  }) {
    const parser = this.createCoverSheetParser()

    return parser.parseFile({
      filePath: this.resolveStoredFilePath({
        batchFile,
      }),
      coverSheetFileName: batchFile.fileName,
    })
  }

  /**
   * Create the parser one run reads with.
   *
   * **A new one per file, never a held one.** A parser owns an `ExcelJS.Workbook`, and this
   * processor is built once per process and shared by every run - so a parser kept as a property
   * would be the same workbook for however many files `JOB_CONCURRENCY` allows at once, and two
   * cover sheets would overwrite each other's contents.
   *
   * @returns {CoverSheetParser} - The parser.
   */
  createCoverSheetParser () {
    return CoverSheetParser.create()
  }

  /**
   * Write what the workbook said, replacing what a previous run of this file wrote.
   *
   * Delete-then-insert in one transaction, so a retry **replaces** rather than duplicates
   * (`DR-06`): the rows carry no natural key that an upsert could match on, and a sheet corrected
   * between two runs legitimately has different rows in different places.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async storeParsedCoverSheet ({
    batchFile,
    parseResult,
  }) {
    await BatchFile.beginTransaction(async transaction => {
      await this.destroyStoredWorksheets({
        batchFile,
        transaction,
      })

      await CoverSheetSheet.bulkCreate(
        this.buildCoverSheetSheetAttributes({
          batchFile,
          parseResult,
        }),
        {
          transaction,
        }
      )

      await this.storeJudgedWorksheetRows({
        batchFile,
        parseResult,
        transaction,
      })
    })
  }

  /**
   * Delete what a previous run of this file wrote, rows before the worksheets that own them.
   *
   * The order is the whole point of doing it in two statements rather than one: a `TBL-05` row is
   * found through its worksheet, so deleting the worksheets first would leave the rows unreachable
   * rather than deleted. There is no DB foreign key to enforce that (rule 1), which is why it is
   * enforced here.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async destroyStoredWorksheets ({
    batchFile,
    transaction,
  }) {
    const storedSheets = await CoverSheetSheet.findAll({
      where: {
        BatchFileId: batchFile.id,
      },
      transaction,
    })

    await CoverSheetRow.destroy({
      where: {
        CoverSheetSheetId: storedSheets.map(it => /** @type {*} */ (it).id),
      },
      transaction,
    })

    await CoverSheetSheet.destroy({
      where: {
        BatchFileId: batchFile.id,
      },
      transaction,
    })
  }

  /**
   * Build one `TBL-13` row per worksheet of the workbook, hidden ones included.
   *
   * **A hidden worksheet is stored even though no rule could ever choose it** (§6.3). The preview
   * does not offer it as a tab (`FR-121`) but does state how many there are, and that count has to
   * come from somewhere: without these rows nothing could say the file holds seven worksheets
   * rather than one.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   * }} params - Parameters of this method.
   * @returns {Array<{
   *   BatchFileId: number
   *   sheetIndex: number
   *   sheetName: string
   *   isHidden: boolean
   *   isJudged: boolean
   *   statedSubtotals: Array<model.CoverSheetStatedSubtotal>
   *   reconciliation: Array<model.CoverSheetReconciliation>
   *   grid: model.CoverSheetGrid
   *   rowCount: number
   *   columnCount: number
   * }>} - The worksheets.
   */
  buildCoverSheetSheetAttributes ({
    batchFile,
    parseResult,
  }) {
    return parseResult.parsedWorksheets
      .map(parsedWorksheet => ({
        BatchFileId: batchFile.id,
        sheetIndex: parsedWorksheet.sheetIndex,
        sheetName: parsedWorksheet.sheetName,
        isHidden: parsedWorksheet.isHidden,
        isJudged: this.isJudgedWorksheet({
          parsedWorksheet,
          parseResult,
        }),
        statedSubtotals: parsedWorksheet.statedSubtotals,
        reconciliation: this.buildReconciliation({
          parsedWorksheet,
          parseResult,
        }),
        grid: parsedWorksheet.grid,
        rowCount: parsedWorksheet.rowCount,
        columnCount: parsedWorksheet.columnCount,
      }))
  }

  /**
   * Answer whether one worksheet is the one the judgment uses (`TERM-16`).
   *
   * @param {{
   *   parsedWorksheet: verification.ParsedCoverSheetWorksheet
   *   parseResult: verification.CoverSheetParseResult
   * }} params - Parameters of this method.
   * @returns {boolean} - true: this is the judged worksheet.
   */
  isJudgedWorksheet ({
    parsedWorksheet,
    parseResult,
  }) {
    return parsedWorksheet.sheetIndex === parseResult.judgedSheetIndex
  }

  /**
   * Run check ② over one worksheet and record what it concluded (`ENG-01`, §5.3 step 6).
   *
   * **Only the judged worksheet is reconciled**, and every other row stores `[]`. A month nobody
   * asked about has no outcome, and computing one anyway would put a figure on the screen that no
   * judgment rests on (`FR-121`).
   *
   * **The parse is what it reconciles, not a read-back of the rows.** They are the same values -
   * this runs inside the transaction that writes them - and taking them from the parse makes the
   * stored outcome consistent with the stored rows by construction rather than by both queries
   * seeing the same instant.
   *
   * @param {{
   *   parsedWorksheet: verification.ParsedCoverSheetWorksheet
   *   parseResult: verification.CoverSheetParseResult
   * }} params - Parameters of this method.
   * @returns {Array<model.CoverSheetReconciliation>} - One outcome per currency, empty when unjudged.
   */
  buildReconciliation ({
    parsedWorksheet,
    parseResult,
  }) {
    if (!this.isJudgedWorksheet({
      parsedWorksheet,
      parseResult,
    })) {
      return []
    }

    return this.createExcelTotalReconciler({
      parsedWorksheet,
    })
      .reconcileCurrencies()
  }

  /**
   * Create check ②.
   *
   * @param {{
   *   parsedWorksheet: verification.ParsedCoverSheetWorksheet
   * }} params - Parameters of this method.
   * @returns {ExcelTotalReconciler} - The check.
   */
  createExcelTotalReconciler ({
    parsedWorksheet,
  }) {
    return ExcelTotalReconciler.create({
      coverSheetRows: parsedWorksheet.coverSheetRows,
      statedSubtotals: parsedWorksheet.statedSubtotals,
    })
  }

  /**
   * Write the line items of the one worksheet the judgment may use.
   *
   * **Only the judged worksheet's rows are stored.** The others are months nobody asked about, and
   * a `TBL-05` row that no check will ever read is a row a later query could still match a debit
   * note against - which is the wrong-month judgment `FR-039` exists to prevent. A workbook whose
   * worksheet could not be chosen stores no rows at all, which is the same rule with no worksheet
   * on the near side of it.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   parseResult: verification.CoverSheetParseResult
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async storeJudgedWorksheetRows ({
    batchFile,
    parseResult,
    transaction,
  }) {
    const judgedWorksheet = this.findJudgedWorksheet({
      parseResult,
    })

    if (!judgedWorksheet) {
      return
    }

    const coverSheetSheet = await this.findStoredJudgedSheet({
      batchFile,
      transaction,
    })

    await CoverSheetRow.bulkCreate(
      this.buildCoverSheetRowAttributes({
        coverSheetSheet,
        judgedWorksheet,
      }),
      {
        transaction,
      }
    )
  }

  /**
   * Find the `TBL-13` row just written for the judged worksheet.
   *
   * Read back rather than taken from what `bulkCreate()` returned, because whether a bulk insert
   * carries its generated ids back differs by dialect - and this repository runs SQLite in
   * development and MariaDB live (`ADR-06`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   transaction: import('sequelize').Transaction
   * }} params - Parameters of this method.
   * @returns {Promise<import('../../../sequelize/models/CoverSheetSheet.js').CoverSheetSheetEntity>} - The worksheet.
   */
  async findStoredJudgedSheet ({
    batchFile,
    transaction,
  }) {
    return /** @type {*} */ (
      CoverSheetSheet.findOne({
        where: {
          BatchFileId: batchFile.id,
          isJudged: true,
        },
        transaction,
      })
    )
  }

  /**
   * Build the `TBL-05` rows of the judged worksheet.
   *
   * The currency is resolved to its master id here rather than in the parse, because the parse is
   * engine code that reads a workbook and the id is a fact about this database (`TBL-15`).
   *
   * @param {{
   *   coverSheetSheet: import('../../../sequelize/models/CoverSheetSheet.js').CoverSheetSheetEntity
   *   judgedWorksheet: verification.ParsedCoverSheetWorksheet
   * }} params - Parameters of this method.
   * @returns {Array<{
   *   CoverSheetSheetId: number
   *   CurrencyId: number
   *   rowNumber: number
   *   debitNoteNumber: string
   *   normalizedDebitNoteNumber: string
   *   description: string | null
   *   amountMinorUnits: number
   * }>} - The rows.
   */
  buildCoverSheetRowAttributes ({
    coverSheetSheet,
    judgedWorksheet,
  }) {
    return judgedWorksheet.coverSheetRows
      .map(parsedRow => ({
        CoverSheetSheetId: coverSheetSheet.id,
        CurrencyId: CURRENCY[parsedRow.currencyCode].ID,
        rowNumber: parsedRow.rowNumber,
        debitNoteNumber: parsedRow.debitNoteNumber,
        normalizedDebitNoteNumber: this.createDebitNoteNumberNormalizer({
          debitNoteNumber: parsedRow.debitNoteNumber,
        })
          .generateNormalizedNumber(),
        description: parsedRow.description,
        amountMinorUnits: parsedRow.amountMinorUnits,
      }))
  }

  /**
   * Create the normalizer a matching key is generated by.
   *
   * @param {{
   *   debitNoteNumber: string
   * }} params - Parameters of this method.
   * @returns {DebitNoteNumberNormalizer} - The normalizer.
   */
  createDebitNoteNumberNormalizer ({
    debitNoteNumber,
  }) {
    return DebitNoteNumberNormalizer.create({
      debitNoteNumber,
    })
  }

  /**
   * Carry the outcome just written onto whatever the batch had already judged (§5.3 step 6).
   *
   * **Normally this updates nothing.** A cover sheet is analyzed before its debit notes, so the
   * batch has no results yet and there is nothing to repair. It earns its place on the retry
   * (`API-M004`): an operator who fixes a wrong total and re-uploads has debit notes judged against
   * the old one, and a verdict still saying the total does not reconcile after the total was
   * corrected is the stale answer `DR-06` exists to prevent.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async repairJudgedDebitNotes ({
    batchFile,
  }) {
    await this.createExcelTotalCheckPropagator({
      batchFile,
    })
      .propagateCheckResult()
  }

  /**
   * Create the pass that rewrites check ② on the batch's existing results.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {ExcelTotalCheckPropagator} - The pass.
   */
  createExcelTotalCheckPropagator ({
    batchFile,
  }) {
    return ExcelTotalCheckPropagator.create({
      verificationBatchId: batchFile.VerificationBatchId,
    })
  }
}

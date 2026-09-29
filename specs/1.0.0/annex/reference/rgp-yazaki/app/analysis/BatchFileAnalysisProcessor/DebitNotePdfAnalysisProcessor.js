import BATCH_FILE_KIND_CONSTANT_HASH from '../../constants/batchFileKind.js'
import FILE_PROCESSING_LIMIT_CONSTANT_HASH from '../../constants/fileProcessingLimit.js'
import PROCESSING_STATUS_CONSTANT_HASH from '../../constants/processingStatus.js'

import {
  env,
} from '../../globals/_.js'

import EnvironmentLimit from '../../tools/EnvironmentLimit.js'

import ConsensusCountReader from '../../verification/ConsensusCountReader.js'
import DebitNoteJudge from '../../verification/DebitNoteJudge.js'
import ReadingConsensusReducer from '../../verification/ReadingConsensusReducer.js'

import BatchFile from '../../../sequelize/models/BatchFile.js'
import BatchFileKind from '../../../sequelize/models/BatchFileKind.js'

import BaseBatchFileAnalysisProcessor from '../BaseBatchFileAnalysisProcessor.js'
import BatchCoverSheetReader from '../BatchCoverSheetReader.js'
import BatchFileAnalysisFailure from '../BatchFileAnalysisFailure.js'
import DebitNoteJudgmentWriter from '../DebitNoteJudgmentWriter.js'
import OcrExtractionWriter from '../OcrExtractionWriter.js'
import ReadingFieldAgreementWriter from '../ReadingFieldAgreementWriter.js'

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH
const {
  FILE_PROCESSING_LIMIT,
} = FILE_PROCESSING_LIMIT_CONSTANT_HASH
const {
  PROCESSING_STATUS,
} = PROCESSING_STATUS_CONSTANT_HASH

/*
 * The states a cover sheet can be in that a debit note must not be judged against yet. `failed` is
 * deliberately absent: a cover sheet that will never arrive is not worth waiting for, and a debit
 * note is still judged on its signature without one (`ENG-03`).
 */
const UNSETTLED_COVER_SHEET_STATUS_IDS = [
  PROCESSING_STATUS.WAITING.ID,
  PROCESSING_STATUS.PROCESSING.ID,
]

/**
 * Reads one debit note and judges it (`AI-02` to `AI-04`, `ENG-02`, `ENG-03`).
 *
 * **Reading and judging are separate subjects here, as they are everywhere in this system**
 * (`DR-02`). The AI layer is asked what the document says and is never asked whether that is
 * acceptable; the engine decides that from what was read, and could decide it identically from a
 * reading typed in by hand. This class only carries the answer from one to the other and writes
 * down both.
 *
 * @extends {BaseBatchFileAnalysisProcessor}
 */
export default class DebitNotePdfAnalysisProcessor extends BaseBatchFileAnalysisProcessor {
  /** @override */
  get batchFileKindName () {
    return BATCH_FILE_KIND.DEBIT_NOTE_PDF.NAME
  }

  /**
   * get: How many times this file is read (`ENV-041` `FR-140`).
   *
   * **The count lives here rather than in the AI layer** (`ADR-21`): a processor that looped would
   * make "one call" and "one reading" different things, and `TBL-06` counts readings. Setting it to
   * `1` restores the single-reading behavior of 1.0.0 exactly, at a `1/1` agreement (`FR-144`).
   *
   * @override
   * @returns {number} - How many readings to take.
   */
  get targetReadingCount () {
    return this.configuredReadingCount
  }

  /**
   * Answer whether the cover sheet has settled enough for this note to be judged.
   *
   * A batch with no cover sheet at all is ready: nothing is coming, and check ③ answers `NG-006`
   * rather than waiting forever for a file the operator never uploaded.
   *
   * **After the third wait the answer is yes whatever the cover sheet is doing** (§5.3 step 2). The
   * note is then judged exactly as it is when the cover sheet `failed`: check ③ finds no row to match
   * against and answers `NG-006` with `cover_sheet_unavailable`, and the signature check still stands
   * on its own (`ENG-03`). That is a stated verdict the operator can act on, which is what an
   * endlessly re-queued file never becomes.
   *
   * **This reverses how 1.0.0 bounded the wait.** That version watched the clock - fifteen minutes
   * from the batch's `uploaded_at` - and argued a counter was impossible because the payload was one
   * id. 1.0.1 puts the counter in the payload instead (`coverSheetWaitCount`), which bounds the wait
   * by attempts rather than by wall time: three polls of twenty seconds cost three queue round trips
   * whatever else the host is doing, where a deadline measured from the upload gave a batch uploaded
   * an hour before its debit notes no wait at all.
   *
   * @override
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   coverSheetWaitCount: number
   *   coverSheetWaitLimit?: number
   * }} params - Parameters of this method.
   * @returns {Promise<boolean>} - true: the cover sheet is done, failed, absent, or waited out.
   */
  async isReadyToAnalyze ({
    batchFile,
    coverSheetWaitCount,
    coverSheetWaitLimit = FILE_PROCESSING_LIMIT.COVER_SHEET_WAIT_LIMIT,
  }) {
    if (coverSheetWaitCount >= coverSheetWaitLimit) {
      return true
    }

    const unsettledCoverSheet = await this.findUnsettledCoverSheet({
      batchFile,
    })

    return unsettledCoverSheet === null
  }

  /**
   * Find the batch's cover sheet while it is still going to change.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<import('../../../sequelize/models/BatchFile.js').BatchFileEntity | null>} - The cover sheet, or null.
   */
  async findUnsettledCoverSheet ({
    batchFile,
  }) {
    return /** @type {*} */ (
      BatchFile.findOne({
        where: {
          VerificationBatchId: batchFile.VerificationBatchId,
          ProcessingStatusId: UNSETTLED_COVER_SHEET_STATUS_IDS,
        },
        include: [
          {
            model: BatchFileKind,
            where: {
              name: BATCH_FILE_KIND.COVER_SHEET.NAME,
            },
          },
        ],
      })
    )
  }

  /**
   * Read one debit note as many times as `OCR_REPEAT_COUNT` says, and write down what it means.
   *
   * **`ENG-05` runs between the reading and everything else** (§6.1). The three checks are given one
   * set of values with an agreement level on each, so they judge what the readings agreed on rather
   * than whichever reading came back first - and `TBL-14` is that same reduction, stored.
   *
   * **The cap is checked before anything is stored**, so a document refused for its length leaves no
   * reading behind - which is what `ST-01` requires of a failed file and what `FR-025` asks be true
   * of the readings as well as of the judgment.
   *
   * @override
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   readingProgressTally?: import('../ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   * @throws {Error} - When the document could not be handed to a provider or read at all.
   */
  async analyzeBatchFile ({
    batchFile,
    readingProgressTally = this.createReadingProgressTally(),
  }) {
    const ocrExtractionOutcomes = await this.takeEachReading({
      batchFile,
      readingProgressTally,
    })

    const readingConsensus = this.reduceReadings({
      ocrExtractionOutcomes,
    })

    const pageCount = this.resolveConsensusPageCount({
      readingConsensus,
    })

    await this.recordPageCount({
      batchFile,
      pageCount,
    })

    this.ensurePageCountWithinCap({
      pageCount,
    })

    await this.storeOcrExtractions({
      batchFile,
      ocrExtractionOutcomes,
    })

    await this.storeReadingFieldAgreements({
      batchFile,
      readingConsensus,
    })

    await this.judgeDebitNote({
      batchFile,
      ocrExtractionOutcomes,
      readingConsensus,
      pageCount,
    })
  }

  /**
   * Read the document once per reading, one after another (§5.3 DN branch step 4).
   *
   * **Sequential, not parallel** (`ADR-21`). `JOB_CONCURRENCY` already bounds how hard the provider
   * is pushed, and taking the readings of one file at once would multiply that bound by
   * `OCR_REPEAT_COUNT` without anybody changing a setting (`NFR-011`).
   *
   * **The file is handed to the provider once and read from there** (`ADR-07`): the upload is the
   * AI layer's own business and `TBL-08` makes it idempotent, so repeating a reading costs tokens
   * rather than bandwidth (`NFR-006`).
   *
   * A reading that does not arrive throws, and nothing has been stored when it does - a partial set
   * is a failure rather than a smaller sample (`NFR-023`).
   *
   * Each reading is recorded on the tally as it comes back, which is how a run that never finishes
   * can still say how far it got: the allowance is a race this loop loses, so a `FAIL-01` sentence
   * has nothing else to name (`CMP-10`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   readingProgressTally: import('../ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<Array<ai.OcrExtractionOutcome>>} - What each reading said, in order.
   * @throws {BatchFileAnalysisFailure} - When a reading could not be obtained.
   */
  async takeEachReading ({
    batchFile,
    readingProgressTally,
  }) {
    return this.buildReadingIndexes()
      .reduce(
        async (previousOutcomes, readingIndex) => {
          const ocrExtractionOutcomes = await previousOutcomes

          const ocrExtractionOutcome = await this.extractDocument({
            batchFile,
            readingIndex,
            readingProgressTally,
          })

          readingProgressTally.recordCompletedReading({
            readingIndex,
          })

          return ocrExtractionOutcomes.concat(ocrExtractionOutcome)
        },
        /** @type {Promise<Array<ai.OcrExtractionOutcome>>} */ (Promise.resolve([]))
      )
  }

  /**
   * Ask the AI layer what the document says.
   *
   * **A null answer is thrown, not judged.** Nothing was read, so there is nothing to be NG about:
   * the document could not be handed over or the provider did not answer, and that is an
   * infrastructure failure (`FAIL-03`). A provider outage that produced two hundred NG judgments
   * would be indistinguishable from two hundred bad documents (`DR-03`).
   *
   * The failure names how many readings had arrived, which is what turns *"the provider refused"* and
   * *"only two of three answered"* into one code the operator can act on rather than two (`NFR-023`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   readingIndex: number
   *   readingProgressTally: import('../ReadingProgressTally.js').default
   * }} params - Parameters of this method.
   * @returns {Promise<ai.OcrExtractionOutcome>} - What was read.
   * @throws {Error} - When the reading could not be attempted at all.
   */
  async extractDocument ({
    batchFile,
    readingIndex,
    readingProgressTally,
  }) {
    const aiModelProcessor = await this.resolveAiModelProcessor()

    const ocrExtractionOutcome = await aiModelProcessor.extractDocument({
      batchFileId: batchFile.id,
      filePath: this.resolveStoredFilePath({
        batchFile,
      }),
      fileName: batchFile.fileName,
      readingIndex,
    })

    if (!ocrExtractionOutcome) {
      throw BatchFileAnalysisFailure.createProviderCallFailed({
        batchFileId: batchFile.id,
        readingProgressTally,
      })
    }

    return ocrExtractionOutcome
  }

  /**
   * Reduce every reading of the document to the one set of values the checks judge on (`ENG-05`).
   *
   * **This is where a file read three times becomes one answer with a level beside it.** A field two
   * of three readings produced is kept at `2/3`; a field they each answered differently is kept as
   * nothing at all, with `NG-008` saying so - never as the first reading's answer, which would be a
   * guess wearing a measurement's clothes (`FR-141` `FR-143` `DR-14`).
   *
   * @param {{
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   * }} params - Parameters of this method.
   * @returns {verification.ReadingConsensus} - What the readings agreed on.
   */
  reduceReadings ({
    ocrExtractionOutcomes,
  }) {
    return ReadingConsensusReducer.create({
      normalizedExtractions: ocrExtractionOutcomes
        .map(ocrExtractionOutcome => ocrExtractionOutcome.normalizedExtraction),
    })
      .reduceReadings()
  }

  /**
   * Read how long the readings agreed the document is.
   *
   * **One number serves three purposes and is therefore read once**: it is stored on `TBL-04`, it is
   * what the cap refuses a document by, and it is what an `NG-010` sentence names. Reading it three
   * times would let the file say one length and its reason say another.
   *
   * @param {{
   *   readingConsensus: verification.ReadingConsensus
   * }} params - Parameters of this method.
   * @returns {number | null} - The count, or null when the readings agreed on none.
   */
  resolveConsensusPageCount ({
    readingConsensus,
  }) {
    return this.createConsensusCountReader({
      consensusValue: readingConsensus.pageCount.consensusValue,
    })
      .readCount()
  }

  /**
   * Create the reading one stored count comes back through.
   *
   * @param {{
   *   consensusValue: string | null
   * }} params - Parameters of this method.
   * @returns {ConsensusCountReader} - The reading.
   */
  createConsensusCountReader ({
    consensusValue,
  }) {
    return ConsensusCountReader.create({
      consensusValue,
    })
  }

  /**
   * Write down how long the document turned out to be (`TBL-04`).
   *
   * Recorded before the cap is checked, and deliberately so: a file refused for being too long is
   * the one case where the operator most needs to be told the number, and `API-Q002` reads it from
   * here to say so (`FR-023` `UX-06`).
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   pageCount: number | null
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async recordPageCount ({
    batchFile,
    pageCount,
  }) {
    await BatchFile.update(
      {
        pageCount,
      },
      {
        where: {
          id: batchFile.id,
        },
      }
    )
  }

  /**
   * Refuse a document longer than the cap (`FAIL-02`).
   *
   * **Nothing has been written to `TBL-06` or `TBL-07` when this throws**, which is what `ST-01`
   * requires of a failed file: a partially processed batch must never hold a half-written
   * judgment. That is why the check sits here rather than after the extraction is stored, and it
   * reads the cap from the same constant `API-M003` refuses uploads with, so the number the
   * operator is shown cannot drift from the number that refused their file.
   *
   * **A document the readings could not agree the length of is not refused.** The cap answers "this
   * is longer than we process"; a null answers "nobody could tell", and `Number(null)` is `0` in this
   * language - so a comparison would quietly let every unmeasured document through as a short one.
   * Saying so out loud instead leaves the file judged and its disagreement reported as `NG-008`,
   * which is a stated finding rather than a silent pass (`DR-03`).
   *
   * @param {{
   *   pageCount: number | null
   *   pageCap?: number
   * }} params - Parameters of this method.
   * @returns {void}
   * @throws {BatchFileAnalysisFailure} - When the document runs past the cap.
   */
  ensurePageCountWithinCap ({
    pageCount,
    pageCap = EnvironmentLimit.create({
      limitLike: env.FILE_PAGE_CAP,
      fallbackLimit: FILE_PROCESSING_LIMIT.PAGE_CAP,
    })
      .generateLimit(),
  }) {
    if (pageCount === null) {
      return
    }

    if (pageCount <= pageCap) {
      return
    }

    throw BatchFileAnalysisFailure.createPageCapExceeded({
      pageCount,
      pageCap,
    })
  }

  /**
   * Store every reading of the document, as one set (`TBL-06`, rule 14).
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
   * Store what the readings agreed on, field by field (`TBL-14`).
   *
   * Written after the readings themselves, in the order they can be recomputed in: `NFR-031` says
   * these rows follow from `TBL-06` plus the currency master, and storing the conclusion before its
   * evidence would leave a window where that is not true of the database.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   readingConsensus: verification.ReadingConsensus
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
   * Run checks ②, ③ and ④ against what was read, and store the verdict (§5.3 DN branch step 7).
   *
   * Check ② is not re-run here: the cover sheet's own job wrote its outcome per currency, and this
   * reads the entry for this document's currency (`ENG-01`). The reasons it produces - `NG-001`,
   * `NG-004`, `NG-009` - land in **this** debit note's `TBL-11`, because the cover sheet's job had
   * no `TBL-07` row to attach them to when it ran.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   *   readingConsensus: verification.ReadingConsensus
   *   pageCount: number | null
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async judgeDebitNote ({
    batchFile,
    ocrExtractionOutcomes,
    readingConsensus,
    pageCount,
  }) {
    const coverSheetState = await this.readCoverSheetState({
      batchFile,
    })

    const debitNoteJudgment = DebitNoteJudge.create({
      coverSheetState,
      readingConsensus,
      pageCount,
      fileName: batchFile.fileName,
      judgedAt: this.resolveJudgedAt({
        ocrExtractionOutcomes,
      }),
    })
      .judgeDebitNote()

    await DebitNoteJudgmentWriter.create({
      batchFile,
      debitNoteJudgment,
    })
      .writeJudgment()
  }

  /**
   * Read the cover sheet this debit note is judged against.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {Promise<verification.BatchCoverSheetState>} - What the batch's cover sheet holds.
   */
  async readCoverSheetState ({
    batchFile,
  }) {
    return this.createBatchCoverSheetReader({
      batchFile,
    })
      .readCoverSheetState()
  }

  /**
   * Create the reader the cover sheet is read through.
   *
   * @param {{
   *   batchFile: import('../../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {BatchCoverSheetReader} - The reader.
   */
  createBatchCoverSheetReader ({
    batchFile,
  }) {
    return BatchCoverSheetReader.create({
      verificationBatchId: batchFile.VerificationBatchId,
    })
  }

  /**
   * Work out when this document was judged (`TBL-07.judged_at`).
   *
   * The moment the **last** reading was taken, which is the moment the set became judgeable: the
   * checks run in the same breath after it. Reading the clock again here would record a second time
   * that differs from the readings by the milliseconds this class spent writing them, and dating the
   * verdict from the first reading would put it before two of the readings it was made from.
   *
   * @param {{
   *   ocrExtractionOutcomes: Array<ai.OcrExtractionOutcome>
   * }} params - Parameters of this method.
   * @returns {Date} - When the judgment was made.
   */
  resolveJudgedAt ({
    ocrExtractionOutcomes,
  }) {
    return ocrExtractionOutcomes[ocrExtractionOutcomes.length - 1]
      .extractedAt
  }
}

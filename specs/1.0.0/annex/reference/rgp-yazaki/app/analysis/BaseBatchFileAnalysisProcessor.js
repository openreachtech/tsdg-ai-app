import FILE_PROCESSING_LIMIT_CONSTANT_HASH from '../constants/fileProcessingLimit.js'

import {
  env,
} from '../globals/_.js'

import UploadedFileStorage from '../storage/UploadedFileStorage.js'

import BulkAiModelProcessorsLoader from '../tools/BulkAiModelProcessorsLoader.js'
import EnvironmentLimit from '../tools/EnvironmentLimit.js'

import ReadingProgressTally from './ReadingProgressTally.js'

const {
  FILE_PROCESSING_LIMIT,
} = FILE_PROCESSING_LIMIT_CONSTANT_HASH

/*
 * How many readings a kind of file takes when its analysis never reaches the AI layer.
 */
const NO_READING_TAKEN = 0

/**
 * The contract `JOB-01` analyzes one uploaded file through (`40-backend.md` §5.3).
 *
 * A batch holds two kinds of file that share almost nothing: a cover sheet is parsed with exceljs
 * and never reaches an AI processor (`DR-01`), while a debit note is read by one and judged against
 * what the cover sheet produced. Putting both in the worker would make the file that carries the
 * queue's plumbing also carry the two longest procedures in the system.
 *
 * **This class does not judge and does not read the provider.** It says how a kind of file is
 * turned into rows in the database, and delegates the reading to `app/tools/` and the deciding to
 * `app/verification/` - the split `DR-02` rests on, which is also why this lives outside
 * `app/verification/`: the engine imports nothing that can open a socket.
 *
 * @abstract
 */
export default class BaseBatchFileAnalysisProcessor {
  /**
   * Constructor.
   *
   * @param {{
   *   uploadedFileStorage: UploadedFileStorage
   * }} params - Parameters of this constructor.
   */
  constructor ({
    uploadedFileStorage,
  }) {
    this.uploadedFileStorage = uploadedFileStorage
  }

  /**
   * Factory method.
   *
   * Every argument has a default, because `BulkBatchFileAnalysisProcessorsLoader` instantiates each
   * processor it discovers without knowing what any of them needs.
   *
   * @param {{
   *   uploadedFileStorage?: UploadedFileStorage
   * }} [params] - Parameters of this method.
   * @returns {BaseBatchFileAnalysisProcessor} - Instance of this class.
   */
  static create ({
    uploadedFileStorage = this.createUploadedFileStorage(),
  } = {}) {
    return new this({
      uploadedFileStorage,
    })
  }

  /**
   * Create the storage this reads uploaded files through.
   *
   * @returns {UploadedFileStorage} - The storage.
   */
  static createUploadedFileStorage () {
    return UploadedFileStorage.create()
  }

  /**
   * get: Which kind of file this analyzes, as `TBL-12` names it.
   *
   * The name rather than the id, because the id is a `BIGINT` and the two dialects this runs on do
   * not agree on what a `BIGINT` reads back as. A dispatch that silently stopped matching under
   * MariaDB would surface as every file failing on an unknown kind, in the one environment where
   * that is hardest to reproduce.
   *
   * @abstract
   * @returns {string} - Batch file kind name.
   * @throws {Error} - this function must be inherited
   */
  get batchFileKindName () {
    throw new Error('this function must be inherited')
  }

  /**
   * get: How many readings of this file a run takes (`ENV-041`).
   *
   * **Zero for a kind of file that is not read by the AI layer at all**, which is what a cover sheet
   * is until `ENV-043` turns `AI-05` on (`F-20`). The number is a property of the kind rather than of
   * the environment alone, and it is what a `FAIL-01` sentence names as the count the run set out to
   * take - so a cover-sheet timeout says nothing about readings instead of claiming it was part way
   * through three of them (`CMP-10`).
   *
   * @returns {number} - How many readings to take.
   */
  get targetReadingCount () {
    return NO_READING_TAKEN
  }

  /**
   * Answer whether this file can be analyzed yet.
   *
   * Most kinds can always be: a cover sheet is parsed from itself and depends on nothing. A debit
   * note is judged against what the cover sheet produced, so it has a predecessor and overrides
   * this. Asking the processor rather than the worker keeps the worker from having to know which
   * kinds have dependencies and what they are.
   *
   * **The count of waits so far is offered to every kind and used by the one that waits.** It comes
   * from the job body rather than from a column, because how long this dispatch has been waiting is
   * state of the dispatch and not of the document (`JOB-01` DN branch step 2).
   *
   * @param {{
   *   batchFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity
   *   coverSheetWaitCount?: number
   * }} params - Parameters of this method.
   * @returns {Promise<boolean>} - true: the file can be analyzed now.
   */
  async isReadyToAnalyze ({
    batchFile,
    coverSheetWaitCount,
  }) {
    return true
  }

  /**
   * Analyze one file.
   *
   * **The tally belongs to the run rather than to this class**, and that is why it arrives as an
   * argument: the loader builds one processor per kind and the worker analyzes `JOB_CONCURRENCY`
   * files through it at once, so a count kept here would be the count of whatever else was being
   * read alongside.
   *
   * @abstract
   * @param {{
   *   batchFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity
   *   readingProgressTally?: ReadingProgressTally
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   * @throws {Error} - this function must be inherited
   */
  async analyzeBatchFile ({
    batchFile,
    readingProgressTally,
  }) {
    throw new Error('this function must be inherited')
  }

  /**
   * Create the tally this run's readings are counted onto, for a caller that brought none.
   *
   * **The worker brings one, because it needs the same one afterwards** - a `FAIL-01` sentence names
   * how far the readings got, and the run that has to answer that is the run that was abandoned. This
   * exists so that a caller with no interest in the answer does not have to build one to ask for an
   * analysis.
   *
   * @param {{
   *   ReadingProgressTallyCtor?: typeof ReadingProgressTally
   * }} [params] - Parameters of this method.
   * @returns {ReadingProgressTally} - The tally.
   */
  createReadingProgressTally ({
    ReadingProgressTallyCtor = ReadingProgressTally,
  } = {}) {
    return ReadingProgressTallyCtor.create({
      targetReadingCount: this.targetReadingCount,
    })
  }

  /**
   * get: How many readings `OCR_REPEAT_COUNT` asks for (`ENV-041` `FR-140`).
   *
   * **Not the same question as `#get:targetReadingCount`**, which is how many readings *this kind of
   * file* takes: a cover sheet takes none unless `ENV-043` is on, and a debit note always takes this
   * many. Keeping the configured figure separate is what lets both kinds read it from one place
   * without either of them having to know why the other's answer differs.
   *
   * @returns {number} - The configured count.
   */
  get configuredReadingCount () {
    return EnvironmentLimit.create({
      limitLike: env.OCR_REPEAT_COUNT,
      fallbackLimit: FILE_PROCESSING_LIMIT.READING_REPEAT_COUNT,
    })
      .generateLimit()
  }

  /**
   * Build the ordinal of every reading to take, in the order to take them.
   *
   * The ordinals are the `reading_index` values the rows will carry, counted from zero, so the set
   * of a file read three times is `0`, `1`, `2` (`TBL-06`).
   *
   * @param {{
   *   targetReadingCount?: number
   * }} [params] - Parameters of this method.
   * @returns {Array<number>} - The ordinals.
   */
  buildReadingIndexes ({
    targetReadingCount = this.targetReadingCount,
  } = {}) {
    return Array.from(
      {
        length: targetReadingCount,
      },
      (unusedValue, readingIndex) => readingIndex
    )
  }

  /**
   * Resolve the processor that reads this kind of file at the configured model (`AI-04` `AI-05`).
   *
   * **The kind is half of what identifies a processor**, because the cover sheet and the debit note
   * are read by the same model and asked different questions. This class already knows which kind it
   * analyzes, so neither subclass has to name a processor - which is what keeps the AI layer
   * swappable by configuration rather than by editing a branch (`FR-090` `FR-091`).
   *
   * Built per file rather than held: the loader reads a directory, but which model is in force is
   * configuration, and a processor cached at start-up would keep answering with the model that was
   * configured then.
   *
   * @returns {Promise<import('../tools/BaseAiModelProcessor.js').default>} - The processor.
   * @throws {Error} - When no processor reads this kind of file at that model.
   */
  async resolveAiModelProcessor () {
    const loader = await BulkAiModelProcessorsLoader.createAsync()

    const modelName = loader.generateTargetModelName()

    const aiModelProcessor = loader.resolveProcessor({
      modelName,
      batchFileKindName: this.batchFileKindName,
    })

    if (!aiModelProcessor) {
      throw new Error(`no ai model processor of model: ${modelName} for kind: ${this.batchFileKindName}`)
    }

    return aiModelProcessor
  }

  /**
   * Resolve where on disk a file actually is (`STORE-01`).
   *
   * @param {{
   *   batchFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity
   * }} params - Parameters of this method.
   * @returns {string} - Absolute path of the stored file.
   */
  resolveStoredFilePath ({
    batchFile,
  }) {
    return this.uploadedFileStorage.resolveAbsolutePath({
      storedPath: batchFile.storedPath,
    })
  }
}

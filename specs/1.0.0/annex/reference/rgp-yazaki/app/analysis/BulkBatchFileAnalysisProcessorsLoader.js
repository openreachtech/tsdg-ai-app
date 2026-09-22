import {
  DeepBulkClassLoader,
} from '@openreachtech/renchan'

import {
  rootPath,
} from '../globals/_.js'

/*
 * Every class in here is a kind of file the job knows how to analyze. The directory is the
 * registry: a third kind would be a third file, and neither the worker nor this loader would learn
 * about it by being edited.
 */
const PROCESSOR_POOL_PATH = rootPath.to('app/analysis/BatchFileAnalysisProcessor/')

/**
 * Which processor a file of a given kind is analyzed by (`JOB-01`).
 *
 * The worker asks this and runs whatever comes back, which is what keeps
 * `if (kind === 'cover_sheet')` out of it - the branch that, once written, tends to be written
 * again in the failure path and in the progress path.
 */
export default class BulkBatchFileAnalysisProcessorsLoader {
  /**
   * Constructor.
   *
   * @param {{
   *   processors: Array<import('./BaseBatchFileAnalysisProcessor.js').default>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    processors,
  }) {
    this.processors = processors
  }

  /**
   * Factory method as async.
   *
   * Reads a directory, so it belongs to start-up rather than to each file being analyzed.
   *
   * @param {{
   *   poolPath?: string
   * }} [params] - Parameters of this method.
   * @returns {Promise<BulkBatchFileAnalysisProcessorsLoader>} - Instance of this class.
   */
  static async createAsync ({
    poolPath = PROCESSOR_POOL_PATH,
  } = {}) {
    const processorClasses = await this.loadProcessorClasses({
      poolPath,
    })

    return this.create({
      processors: processorClasses.map(ProcessorCtor => ProcessorCtor.create()),
    })
  }

  /**
   * Factory method.
   *
   * @param {{
   *   processors: Array<import('./BaseBatchFileAnalysisProcessor.js').default>
   * }} params - Parameters of this method.
   * @returns {BulkBatchFileAnalysisProcessorsLoader} - Instance of this class.
   */
  static create ({
    processors,
  }) {
    return new this({
      processors,
    })
  }

  /**
   * Load every processor class the pool holds.
   *
   * @param {{
   *   poolPath: string
   * }} params - Parameters of this method.
   * @returns {Promise<Array<typeof import('./BaseBatchFileAnalysisProcessor.js').default>>} - The classes.
   */
  static async loadProcessorClasses ({
    poolPath,
  }) {
    return /** @type {*} */ (
      DeepBulkClassLoader.create({
        poolPath,
      })
        .loadClasses()
    )
  }

  /**
   * Resolve the processor of one kind of file.
   *
   * Answers `null` on a kind no processor claims rather than picking one, so a row whose
   * `BatchFileKindId` points at something unforeseen fails loudly instead of being analyzed as
   * whichever kind happens to be first (`TBL-12`).
   *
   * @param {{
   *   batchFileKindName: string
   * }} params - Parameters of this method.
   * @returns {import('./BaseBatchFileAnalysisProcessor.js').default | null} - The processor, or null.
   */
  resolveProcessor ({
    batchFileKindName,
  }) {
    return this.processors
      .find(processor => processor.batchFileKindName === batchFileKindName)
      ?? null
  }
}

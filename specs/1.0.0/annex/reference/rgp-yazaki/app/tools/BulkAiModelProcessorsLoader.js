import {
  DeepBulkClassLoader,
} from '@openreachtech/renchan'

import AI_MODEL_NAME_CONSTANT_HASH from '../constants/aiModelName.js'
import AI_PROVIDER_CONSTANT_HASH from '../constants/aiProvider.js'

import {
  env,
  rootPath,
} from '../globals/_.js'

const {
  AI_MODEL_NAME,
} = AI_MODEL_NAME_CONSTANT_HASH

const {
  AI_PROVIDER,
} = AI_PROVIDER_CONSTANT_HASH

/*
 * Every class in here is one reader of one kind of file (`AI-04` `AI-05`). The directory is the
 * registry: adding a model is adding files, and nothing has to be told about it.
 */
const PROCESSOR_POOL_PATH = rootPath.to('app/tools/AiModelProcessor/')

/**
 * Which processor a run reads a given kind of file with (`AI-04` `AI-05` `FR-090`).
 *
 * **Callers never name a provider.** They ask this for a processor and get one, which is what keeps
 * `if (provider === 'gemini')` out of the job, the resolvers and the engine - the branch that, once
 * written in one place, tends to be written in four.
 *
 * **A model does not identify a processor on its own**, which is the one thing 1.0.1 changed here.
 * The cover sheet is read by the same model as a debit note and is asked a different question, held
 * to a different response schema and normalized into the other branch of §7.2 - so a processor is
 * identified by the model **and** by the kind of file it reads, and each branch of `JOB-01` asks for
 * the reader written for it rather than naming a class.
 *
 * The processors are discovered from the filesystem rather than listed here, so the list of readers
 * cannot fall out of step with the classes that implement them.
 */
export default class BulkAiModelProcessorsLoader {
  /**
   * Constructor.
   *
   * @param {{
   *   processors: Array<import('./BaseAiModelProcessor.js').default>
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
   * @returns {Promise<BulkAiModelProcessorsLoader>} - Instance of this class.
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
   *   processors: Array<import('./BaseAiModelProcessor.js').default>
   * }} params - Parameters of this method.
   * @returns {BulkAiModelProcessorsLoader} - Instance of this class.
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
   * @returns {Promise<Array<typeof import('./BaseAiModelProcessor.js').default>>} - The classes.
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
   * Generate which model the environment names.
   *
   * **`AI_PROVIDER=stub` names the stub and ignores the model name**, because the stub has no models
   * to choose between - it is its own provider and its own only model. That is the one two-valued
   * decision `ENV-030` allows, not a dispatch chain: a real provider names its model through its own
   * variable, and adding one adds a variable rather than a branch here (`40-backend.md` §10).
   *
   * @param {{
   *   providerName?: string
   *   modelName?: string
   * }} [params] - Parameters of this method.
   * @returns {string} - The model name to resolve a processor by.
   */
  generateTargetModelName ({
    providerName = env.AI_PROVIDER,
    modelName = env.GEMINI_MODEL_NAME,
  } = {}) {
    if (providerName === AI_PROVIDER.STUB.NAME) {
      return AI_MODEL_NAME.STUB
    }

    return modelName
  }

  /**
   * Resolve the processor that reads one kind of file at one model.
   *
   * Answers `null` when nothing claims the pair, rather than falling back to something: a misspelled
   * `GEMINI_MODEL_NAME` silently reading every document through some default model is exactly the
   * outcome `TBL-06.model_name` exists to make impossible (`FR-036`). The same answer covers a model
   * that has a debit-note reader and no cover-sheet one - a real state the moment a second model is
   * added, and one that must fail loudly rather than read a workbook with the wrong prompt.
   *
   * @param {{
   *   modelName: string
   *   batchFileKindName: string
   * }} params - Parameters of this method.
   * @returns {import('./BaseAiModelProcessor.js').default | null} - The processor, or null.
   */
  resolveProcessor ({
    modelName,
    batchFileKindName,
  }) {
    return this.processors
      .find(processor =>
        processor.modelName === modelName
        && processor.batchFileKindName === batchFileKindName
      )
      ?? null
  }
}

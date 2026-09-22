import {
  DeepBulkClassLoader,
} from '@openreachtech/renchan'

import {
  rootPath,
} from '../globals/_.js'

const dirname = rootPath.to('app/tools/AiModelProcessor')

/**
 * Loads and manages AI model processors discovered from app/tools/AiModelProcessor.
 */
export default class BulkAiModelProcessorsLoader {
  /**
   * Constructor
   *
   * @param {{
   *   processors: Array<object>
   * }} params
   */
  constructor ({
    processors,
  }) {
    this.processors = processors
  }

  /**
   * Creates an instance of BulkAiModelProcessorsLoader asynchronously
   *
   * @param {string} directoryPath - The path to load processors from
   * @returns {Promise<BulkAiModelProcessorsLoader>}
   */
  static async createAsync (directoryPath = dirname) {
    const processorClasses = await this.loadProcessorClasses(directoryPath)

    const processors = processorClasses.map(ProcessorClass =>
      ProcessorClass.create()
    )

    return new this({
      processors,
    })
  }

  /**
   * Creates an instance of BulkAiModelProcessorsLoader
   *
   * @param {{
   *   processors: Array<object>
   * }} params
   * @returns {BulkAiModelProcessorsLoader}
   */
  static create (params) {
    return new this(params)
  }

  /**
   * Loads processor classes from the specified path
   *
   * @param {string} path - The path to load processor classes from
   * @returns {Promise<Array<object>>}
   */
  static async loadProcessorClasses (path) {
    return DeepBulkClassLoader.create({ poolPath: path })
      .loadClasses()
  }

  /**
   * Gets a processor by ai model name
   *
   * @param {string} aiModel - The name of the ai model
   * @returns {object | undefined}
   */
  getProcessor (aiModel) {
    return this.processors.find(processor => processor.aiModel === aiModel)
  }
}

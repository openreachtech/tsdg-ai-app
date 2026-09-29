import {
  DeepBulkClassLoader,
} from '@openreachtech/renchan'

import {
  rootPath,
} from '../globals/_.js'

const dirname = rootPath.to('app/aiTools/Processors')

/**
 * Loads and manages AI tool processors discovered from app/aiTools/Processors.
 */
export default class BulkAiToolProcessorsLoader {
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
   * Creates an instance of BulkAiToolProcessorsLoader asynchronously
   *
   * @param {string} directoryPath - The path to load processors from
   * @returns {Promise<BulkAiToolProcessorsLoader>}
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
   * Creates an instance of BulkAiToolProcessorsLoader
   *
   * @param {{
   *   processors: Array<object>
   * }} params
   * @returns {BulkAiToolProcessorsLoader}
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
   * Gets a processor by ai tool name
   *
   * @param {string} aiToolName - The name of the ai tool
   * @returns {object | undefined}
   */
  getProcessor (aiToolName) {
    return this.processors.find(processor => processor.aiToolName === aiToolName)
  }
}

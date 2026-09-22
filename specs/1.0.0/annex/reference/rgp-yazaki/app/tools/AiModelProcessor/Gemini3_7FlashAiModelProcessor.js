import AI_MODEL_NAME_CONSTANT_HASH from '../../constants/aiModelName.js'
import BATCH_FILE_KIND_CONSTANT_HASH from '../../constants/batchFileKind.js'

import BaseGeminiAIProcessor from '../BaseAiModelProviderProcessor/BaseGeminiAIProcessor.js'

const {
  AI_MODEL_NAME,
} = AI_MODEL_NAME_CONSTANT_HASH

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH

/**
 * Gemini 3.7 Flash, as one selectable model (`AI-04` `FR-090`).
 *
 * **Its only member is which model it is**, and that is the point: everything about reading a debit
 * note through Gemini belongs to the provider base, so a second model is a second file of this size
 * and nothing else changes (`ENV-032`).
 *
 * It is the model chosen at kickoff, and why is recorded with the name in `constants/aiModelName.cjs`
 * rather than here - the reasoning is about the choice between models, not about this class. A
 * `Gemini3_1ProAiModelProcessor` beside it, for the comparison `OPEN-1` calls for, would be nine
 * lines.
 *
 * @extends {BaseGeminiAIProcessor}
 */
export default class Gemini3_7FlashAiModelProcessor extends BaseGeminiAIProcessor {
  /**
   * get: Which model this is.
   *
   * @override
   * @returns {string} - Model name.
   */
  get modelName () {
    return AI_MODEL_NAME.GEMINI_3_7_FLASH
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
}

import {
  env,
} from '../globals/_.js'

/*
 * Shipped alongside the prompt texts, and overridden by `OCR_PROMPT_VERSION` (`ENV-033`).
 *
 * **Bump it in the same change that edits either text.** Every `TBL-06` row records this string, and
 * the evaluation's whole ability to say which prompt produced which reading rests on the two moving
 * together (`FR-036`). Text edited without a bump makes every row already stored say something
 * untrue about itself.
 *
 * **One version covers both prompts, and it lives here so that is structural rather than a promise**
 * (§7.3). Two independent versions would let a comparison silently mix a v3 debit-note reading with
 * a v2 cover-sheet reading, and the disagreement between them would be attributed to the documents.
 */
const DEFAULT_PROMPT_VERSION = 'v2'

/**
 * What the AI is asked, and which version of the asking it is (`AI-02` `ENV-033`).
 *
 * **Provider-neutral by construction.** A prompt names no vendor and carries no request
 * configuration: media resolution, token limits and the structured-output schema are how one
 * provider is asked, and they live with that provider's processor. What is here is what any provider
 * would be asked, which is why swapping providers leaves these files alone (`40-backend.md` §10).
 *
 * Every processor carries one of these, the stub included, because `TBL-06.prompt_version` is
 * recorded for a stub run too.
 *
 * A subclass supplies one thing: the text. The version is the same question for every prompt and is
 * answered once, here.
 *
 * @abstract
 */
export default class BaseOcrPrompt {
  /**
   * Constructor.
   *
   * @param {{
   *   promptVersion: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    promptVersion,
  }) {
    this.promptVersion = promptVersion
  }

  /**
   * Factory method.
   *
   * @param {{
   *   promptVersion?: string
   * }} [params] - Parameters of this method.
   * @returns {BaseOcrPrompt} - Instance of this class.
   */
  static create ({
    promptVersion = env.OCR_PROMPT_VERSION || DEFAULT_PROMPT_VERSION,
  } = {}) {
    return new this({
      promptVersion,
    })
  }

  /**
   * get: What the model is told to do.
   *
   * @abstract
   * @returns {string} - The instruction.
   * @throws {Error} - this function must be inherited
   */
  get instructionText () {
    throw new Error('this function must be inherited')
  }
}

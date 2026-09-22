/**
 * A limit this application reads from an environment variable.
 *
 * Every one of them is a positive whole number - a byte ceiling, a file count, a page cap, the
 * hours a token stays valid - so the class answers one question: is what the environment holds
 * usable as a limit, and if not, what does the application use instead.
 *
 * **`Number()` does not answer that on its own.** An unset variable parses to `NaN`, an empty one
 * to `0`, and a negative one to a number that is perfectly valid and means nothing as a ceiling.
 * `??` cannot catch any of the three, because none of them is nullish; `||` catches the first two
 * and lets a negative through. Both are one expression short of the rule, which is why the rule
 * lives in a class with tests rather than in a default parameter.
 *
 * The fallback is passed in rather than read here: what a limit falls back to is the caller's
 * constant (`UPLOAD_LIMIT`, `FILE_PROCESSING_LIMIT`), and a class that knew them all would have to
 * be edited every time one is added.
 */
export default class EnvironmentLimit {
  /**
   * Constructor.
   *
   * @param {{
   *   limitLike?: string
   *   fallbackLimit: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    limitLike,
    fallbackLimit,
  }) {
    this.limitLike = limitLike
    this.fallbackLimit = fallbackLimit
  }

  /**
   * Factory method.
   *
   * @param {{
   *   limitLike?: string
   *   fallbackLimit: number
   * }} params - Parameters of this method.
   * @returns {EnvironmentLimit} - Instance of this class.
   */
  static create ({
    limitLike,
    fallbackLimit,
  }) {
    return new this({
      limitLike,
      fallbackLimit,
    })
  }

  /**
   * Generate the limit the application runs with.
   *
   * @returns {number} - The environment's limit, or the fallback when it holds no usable one.
   */
  generateLimit () {
    const limit = Number(this.limitLike)

    // Excludes NaN and Infinity, and a fractional byte count or page count as well.
    if (!Number.isInteger(limit)) {
      return this.fallbackLimit
    }

    // A ceiling of zero admits nothing and a negative one is not a ceiling at all.
    if (limit < 1) {
      return this.fallbackLimit
    }

    return limit
  }
}

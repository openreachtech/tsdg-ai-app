/*
 * The one value that turns a switch on, matched without regard to case.
 *
 * **One spelling, and only one.** Admitting `1`, `yes` and `on` as well would give an operator four
 * ways to be right and no way to tell which one a colleague used; a single spelling makes a
 * misconfiguration read as a misconfiguration rather than as a near miss.
 */
const TURNED_ON_TEXT = 'true'

/**
 * A switch this application reads from an environment variable, and which is **off unless the
 * environment explicitly turns it on**.
 *
 * **Off is not a fallback here, it is the answer** - which is why this class takes no default to
 * fall back to. Unset, empty, misspelled, `'flase'`, `'TRUE '` with a stray space: every one of them
 * is an environment that did not say yes, and every one of them reads as off. There is no way to
 * construct this class such that a variable nobody set comes out on, and for `ENV-043` that is the
 * property rather than a convenience - the switch guards whether a client's workbook leaves the host
 * (`SEC-009`), and the safe direction of a misconfiguration is not a matter of taste.
 *
 * **`Boolean()` does not answer this.** Every non-empty string is truthy, so `'false'` - the value
 * `.env.example` ships - would read as on. That single line is why the rule lives in a class with
 * tests rather than in a default parameter, exactly as it does for `EnvironmentLimit`.
 *
 * A switch that should default to **on** is a different thing: it defaults to acting, so what it
 * needs is an explicit way to say no. It gets its own class rather than an argument here, because
 * an argument would let a caller of this one hand in `true` and undo the paragraph above.
 */
export default class EnvironmentSwitch {
  /**
   * Constructor.
   *
   * @param {{
   *   switchLike?: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    switchLike,
  }) {
    this.switchLike = switchLike
  }

  /**
   * Factory method.
   *
   * @param {{
   *   switchLike?: string
   * }} params - Parameters of this method.
   * @returns {EnvironmentSwitch} - Instance of this class.
   */
  static create ({
    switchLike,
  }) {
    return new this({
      switchLike,
    })
  }

  /**
   * Answer whether the environment turned this switch on.
   *
   * @returns {boolean} - true: the environment said so in as many words.
   */
  isTurnedOn () {
    if (typeof this.switchLike !== 'string') {
      return false
    }

    return this.switchLike.trim()
      .toLowerCase() === TURNED_ON_TEXT
  }
}

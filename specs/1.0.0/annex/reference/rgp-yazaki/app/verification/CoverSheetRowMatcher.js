import DebitNoteNumberMatchStrategy from './CoverSheetRowMatchStrategy/DebitNoteNumberMatchStrategy.js'
import FileNameMatchStrategy from './CoverSheetRowMatchStrategy/FileNameMatchStrategy.js'

/*
 * The rules of `ENG-02`, in the order they are tried (`40-backend.md` §6.1).
 *
 * The order is the rule: the number printed on the document is better evidence than the name someone
 * gave the file, so the file name only gets a turn when the printed number matched nothing.
 */
const MATCH_STRATEGY_CTORS = [
  DebitNoteNumberMatchStrategy,
  FileNameMatchStrategy,
]

/**
 * Which cover-sheet row a debit note belongs to (`ENG-02` `ADR-10`).
 *
 * **The first rule that finds anything wins, and the rest are not tried.** A later rule cannot
 * rescue an ambiguous earlier answer or add to it: two rows carrying the same printed number is an
 * ambiguity about that number, and looking at the file name next would resolve it by luck.
 *
 * The result is deliberately a **list**, not a row. Deciding what none or several of them means
 * belongs to check ③, which turns either into `NG-006` with every candidate named (`FR-037`).
 */
export default class CoverSheetRowMatcher {
  /**
   * Constructor.
   *
   * @param {{
   *   debitNoteNumber: string | null
   *   coverSheetRows: Array<verification.ComparedCoverSheetRow>
   *   fileName: string
   *   matchStrategyCtors: Array<typeof import('./CoverSheetRowMatchStrategy/BaseCoverSheetRowMatchStrategy.js').default>
   * }} params - Parameters of this constructor.
   */
  constructor ({
    debitNoteNumber,
    coverSheetRows,
    fileName,
    matchStrategyCtors,
  }) {
    this.debitNoteNumber = debitNoteNumber
    this.coverSheetRows = coverSheetRows
    this.fileName = fileName
    this.matchStrategyCtors = matchStrategyCtors
  }

  /**
   * Factory method.
   *
   * @param {{
   *   debitNoteNumber: string | null
   *   coverSheetRows: Array<verification.ComparedCoverSheetRow>
   *   fileName: string
   *   matchStrategyCtors?: Array<typeof import('./CoverSheetRowMatchStrategy/BaseCoverSheetRowMatchStrategy.js').default>
   * }} params - Parameters of this method.
   * @returns {CoverSheetRowMatcher} - Instance of this class.
   */
  static create ({
    debitNoteNumber,
    coverSheetRows,
    fileName,
    matchStrategyCtors = MATCH_STRATEGY_CTORS,
  }) {
    return new this({
      debitNoteNumber,
      coverSheetRows,
      fileName,
      matchStrategyCtors,
    })
  }

  /**
   * Collect the rows this debit note could belong to.
   *
   * @returns {Array<verification.ComparedCoverSheetRow>} - The candidates, possibly none or several.
   */
  collectMatchedRows () {
    return this.matchStrategyCtors
      .reduce(
        (matchedRows, MatchStrategyCtor) => (
          matchedRows.length > 0
            ? matchedRows
            : this.createMatchStrategy({
              MatchStrategyCtor,
            })
              .collectMatchedRows()
        ),
        /** @type {Array<verification.ComparedCoverSheetRow>} */ ([])
      )
  }

  /**
   * Create one matching rule over this debit note.
   *
   * @param {{
   *   MatchStrategyCtor: typeof import('./CoverSheetRowMatchStrategy/BaseCoverSheetRowMatchStrategy.js').default
   * }} params - Parameters of this method.
   * @returns {import('./CoverSheetRowMatchStrategy/BaseCoverSheetRowMatchStrategy.js').default} - The rule.
   */
  createMatchStrategy ({
    MatchStrategyCtor,
  }) {
    return MatchStrategyCtor.create({
      debitNoteNumber: this.debitNoteNumber,
      coverSheetRows: this.coverSheetRows,
      fileName: this.fileName,
    })
  }
}

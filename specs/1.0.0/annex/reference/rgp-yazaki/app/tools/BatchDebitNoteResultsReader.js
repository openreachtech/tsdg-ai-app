import BatchFile from '../../sequelize/models/BatchFile.js'
import CoverSheetRow from '../../sequelize/models/CoverSheetRow.js'
import DebitNoteNgReason from '../../sequelize/models/DebitNoteNgReason.js'
import DebitNoteResult from '../../sequelize/models/DebitNoteResult.js'
import NgReasonCode from '../../sequelize/models/NgReasonCode.js'
import ReadingFieldAgreement from '../../sequelize/models/ReadingFieldAgreement.js'

/**
 * Every judgment of one batch, in the one order this system states them in.
 *
 * **`FR-061` says the report's content equals what the screen shows**, and the strongest way to
 * mean that is for both to read through here. `API-Q002` renders these rows to `SCR-04` and the
 * report generator renders the same rows to a worksheet; a second query with its own `order` would
 * make "equal" a thing to test for rather than a thing that holds.
 *
 * **NG first is the order, not a sort a client applies** (`FR-042`). An operator opens the screen
 * to find what needs looking at, and a report that opened on the notes that passed would make them
 * scroll past the answer. `false` sorts before `true`, which is what puts NG at the top; the id
 * breaks ties so two reads of one batch come back the same way.
 *
 * **The reasons of one judgment are ordered too**, by code and then by id. An include with no order
 * of its own leaves that to whatever the dialect happens to do, which is not the same answer under
 * SQLite as under MariaDB - and a report whose findings came out in a different order from the
 * screen's would be `FR-061` failing on something nobody would think to check.
 */
export default class BatchDebitNoteResultsReader {
  /**
   * Constructor.
   *
   * @param {{
   *   verificationBatchId: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    verificationBatchId,
  }) {
    this.verificationBatchId = verificationBatchId
  }

  /**
   * Factory method.
   *
   * @param {{
   *   verificationBatchId: number
   * }} params - Parameters of this method.
   * @returns {BatchDebitNoteResultsReader} - Instance of this class.
   */
  static create ({
    verificationBatchId,
  }) {
    return new this({
      verificationBatchId,
    })
  }

  /**
   * Read every judgment of the batch, its file, its reasons and what its readings agreed on.
   *
   * **The agreements come through the file, in this one query.** `SCR-04` marks a shaky row in a
   * table of up to 200 (`FR-142`), and asking per debit note would be 200 round trips to fill one
   * column. The matched cover sheet row rides along for the same reason: `matchedAmount` sits
   * beside `extractedAmount` on every row, and the pair is what the operator compares.
   *
   * @returns {Promise<Array<import('./DebitNoteResultSummaryFormatter.js').DebitNoteResultWithReasonsEntity>>} - Every judgment.
   */
  async readDebitNoteResults () {
    return /** @type {*} */ (
      DebitNoteResult.findAll({
        where: {
          VerificationBatchId: this.verificationBatchId,
        },
        order: [
          ['isOverallPassed', 'ASC'],
          ['id', 'ASC'],
          [DebitNoteNgReason, 'NgReasonCodeId', 'ASC'],
          [DebitNoteNgReason, 'id', 'ASC'],
        ],
        include: [
          {
            model: BatchFile,
            include: [
              ReadingFieldAgreement,
            ],
          },
          CoverSheetRow,
          {
            model: DebitNoteNgReason,
            include: [
              NgReasonCode,
            ],
          },
        ],
      })
    )
  }
}

import BATCH_FILE_KIND_CONSTANT_HASH from '../constants/batchFileKind.js'

import BatchFile from '../../sequelize/models/BatchFile.js'
import BatchFileKind from '../../sequelize/models/BatchFileKind.js'
import CoverSheetRow from '../../sequelize/models/CoverSheetRow.js'
import CoverSheetSheet from '../../sequelize/models/CoverSheetSheet.js'

const {
  BATCH_FILE_KIND,
} = BATCH_FILE_KIND_CONSTANT_HASH

/**
 * Everything a debit note is judged against, read from one batch's cover sheet.
 *
 * **Read back from the database rather than passed along from the parse**, which is deliberate: it
 * makes a debit note's verdict a function of stored state, so one processed hours after its cover
 * sheet gets the same answer as one processed beside it. It is also the only option open to the
 * retry path, which re-judges results whose own job finished long ago (`API-M004`).
 *
 * **Every reader of check ② comes through here** - the debit note branch judging a document, the
 * cover sheet branch repairing the documents it already judged (§5.3), and `API-Q002` showing the
 * batch what its worksheet reconciled to. Two copies of these queries would eventually answer
 * differently for one batch, and `DebitNoteJudge` is explicit that every debit note of a batch must
 * see the same cover sheet - which is also why the screen reads the stored outcome rather than
 * summing the rows a second way (30-api-contract.md §2.5).
 *
 * **The rows are the judged worksheet's alone.** Check ③ compares a document against a row of the
 * month the judgment used, and rows from another worksheet would be a different month's invoices
 * competing to match the same debit note number (`FR-039`).
 */
export default class BatchCoverSheetReader {
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
   * @returns {BatchCoverSheetReader} - Instance of this class.
   */
  static create ({
    verificationBatchId,
  }) {
    return new this({
      verificationBatchId,
    })
  }

  /**
   * Read the batch's cover sheet as the judgment sees it.
   *
   * A batch with no cover sheet at all answers with a null name and nothing else, rather than
   * throwing: an operator who never uploaded one still gets a judgment, on the signature alone
   * (`ENG-03`), and the checks that needed the Excel side say so themselves.
   *
   * @returns {Promise<verification.BatchCoverSheetState>} - What the batch's cover sheet holds.
   */
  async readCoverSheetState () {
    const coverSheetFile = await this.findCoverSheetFile()

    const coverSheetSheets = await this.findCoverSheetSheets({
      coverSheetFile,
    })

    const coverSheetRows = await this.findCoverSheetRows({
      coverSheetSheets,
    })

    return {
      coverSheetFileName: coverSheetFile?.fileName ?? null,
      coverSheetSheets,
      coverSheetRows,
    }
  }

  /**
   * Find the batch's cover sheet.
   *
   * Matched on the kind's name rather than its id: a `BIGINT` reads back as a string from MariaDB
   * and as a number from SQLite, so a comparison against the id would hold in tests and quietly
   * stop matching in the live environment.
   *
   * **The lowest file name wins, and a batch can hold more than one candidate** (`TBL-04`). 1.0.1
   * refused a folder holding two workbooks at `API-M002` (`ERR-104`) and 1.0.2 refuses nothing for
   * its kind (`ADR-25`), so the second workbook is a row like any other. Without an order this read
   * took whichever row the database returned first - the same dialect-dependent answer the kind
   * lookup above is written to avoid, and one that disagreed with `API-Q002`, which lists a batch's
   * files by kind and then by name. **The rule is names rather than ids because the client applies
   * it too**: `CMP-13` names the cover sheet of each folder before a byte is sent, and it can
   * compare names where it cannot know ids. The `id` breaks a tie only a case-insensitive collation
   * can report, so the query is total on both dialects.
   *
   * What a second workbook *means* is still open (`OPEN-9`); this only decides which one is read.
   *
   * @returns {Promise<import('../../sequelize/models/BatchFile.js').BatchFileEntity | null>} - The cover sheet, or null.
   */
  async findCoverSheetFile () {
    return /** @type {*} */ (
      BatchFile.findOne({
        where: {
          VerificationBatchId: this.verificationBatchId,
        },
        order: [
          ['fileName', 'ASC'],
          ['id', 'ASC'],
        ],
        include: [
          {
            model: BatchFileKind,
            where: {
              name: BATCH_FILE_KIND.COVER_SHEET.NAME,
            },
          },
        ],
      })
    )
  }

  /**
   * Find every worksheet the cover sheet was parsed into (`TBL-13`).
   *
   * Hidden worksheets come back too. They were never candidates, but they are what tells a reason
   * how many worksheets the workbook held and which of them a rule could have chosen (`NG-009`).
   *
   * @param {{
   *   coverSheetFile: import('../../sequelize/models/BatchFile.js').BatchFileEntity | null
   * }} params - Parameters of this method.
   * @returns {Promise<Array<import('../../sequelize/models/CoverSheetSheet.js').CoverSheetSheetEntity>>} - The worksheets, in workbook order.
   */
  async findCoverSheetSheets ({
    coverSheetFile,
  }) {
    if (!coverSheetFile) {
      return []
    }

    return /** @type {*} */ (
      CoverSheetSheet.findAll({
        where: {
          BatchFileId: coverSheetFile.id,
        },
        order: [
          ['sheetIndex', 'ASC'],
        ],
      })
    )
  }

  /**
   * Find the rows of the worksheet the judgment used (`TBL-05`).
   *
   * @param {{
   *   coverSheetSheets: Array<import('../../sequelize/models/CoverSheetSheet.js').CoverSheetSheetEntity>
   * }} params - Parameters of this method.
   * @returns {Promise<Array<verification.ComparedCoverSheetRow>>} - The rows, empty when no worksheet was judged.
   */
  async findCoverSheetRows ({
    coverSheetSheets,
  }) {
    const judgedSheet = this.findJudgedSheet({
      coverSheetSheets,
    })

    if (!judgedSheet) {
      return []
    }

    return /** @type {*} */ (
      CoverSheetRow.findAll({
        where: {
          CoverSheetSheetId: judgedSheet.id,
        },
        order: [
          ['rowNumber', 'ASC'],
        ],
      })
    )
  }

  /**
   * Find the worksheet the judgment used (`TERM-16`).
   *
   * Null is a real answer rather than an error: a workbook whose worksheet could not be chosen
   * carries false on every row (`NG-009`), and so does a file that never parsed.
   *
   * @param {{
   *   coverSheetSheets: Array<import('../../sequelize/models/CoverSheetSheet.js').CoverSheetSheetEntity>
   * }} params - Parameters of this method.
   * @returns {import('../../sequelize/models/CoverSheetSheet.js').CoverSheetSheetEntity | null} - The worksheet, or null.
   */
  findJudgedSheet ({
    coverSheetSheets,
  }) {
    return coverSheetSheets
      .find(coverSheetSheet => coverSheetSheet.isJudged)
      ?? null
  }
}

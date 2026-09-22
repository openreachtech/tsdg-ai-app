/**
 * Writes the one line `API-M005` leaves behind for each upload it closed (`OPS-09`).
 *
 * **It is the only record of what a real folder actually looked like**, and `OPEN-9` is answered
 * from it: how deep the trees are, how often a folder holds folders, and how many files arrive that
 * no batch wants. Nothing else in the system reports the shape of an upload, because `TBL-03` keeps
 * only what became a batch and says nothing about the folders that did not.
 *
 * **A line on every upload, whatever came out of it.** A folder of holiday photographs uploads as
 * cleanly as a folder of debit notes now that nothing is refused (`ADR-25`), and a line written
 * only when something looked wrong would leave the ordinary uploads - the ones the question is
 * answered from - unrecorded.
 *
 * **The folder name is logged and no file name is.** `OPS-09` draws the line there: the operator's
 * filing is structure, and a file name can carry a debit note number. `SEC-003` counts a log line as
 * an exposure path like any other, which is why `#buildDerivationPayload()` is asserted whole in its
 * test rather than field by field.
 *
 * **The folder paths themselves are counted rather than listed.** `TBL-03` holds the paths that
 * became batches and can be read whenever the shape is wanted; what the log adds is the scale, and
 * a line carrying thirty paths would be read by nobody.
 */
export default class BatchUploadDerivationLogger {
  /**
   * Constructor.
   *
   * @param {{
   *   timber: Console
   * }} params - Parameters of this constructor.
   */
  constructor ({
    timber,
  }) {
    this.timber = timber
  }

  /**
   * Factory method.
   *
   * @param {{
   *   timber: Console
   * }} params - Parameters of this method.
   * @returns {BatchUploadDerivationLogger} - Instance of this class.
   */
  static create ({
    timber,
  }) {
    return new this({
      timber,
    })
  }

  /**
   * get: The operation the line came from.
   *
   * The server log carries every operation, so the line needs a name to be found among them - the
   * part `BatchFileOutcomeLogger` plays with `jobName`.
   *
   * @returns {string} - Name of the operation, as the contract spells it.
   */
  static get operationName () {
    return 'finalizeBatchUpload'
  }

  /**
   * Write what one derivation found.
   *
   * @param {{
   *   batchUpload: import('../../sequelize/models/BatchUpload.js').BatchUploadEntity
   *   folderCount: number
   *   batchCount: number
   *   unbatchedFileCount: number
   *   durationMilliseconds: number
   * }} params - Parameters of this method.
   * @returns {void}
   */
  logDerivation ({
    batchUpload,
    folderCount,
    batchCount,
    unbatchedFileCount,
    durationMilliseconds,
  }) {
    this.timber.info(
      this.buildDerivationPayload({
        batchUpload,
        folderCount,
        batchCount,
        unbatchedFileCount,
        durationMilliseconds,
      })
    )
  }

  /**
   * Build what the line says.
   *
   * The five figures `OPS-09` names - the upload id, how many folders the tree held, how many became
   * batches, how many files reached no batch, how long the derivation took - plus the two that make
   * a line findable among the others: the operation, and the folder the operator selected.
   *
   * **`batchCount` travels with `folderCount`.** Alone it cannot be read: five batches out of six
   * folders is a month filed by day, and five out of five is a month filed flat. The pair says
   * which, and the difference is exactly the labelling folders (`TERM-23`).
   *
   * @param {{
   *   batchUpload: import('../../sequelize/models/BatchUpload.js').BatchUploadEntity
   *   folderCount: number
   *   batchCount: number
   *   unbatchedFileCount: number
   *   durationMilliseconds: number
   * }} params - Parameters of this method.
   * @returns {{
   *   operationName: string
   *   batchUploadId: number
   *   rootFolderName: string
   *   folderCount: number
   *   batchCount: number
   *   unbatchedFileCount: number
   *   durationMilliseconds: number
   * }} - The line's payload.
   */
  buildDerivationPayload ({
    batchUpload,
    folderCount,
    batchCount,
    unbatchedFileCount,
    durationMilliseconds,
  }) {
    return {
      operationName: this.constructor.operationName,
      batchUploadId: batchUpload.id,
      rootFolderName: batchUpload.rootFolderName,
      folderCount,
      batchCount,
      unbatchedFileCount,
      durationMilliseconds,
    }
  }
}

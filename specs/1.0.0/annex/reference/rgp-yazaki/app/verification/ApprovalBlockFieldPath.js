/*
 * The array a block field hangs off in `TBL-14.field_path`.
 *
 * Module-local because nothing outside builds a path: callers name a member and an index, and this
 * class is the only place that knows how the two are spelled together.
 */
const APPROVAL_BLOCKS_ARRAY_NAME = 'approvalBlocks'

/**
 * How `TBL-14.field_path` names one field of one approval block.
 *
 * **The indexed form is a storage key, and the stripped form is a dictionary key.** `TBL-14` stores
 * `approvalBlocks[0].blockLabel` because the path has to stay unique per file; `NG-007`, `NG-008`
 * and `CoverSheetDisagreement` carry `approvalBlock.blockLabel` plus the index separately, because
 * those reach a rendered sentence and a literal indexed path could never be a dictionary key
 * (`DR-13`, 40-backend.md §6.2). `constants/fieldPath` owns the stripped vocabulary; this class
 * owns the indexed one, and neither is derived from the other by string surgery.
 *
 * **One instance is one block's set of paths.** `ENG-05` writes them and the evidence view reads
 * them back, and a format spelled in both places is a format that can come to differ in one of
 * them. The read side never parses: block indices are contiguous from 0 because `ENG-05` assigns
 * them by sorted position, so a reader walks upward and stops at the first index with no rows.
 */
export default class ApprovalBlockFieldPath {
  /**
   * Constructor.
   *
   * @param {{
   *   blockIndex: number
   * }} params - Parameters of this constructor.
   */
  constructor ({
    blockIndex,
  }) {
    this.blockIndex = blockIndex
  }

  /**
   * Factory method.
   *
   * @param {{
   *   blockIndex: number
   * }} params - Parameters of this method.
   * @returns {ApprovalBlockFieldPath} - Instance of this class.
   * @public
   */
  static create ({
    blockIndex,
  }) {
    return new this({
      blockIndex,
    })
  }

  /**
   * get: The four members a block carries, as `TBL-14` spells them.
   *
   * Spelled here rather than derived from the stripped vocabulary, because the two forms differ by
   * more than an index: `approvalBlock.blockLabel` is the dictionary key and
   * `approvalBlocks[0].blockLabel` is the storage key, and turning one into the other by string
   * surgery would be a rule nobody could see.
   *
   * @returns {{
   *   BLOCK_LABEL: string
   *   APPROVER_LAST_NAME: string
   *   APPROVER_DEPARTMENT: string
   *   IS_SIGNATURE_PRESENT: string
   * }} - Member name by role.
   * @public
   */
  static get memberName () {
    return {
      BLOCK_LABEL: 'blockLabel',
      APPROVER_LAST_NAME: 'approverLastName',
      APPROVER_DEPARTMENT: 'approverDepartment',
      IS_SIGNATURE_PRESENT: 'isSignaturePresent',
    }
  }

  /**
   * Build the stored path of one member of this block.
   *
   * @param {{
   *   memberName: string
   * }} params - Parameters of this method.
   * @returns {string} - The indexed path, as `TBL-14` stores it.
   * @public
   */
  buildMemberPath ({
    memberName,
  }) {
    return `${APPROVAL_BLOCKS_ARRAY_NAME}[${this.blockIndex}].${memberName}`
  }
}

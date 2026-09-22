import {
  mkdir,
  rm,
} from 'fs/promises'

import path from 'path'

import UploadedFileStorage from './UploadedFileStorage.js'

/*
 * The scratch directory, beside the uploads rather than inside them (`STORE-03`).
 *
 * Beside, because `STORE-01` is the one irreplaceable store this system has and nothing deletes
 * from it (`DR-10`) - while everything in here is deleted within the job that wrote it. Two
 * lifetimes that opposite do not belong in one directory, where a sweeper written for the second
 * would be one path mistake away from the first.
 */
const EXTRACTED_DIRECTORY_NAME = 'extracted'

const EXTRACTED_FILE_EXTENSION = '.xlsx'

/**
 * Storage of the single-worksheet workbooks that go to the provider in place of the client's own
 * file (`STORE-03` `ADR-23`).
 *
 * **Everything here is temporary by design and referenced by no table.** A file exists between the
 * extraction and the last reading, and is deleted in the same job's `finally` - on the failure path
 * as much as on the success one. Nothing here survives a job, which is why no row points at it and
 * why there is no sweeper: a store swept later is a store that holds client data in the meantime.
 *
 * **The name is the `BatchFileId` and nothing else.** One cover-sheet run has one extraction, so a
 * minted name would only make the file harder to account for while it is on disk - and the whole
 * safety argument here rests on being able to say, of any file in this directory, which run left it
 * behind.
 */
export default class ExtractedWorkbookStorage {
  /**
   * Constructor.
   *
   * @param {{
   *   storageDirectoryPath: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    storageDirectoryPath,
  }) {
    this.storageDirectoryPath = storageDirectoryPath
  }

  /**
   * Factory method.
   *
   * @param {{
   *   storageDirectoryPath?: string
   * }} [params] - Parameters of this method.
   * @returns {ExtractedWorkbookStorage} - Instance of this class.
   */
  static create ({
    storageDirectoryPath = this.resolveStorageDirectoryPath(),
  } = {}) {
    return new this({
      storageDirectoryPath,
    })
  }

  /**
   * Resolve the directory every extracted workbook is written into.
   *
   * **It asks `UploadedFileStorage` where the uploads are rather than reading `ENV-010` again.**
   * `STORE-03` is defined as a directory beside `FILE_STORAGE_PATH`, and two classes each resolving
   * that variable is two places for the relative-versus-absolute rule to be got right - with the
   * failure being a scratch directory the two processes disagree about, which is `ENV-010`'s own
   * most likely misconfiguration wearing a second face.
   *
   * @param {{
   *   uploadedFileStorageDirectoryPath?: string
   * }} [params] - Parameters of this method.
   * @returns {string} - Absolute path of the scratch directory.
   */
  static resolveStorageDirectoryPath ({
    uploadedFileStorageDirectoryPath = UploadedFileStorage.resolveStorageDirectoryPath(),
  } = {}) {
    return path.join(
      uploadedFileStorageDirectoryPath,
      EXTRACTED_DIRECTORY_NAME
    )
  }

  /**
   * Create the scratch directory if it is not already there.
   *
   * @returns {Promise<void>}
   */
  async createStorageDirectory () {
    await mkdir(
      this.storageDirectoryPath,
      {
        recursive: true,
      }
    )
  }

  /**
   * Resolve where one cover-sheet run's extracted workbook goes.
   *
   * @param {{
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {string} - Absolute path.
   */
  resolveExtractedFilePath ({
    batchFileId,
  }) {
    return path.join(
      this.storageDirectoryPath,
      `${batchFileId}${EXTRACTED_FILE_EXTENSION}`
    )
  }

  /**
   * Delete one run's extracted workbook.
   *
   * **A file that is already gone is not an error**, and this is called where that is the ordinary
   * case: the deletion runs in a `finally`, so it runs after a failure that happened before
   * anything was written as readily as after a run that wrote one. A cleanup that threw would
   * replace the failure it was cleaning up after with its own.
   *
   * @param {{
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async removeExtractedFile ({
    batchFileId,
  }) {
    await rm(
      this.resolveExtractedFilePath({
        batchFileId,
      }),
      {
        force: true,
      }
    )
  }
}

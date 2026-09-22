import {
  randomBytes,
} from 'crypto'

import {
  createWriteStream,
} from 'fs'

import {
  mkdir,
  rename,
  rm,
  stat,
} from 'fs/promises'

import path from 'path'

import {
  pipeline,
} from 'stream/promises'

import {
  env,
  rootPath,
} from '../globals/_.js'

const DEFAULT_FILE_STORAGE_PATH = 'storage/uploads'
const LANDING_NAME_BYTE_SIZE = 16
const LANDING_NAME_PREFIX = 'landing-'

/**
 * Storage of the uploaded files (`STORE-01`).
 *
 * The only irreplaceable store this system has (`DR-10`): every other one can be rebuilt from what
 * lands here, so nothing deletes from it in this version.
 *
 * A file is piped from the request straight into its destination and is never held whole in
 * memory (`NFR-010`). A 200 MB request of 50 MB files would otherwise be sized by how much the
 * process can hold rather than by how much the disk can take.
 *
 * **The layout is `<batchUploadId>/<batchFileId>` and is built from ids alone** (`SEC-011`). The
 * path the operator's file sat at travels in `TBL-04.relative_path`, where it is stored, grouped on
 * and displayed - and never resolved. A `..` in it is a string in a column, not a directory.
 *
 * **Which is why saving a file takes two steps.** The id that names the file comes from the row,
 * and the row cannot be written before the bytes have been counted, so the bytes land under a
 * minted name and are moved onto the id once the row exists. The landing name never reaches the
 * database: a request that breaks off between the two leaves bytes nothing points at, which is the
 * same class of orphan an interrupted upload has always been able to leave.
 */
export default class UploadedFileStorage {
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
   * @returns {UploadedFileStorage} - Instance of this class.
   */
  static create ({
    storageDirectoryPath = this.resolveStorageDirectoryPath(),
  } = {}) {
    return new this({
      storageDirectoryPath,
    })
  }

  /**
   * Resolve the directory every uploaded file is written under.
   *
   * A relative `FILE_STORAGE_PATH` is resolved against the process's working directory, so both
   * processes must be started from the repository root to land on the same directory. They
   * disagreeing on it is the most likely misconfiguration of the whole system (`ENV-010`): the API
   * writes, the worker reads nothing, and every job fails with an I/O error that reads like a
   * corrupt file. An absolute value is taken as it stands.
   *
   * @param {{
   *   fileStoragePath?: string
   * }} [params] - Parameters of this method.
   * @returns {string} - Absolute path of the storage directory.
   */
  static resolveStorageDirectoryPath ({
    fileStoragePath = env.FILE_STORAGE_PATH || DEFAULT_FILE_STORAGE_PATH,
  } = {}) {
    return rootPath.to(fileStoragePath)
  }

  /**
   * Save an uploaded file, streaming it straight to disk.
   *
   * The path it answers is where the bytes **landed**, not where they will live: the final name is
   * the row's id, and the row is written from what this returns. `#renameStoredFile()` closes the
   * pair.
   *
   * @param {{
   *   readStream: import('stream').Readable
   *   batchUploadId: number
   * }} params - Parameters of this method.
   * @returns {Promise<{
   *   storedPath: string
   *   byteSize: number
   * }>} - Where the file landed, relative to the storage directory, and how big it turned out.
   */
  async saveUploadedFile ({
    readStream,
    batchUploadId,
  }) {
    const storedPath = this.generateLandingPath({
      batchUploadId,
    })
    const absolutePath = this.resolveAbsolutePath({
      storedPath,
    })

    await mkdir(
      path.dirname(absolutePath),
      {
        recursive: true,
      }
    )

    await pipeline(
      readStream,
      createWriteStream(absolutePath)
    )

    const writtenFile = await stat(absolutePath)

    return {
      storedPath,
      byteSize: writtenFile.size,
    }
  }

  /**
   * Generate the path a landing file is written to, relative to the storage directory.
   *
   * Minted rather than taken from the upload, for the reason the final path is built from ids: a
   * name the client chose could collide with another file of the same upload, and could not be
   * trusted to stay inside the directory it was given. It sits under the same upload as the final
   * path, so the move that follows never leaves the directory.
   *
   * @param {{
   *   batchUploadId: number
   * }} params - Parameters of this method.
   * @returns {string} - Landing path.
   */
  generateLandingPath ({
    batchUploadId,
  }) {
    const landingName = randomBytes(LANDING_NAME_BYTE_SIZE)
      .toString('hex')

    return path.posix.join(
      String(batchUploadId),
      `${LANDING_NAME_PREFIX}${landingName}`
    )
  }

  /**
   * Move a landed file onto the name its row earned.
   *
   * @param {{
   *   storedPath: string
   *   batchUploadId: number
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {Promise<{
   *   storedPath: string
   * }>} - Where the file now lives, relative to the storage directory.
   */
  async renameStoredFile ({
    storedPath,
    batchUploadId,
    batchFileId,
  }) {
    const renamedPath = this.generateStoredPath({
      batchUploadId,
      batchFileId,
    })

    await rename(
      this.resolveAbsolutePath({
        storedPath,
      }),
      this.resolveAbsolutePath({
        storedPath: renamedPath,
      })
    )

    return {
      storedPath: renamedPath,
    }
  }

  /**
   * Generate the path a file is stored at, relative to the storage directory.
   *
   * **Built from ids and nothing else** (`SEC-011` `STORE-01`), which is what makes the operator's
   * own path safe to keep verbatim in a column. There is no extension: the file's kind is
   * `TBL-04.BatchFileKindId` and its name as uploaded is `TBL-04.file_name`, so an extension here
   * would be a third answer to a question two columns already answer.
   *
   * @param {{
   *   batchUploadId: number
   *   batchFileId: number
   * }} params - Parameters of this method.
   * @returns {string} - Stored path.
   */
  generateStoredPath ({
    batchUploadId,
    batchFileId,
  }) {
    return path.posix.join(
      String(batchUploadId),
      String(batchFileId)
    )
  }

  /**
   * Remove a stored file.
   *
   * The one thing that deletes from this store, and it deletes only what the same request just
   * wrote: a file whose size the operation refuses after the fact leaves nothing behind. Nothing
   * removes a file that belongs to a saved row (`DR-10`).
   *
   * A path that is already gone is not an error. The caller is on its way to refusing the request
   * either way, and a failure to clean up must not replace the refusal it was cleaning up after.
   *
   * @param {{
   *   storedPath: string
   * }} params - Parameters of this method.
   * @returns {Promise<void>}
   */
  async removeStoredFile ({
    storedPath,
  }) {
    await rm(
      this.resolveAbsolutePath({
        storedPath,
      }),
      {
        force: true,
      }
    )
  }

  /**
   * Resolve a stored path into the absolute path it names.
   *
   * @param {{
   *   storedPath: string
   * }} params - Parameters of this method.
   * @returns {string} - Absolute path.
   */
  resolveAbsolutePath ({
    storedPath,
  }) {
    return path.join(
      this.storageDirectoryPath,
      storedPath
    )
  }
}

/*
 * The paths arrive `/`-separated whatever the operator's machine writes, because the browser
 * reports `webkitRelativePath` that way. It is a separator inside a stored string rather than a
 * path separator: nothing here is joined onto a directory (`SEC-011`).
 */
const FOLDER_SEPARATOR = '/'

/**
 * Derives an upload's batches from the paths its files were stored under (`FR-151`).
 *
 * **This is the only place the rule runs.** The client draws the same tree on `SCR-03` so the
 * operator can see what will happen (`CMP-13`), and `SEQ-02` step (8) says why that is a preview
 * rather than a second implementation: two implementations of one rule drift, and the half that
 * drifts silently is the one nobody tests against real folders.
 *
 * **The rule is about holding files, not about depth and not about subfolders** (`ADR-26`). Every
 * folder that directly holds at least one file becomes exactly one batch, at whatever depth it
 * sits; a folder holding only folders becomes none and labels them instead (`TERM-23`); a folder
 * holding both is both. A batch is identified by its path rather than its name, because the filing
 * is date-shaped and `01` recurs in every month of every upload (`DR-15` `TERM-22`).
 *
 * **The upload root is one of those folders.** It used not to be, and a flat folder of documents
 * therefore derived nothing at all - which is the upload `SCR-03` refused by disabling its own
 * control (`ADR-26`). The root is named by the upload's own folder name rather than by the empty
 * path it sits at, because a blank identity is not one.
 *
 * **No file reaches no batch.** The folder a file sits in holds that file by definition, so it is a
 * batch by definition. `TBL-04.VerificationBatchId` stays nullable for the window between
 * `API-M003` and `API-M005` rather than for a category of file.
 *
 * **Nothing here normalizes a path.** A `..` is a folder name like any other, because the value is
 * stored, grouped on and displayed and is never joined onto a directory (`SEC-011`); trimming or
 * resolving it would be the first step of treating it as one.
 */
export default class BatchFolderDeriver {
  /**
   * Constructor.
   *
   * @param {{
   *   folderPaths: Array<string>
   *   batchFolderPaths: Array<string>
   *   rootBatchFolderPath: string
   * }} params - Parameters of this constructor.
   */
  constructor ({
    folderPaths,
    batchFolderPaths,
    rootBatchFolderPath,
  }) {
    this.folderPaths = folderPaths
    this.batchFolderPaths = batchFolderPaths
    this.rootBatchFolderPath = rootBatchFolderPath
  }

  /**
   * Factory method.
   *
   * Every set is worked out here rather than on each question. Which folders hold files is decided
   * by the whole list of paths, so answering one folder at a time would walk the list again for
   * every folder asked about.
   *
   * @param {{
   *   relativePaths: Array<string>
   *   rootFolderName: string
   * }} params - Parameters of this method.
   * @returns {BatchFolderDeriver} - Instance of this class.
   * @public
   */
  static create ({
    relativePaths,
    rootFolderName,
  }) {
    const rootBatchFolderPath = this.resolveRootBatchFolderPath({
      relativePaths,
      rootFolderName,
    })

    return new this({
      folderPaths: this.generateFolderPaths({
        relativePaths,
        rootBatchFolderPath,
      }),
      batchFolderPaths: this.generateBatchFolderPaths({
        relativePaths,
        rootBatchFolderPath,
      }),
      rootBatchFolderPath,
    })
  }

  /**
   * Decide what the root batch is called.
   *
   * The root's path under itself is empty, so it borrows the upload's own folder name (`TERM-22`).
   * **The one string that cannot be borrowed is one a folder of the upload already carries**: a
   * root named `2026` holding a folder named `2026` would give two different folders one identity,
   * and `UNIQUE(BatchUploadId, folder_path)` would silently fold them into one batch. The empty
   * path is the fallback because it is the root's true path and no folder of the upload can hold
   * it.
   *
   * @param {{
   *   relativePaths: Array<string>
   *   rootFolderName: string
   * }} params - Parameters of this method.
   * @returns {string} - The root batch's path.
   */
  static resolveRootBatchFolderPath ({
    relativePaths,
    rootFolderName,
  }) {
    const heldFolderPaths = this.generateHeldFolderPaths({
      relativePaths,
    })

    if (heldFolderPaths.includes(rootFolderName)) {
      return ''
    }

    return rootFolderName
  }

  /**
   * Generate every folder the tree held, each named once, in tree order.
   *
   * The ancestors are included even though no file sits in them directly: a folder exists because a
   * path passed through it, and `OPS-09` asks the log how many folders the tree held - a count that
   * skipped the labelling folders would report a flatter tree than the one that arrived. **The root
   * leads the list** (`ADR-26`), because it is a folder of the upload like any other and a count
   * that omitted it would disagree with the tree `CMP-13` draws.
   *
   * @param {{
   *   relativePaths: Array<string>
   *   rootBatchFolderPath: string
   * }} params - Parameters of this method.
   * @returns {Array<string>} - Every folder path of the upload, the root first.
   */
  static generateFolderPaths ({
    relativePaths,
    rootBatchFolderPath,
  }) {
    const descendantPaths = this.generateHeldFolderPaths({
      relativePaths,
    })
      .flatMap(folderPath =>
        this.generateAncestorPaths({
          folderPath,
        })
      )

    return [
      rootBatchFolderPath,
      ...[...new Set(descendantPaths)].toSorted(),
    ]
  }

  /**
   * Generate the folders that hold a file directly, each named once, in tree order.
   *
   * @param {{
   *   relativePaths: Array<string>
   * }} params - Parameters of this method.
   * @returns {Array<string>} - The folder paths, sorted. The root is not among them.
   */
  static generateHeldFolderPaths ({
    relativePaths,
  }) {
    const folderPaths = relativePaths
      .map(relativePath =>
        this.extractFolderPath({
          relativePath,
        })
      )
      .filter(folderPath => folderPath !== null)

    return [...new Set(folderPaths)]
      .toSorted()
  }

  /**
   * Extract the folder one file sat in.
   *
   * Answers null when the file sat in no folder of the upload - a bare name, or a name behind a
   * leading separator. The second is answered the same way as the first rather than by trimming the
   * separator away, because trimming would be the first step of treating the value as a directory.
   *
   * @param {{
   *   relativePath: string
   * }} params - Parameters of this method.
   * @returns {string | null} - The folder path, or null when the file sat at the upload root.
   */
  static extractFolderPath ({
    relativePath,
  }) {
    const lastSeparatorIndex = relativePath.lastIndexOf(FOLDER_SEPARATOR)
    const folderPath = relativePath.slice(
      0,
      Math.max(lastSeparatorIndex, 0)
    )

    return folderPath.length === 0
      ? null
      : folderPath
  }

  /**
   * Generate the folder and every folder above it.
   *
   * The folder itself is included, because it is the deepest ancestor of its own files and the
   * caller wants one list rather than a list plus a special case.
   *
   * @param {{
   *   folderPath: string
   * }} params - Parameters of this method.
   * @returns {Array<string>} - The ancestors, outermost first.
   */
  static generateAncestorPaths ({
    folderPath,
  }) {
    const segments = folderPath.split(FOLDER_SEPARATOR)

    return segments.map((segment, index) =>
      segments
        .slice(0, index + 1)
        .join(FOLDER_SEPARATOR)
    )
  }

  /**
   * Generate the folders that become batches.
   *
   * **A folder holding a file is a batch, so this is the set of folders the files sat in** - plus
   * the root when any file sat directly in it (`ADR-26`). It is not derived from `folderPaths`,
   * because that list carries the labelling folders too and a labelling folder is exactly a folder
   * this must leave out.
   *
   * @param {{
   *   relativePaths: Array<string>
   *   rootBatchFolderPath: string
   * }} params - Parameters of this method.
   * @returns {Array<string>} - The batch paths, in tree order.
   */
  static generateBatchFolderPaths ({
    relativePaths,
    rootBatchFolderPath,
  }) {
    const heldFolderPaths = this.generateHeldFolderPaths({
      relativePaths,
    })

    const rootBatchFolderPaths = this.hasRootFile({
      relativePaths,
    })
      ? [rootBatchFolderPath]
      : []

    return [
      ...rootBatchFolderPaths,
      ...heldFolderPaths,
    ]
  }

  /**
   * Check whether any file sat directly in the upload root.
   *
   * @param {{
   *   relativePaths: Array<string>
   * }} params - Parameters of this method.
   * @returns {boolean} - true: the root holds a file, so it is a batch.
   */
  static hasRootFile ({
    relativePaths,
  }) {
    return relativePaths.some(relativePath =>
      this.extractFolderPath({
        relativePath,
      }) === null
    )
  }

  /**
   * Resolve the batch that holds one file.
   *
   * **Every file has one** (`ADR-26`): the folder it sits in holds it, so that folder is a batch,
   * and a file sitting at the root belongs to the root's batch.
   *
   * @param {{
   *   relativePath: string
   * }} params - Parameters of this method.
   * @returns {string} - The batch path.
   */
  resolveBatchFolderPath ({
    relativePath,
  }) {
    const folderPath = this.constructor.extractFolderPath({
      relativePath,
    })

    return folderPath
      ?? this.rootBatchFolderPath
  }
}

import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  readManifest,
  managedRecordsEqual,
  writeManifestAtomic,
  type ManagedSkillRecord,
  type SkillManifest,
} from './manifest.ts'
import { inspectManagedSkill } from './inventory-service.ts'
import {
  ensureSafeRoots,
  inspectManagerRoot,
  RootSafetyError,
  safeDirectChild,
} from './roots.ts'
import {
  SnapshotValidationError,
  validateSnapshot,
  type SkillSnapshot,
  type ValidatedSnapshot,
} from './snapshot.ts'
import type { UpdateCheckDocument } from '../contracts.ts'
import { MutationLock } from './mutation-lock.ts'

const DEFAULT_OPERATION_TTL_MS = 5 * 60 * 1000
const MAX_PREPARED_OPERATIONS = 64

export interface SnapshotCatalog {
  download(id: string, signal: AbortSignal): Promise<SkillSnapshot>
}

export type InstallCollision = 'none' | 'managed'

export interface PreparedInstall {
  readonly operationId: string
  readonly name: string
  readonly description: string
  readonly source: string
  readonly pageUrl: string
  readonly collision: InstallCollision
  readonly expiresAt: string
}

export interface ConfirmInstall {
  readonly operationId: string
  readonly overwrite: boolean
}

export class InstallError extends Error {
  constructor(
    readonly code:
      | 'operation-expired'
      | 'overwrite-required'
      | 'unmanaged-collision'
      | 'install-failed'
      | 'rollback-failed'
      | 'unsafe-root'
      | 'not-managed'
      | 'state-changed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'InstallError'
  }
}

interface PreparedRecord {
  readonly id: string
  readonly snapshot: ValidatedSnapshot
  readonly expiresAt: number
  readonly expiryTimer: NodeJS.Timeout
  readonly baseline?: {
    readonly record: ManagedSkillRecord
    readonly currentHash: string
  }
}

export interface InstallServiceOptions {
  readonly skillsRoot: string
  readonly catalog: SnapshotCatalog
  readonly now?: () => Date
  readonly operationTtlMs?: number
  readonly maxPendingOperations?: number
  readonly warn?: (message: string, error: unknown) => void
  readonly writeManifest?: typeof writeManifestAtomic
  readonly mutationLock?: MutationLock
}

export class InstallService {
  private readonly skillsRoot: string
  private readonly catalog: SnapshotCatalog
  private readonly now: () => Date
  private readonly operationTtlMs: number
  private readonly maxPendingOperations: number
  private readonly warn: (message: string, error: unknown) => void
  private readonly writeManifest: typeof writeManifestAtomic
  private readonly mutationLock: MutationLock
  private readonly operations = new Map<string, PreparedRecord>()
  private inFlightPreparations = 0
  private activeCommits = 0

  constructor(options: InstallServiceOptions) {
    this.skillsRoot = options.skillsRoot
    this.catalog = options.catalog
    this.now = options.now ?? (() => new Date())
    this.operationTtlMs = options.operationTtlMs ?? DEFAULT_OPERATION_TTL_MS
    this.maxPendingOperations = options.maxPendingOperations ?? MAX_PREPARED_OPERATIONS
    this.warn = options.warn ?? ((message, error) => console.warn(message, error))
    this.writeManifest = options.writeManifest ?? writeManifestAtomic
    this.mutationLock = options.mutationLock ?? new MutationLock()
  }

  async prepare(id: string, signal: AbortSignal): Promise<PreparedInstall> {
    this.pruneExpiredOperations()
    return this.withPreparationSlot(async () => {
      const snapshot = await this.downloadValidatedSnapshot(id, signal)
      const managerRoot = await inspectManagerRoot(this.skillsRoot)
      const manifest = await readManifest(managerRoot)
      const collision = await this.collisionFor(snapshot.name, manifest)
      if (collision === 'unmanaged') {
        throw new InstallError(
          'unmanaged-collision',
          'A user-owned skill already uses this name and cannot be overwritten.',
        )
      }

      const { operationId, expiresAt } = this.storeOperation(id, snapshot)
      return {
        operationId,
        name: snapshot.name,
        description: snapshot.description,
        source: sourceFromCatalogId(id),
        pageUrl: pageUrlFromCatalogId(id),
        collision,
        expiresAt: new Date(expiresAt).toISOString(),
      }
    })
  }

  async checkUpdate(name: string, signal: AbortSignal): Promise<UpdateCheckDocument> {
    this.pruneExpiredOperations()
    return this.withPreparationSlot(async () => {
      const managerRoot = await inspectManagerRoot(this.skillsRoot)
      const manifest = await readManifest(managerRoot)
      const record = Object.hasOwn(manifest.skills, name) ? manifest.skills[name] : undefined
      if (record === undefined) {
        throw new InstallError('not-managed', 'The requested skill is not managed by this plugin.')
      }
      const local = await inspectManagedSkill(this.skillsRoot, record)

      let snapshot: ValidatedSnapshot
      try {
        snapshot = await this.downloadValidatedSnapshot(record.catalogId, signal)
      } catch (error) {
        if (hasStatus(error, 404)) {
          return { name, status: 'source-unavailable', updateAvailable: false }
        }
        throw error
      }
      if (snapshot.name !== name) {
        throw new SnapshotValidationError(
          'invalid-skill',
          'The updated snapshot no longer matches the Managed Skill name.',
        )
      }

      const localStatus = local.state === 'current'
        ? 'current'
        : local.state === 'locally-modified'
          ? 'locally-modified'
          : 'local-invalid'
      if (snapshot.remoteHash === record.remoteHash || local.currentHash === undefined) {
        return { name, status: localStatus, updateAvailable: false }
      }

      const baseline = {
        record,
        currentHash: local.currentHash,
      }
      const { operationId, expiresAt } = this.storeOperation(
        record.catalogId,
        snapshot,
        baseline,
      )
      return {
        name,
        status: localStatus === 'current' ? 'available' : localStatus,
        updateAvailable: true,
        operationId,
        expiresAt: new Date(expiresAt).toISOString(),
      }
    })
  }

  confirm(input: ConfirmInstall): Promise<ManagedSkillRecord> {
    const operation = this.operations.get(input.operationId)
    this.operations.delete(input.operationId)
    if (operation !== undefined) clearTimeout(operation.expiryTimer)
    if (operation === undefined || operation.expiresAt <= this.now().getTime()) {
      return Promise.reject(new InstallError(
        'operation-expired',
        'The prepared installation expired. Prepare it again.',
      ))
    }

    this.activeCommits += 1
    return this.mutationLock.run(async () => this.commitInstall(operation, input.overwrite))
      .finally(() => {
        this.activeCommits -= 1
      })
  }

  private pruneExpiredOperations(): void {
    const now = this.now().getTime()
    for (const [operationId, operation] of this.operations) {
      if (operation.expiresAt > now) continue
      clearTimeout(operation.expiryTimer)
      this.operations.delete(operationId)
    }
  }

  private assertOperationCapacity(): void {
    if (this.operations.size + this.inFlightPreparations + this.activeCommits
      >= this.maxPendingOperations) {
      throw new InstallError(
        'install-failed',
        'Too many skill operations are awaiting confirmation. Try again shortly.',
      )
    }
  }

  private async withPreparationSlot<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOperationCapacity()
    this.inFlightPreparations += 1
    try {
      return await operation()
    } finally {
      this.inFlightPreparations -= 1
    }
  }

  private async downloadValidatedSnapshot(
    id: string,
    signal: AbortSignal,
  ): Promise<ValidatedSnapshot> {
    return validateSnapshot(await this.catalog.download(id, signal))
  }

  private storeOperation(
    id: string,
    snapshot: ValidatedSnapshot,
    baseline?: PreparedRecord['baseline'],
  ): { readonly operationId: string; readonly expiresAt: number } {
    const operationId = randomUUID()
    const expiresAt = this.now().getTime() + this.operationTtlMs
    const expiryTimer = setTimeout(() => {
      this.operations.delete(operationId)
    }, this.operationTtlMs)
    expiryTimer.unref()
    this.operations.set(operationId, {
      id,
      snapshot,
      expiresAt,
      expiryTimer,
      baseline,
    })
    return { operationId, expiresAt }
  }

  private async collisionFor(
    name: string,
    manifest: SkillManifest,
  ): Promise<InstallCollision | 'unmanaged'> {
    const target = safeDirectChild(this.skillsRoot, name)
    try {
      const stats = await lstat(target)
      if (!stats.isDirectory() || stats.isSymbolicLink()) return 'unmanaged'
      return Object.hasOwn(manifest.skills, name) ? 'managed' : 'unmanaged'
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return 'none'
      throw error
    }
  }

  private async commitInstall(
    operation: PreparedRecord,
    overwrite: boolean,
  ): Promise<ManagedSkillRecord> {
    let roots: Awaited<ReturnType<typeof ensureSafeRoots>>
    try {
      roots = await ensureSafeRoots(this.skillsRoot)
    } catch (error) {
      if (error instanceof RootSafetyError) {
        throw new InstallError('unsafe-root', error.message, { cause: error })
      }
      throw error
    }

    const manifest = await readManifest(roots.managerRoot)
    if (operation.baseline !== undefined) {
      const baselineRecord = Object.hasOwn(manifest.skills, operation.snapshot.name)
        ? manifest.skills[operation.snapshot.name]
        : undefined
      if (baselineRecord === undefined
        || !managedRecordsEqual(baselineRecord, operation.baseline.record)) {
        throw new InstallError(
          'state-changed',
          'The Managed Skill changed after the update check. Check again.',
        )
      }
      const current = await inspectManagedSkill(roots.skillsRoot, baselineRecord)
      if (current.currentHash !== operation.baseline.currentHash) {
        throw new InstallError(
          'state-changed',
          'The Managed Skill changed after the update check. Check again.',
        )
      }
    }
    const collision = await this.collisionFor(operation.snapshot.name, manifest)
    if (collision === 'unmanaged') {
      throw new InstallError(
        'unmanaged-collision',
        'A user-owned skill already uses this name and cannot be overwritten.',
      )
    }
    if (collision === 'managed' && !overwrite) {
      throw new InstallError(
        'overwrite-required',
        'This Managed Skill already exists and requires overwrite confirmation.',
      )
    }

    const stage = join(roots.stagingRoot, operationIdSegment())
    const backup = join(roots.backupsRoot, operationIdSegment())
    const target = safeDirectChild(roots.skillsRoot, operation.snapshot.name)
    let existingMoved = false
    let targetClaimed = false

    try {
      await writeStage(stage, operation.snapshot)
      if (collision === 'managed') {
        await rename(target, backup)
        existingMoved = true
      }
      await mkdir(target, { recursive: false })
      targetClaimed = true
      await writeSnapshotContents(target, operation.snapshot, true)

      const timestamp = this.now().toISOString()
      const previous = Object.hasOwn(manifest.skills, operation.snapshot.name)
        ? manifest.skills[operation.snapshot.name]
        : undefined
      const record: ManagedSkillRecord = {
        name: operation.snapshot.name,
        description: operation.snapshot.description,
        catalogId: operation.id,
        source: sourceFromCatalogId(operation.id),
        pageUrl: pageUrlFromCatalogId(operation.id),
        remoteHash: operation.snapshot.remoteHash,
        localHash: operation.snapshot.localHash,
        installedAt: previous?.installedAt ?? timestamp,
        updatedAt: timestamp,
      }
      await this.writeManifest(roots.managerRoot, {
        version: 1,
        skills: { ...manifest.skills, [record.name]: record },
      })

      try {
        await rm(stage, { recursive: true, force: true })
      } catch (cleanupError) {
        this.warn(
          'The skill was installed, but its in-root staging copy could not be removed.',
          cleanupError,
        )
      }
      if (existingMoved) {
        try {
          await rm(backup, { recursive: true, force: true })
        } catch (cleanupError) {
          this.warn(
            'The skill was installed, but its in-root recovery backup could not be removed.',
            cleanupError,
          )
        }
      }
      return record
    } catch (error) {
      try {
        if (targetClaimed) await rm(target, { recursive: true, force: true })
        if (existingMoved) await rename(backup, target)
        await rm(stage, { recursive: true, force: true })
      } catch (rollbackError) {
        throw new InstallError(
          'rollback-failed',
          'Installation failed and automatic rollback did not complete.',
          { cause: new AggregateError([error, rollbackError]) },
        )
      }
      if (error instanceof InstallError
        || error instanceof SnapshotValidationError
        || error instanceof RootSafetyError) {
        throw error
      }
      throw new InstallError('install-failed', 'The skill could not be installed.', {
        cause: error,
      })
    }
  }
}

async function writeStage(stage: string, snapshot: ValidatedSnapshot): Promise<void> {
  await mkdir(stage, { recursive: false })
  await writeSnapshotContents(stage, snapshot, false)
}

async function writeSnapshotContents(
  root: string,
  snapshot: ValidatedSnapshot,
  skillFileLast: boolean,
): Promise<void> {
  const files = skillFileLast
    ? [...snapshot.files].sort((left, right) => {
        if (left.path === 'SKILL.md') return 1
        if (right.path === 'SKILL.md') return -1
        return left.path.localeCompare(right.path)
      })
    : snapshot.files

  for (const file of files) {
    const destination = join(root, ...file.path.split('/'))
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, file.contents, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
  }
}

function operationIdSegment(): string {
  return randomUUID()
}

function sourceFromCatalogId(id: string): string {
  return id.split('/').slice(0, -1).join('/')
}

function pageUrlFromCatalogId(id: string): string {
  return `https://skills.sh/${id.split('/').map(encodeURIComponent).join('/')}`
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function hasStatus(error: unknown, status: number): boolean {
  return error instanceof Error
    && 'status' in error
    && error.status === status
}

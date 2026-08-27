import { constants } from 'node:fs'
import { lstat, open, opendir, realpath, type FileHandle } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { ManagedSkillInventoryItem } from '../contracts.ts'
import { readManifest } from './manifest.ts'
import { inspectManagerRoot, safeDirectChild } from './roots.ts'
import { validateSnapshot, type SnapshotFile } from './snapshot.ts'

const MAX_FILES = 500
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const MAX_ENTRIES = 1_000
const MAX_DEPTH = 20

class InvalidLocalSkillError extends Error {}

interface CollectionState {
  files: SnapshotFile[]
  totalBytes: number
  entries: number
}

async function collectFiles(
  root: string,
  directory: string,
  relativeDirectory: string,
  state: CollectionState,
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) {
    throw new InvalidLocalSkillError('A Managed Skill exceeds the directory depth limit.')
  }
  const entries = await opendir(directory)
  for await (const entry of entries) {
    state.entries += 1
    if (state.entries > MAX_ENTRIES) {
      throw new InvalidLocalSkillError('A Managed Skill exceeds the entry limit.')
    }
    const relativePath = relativeDirectory.length === 0
      ? entry.name
      : `${relativeDirectory}/${entry.name}`
    const absolutePath = join(directory, entry.name)
    const stats = await lstat(absolutePath)

    if (stats.isSymbolicLink()) {
      throw new InvalidLocalSkillError('Managed Skills cannot contain symbolic links.')
    }
    if (stats.isDirectory()) {
      const physicalDirectory = await realpath(absolutePath)
      const fromRoot = relative(root, physicalDirectory)
      if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
        throw new InvalidLocalSkillError('A Managed Skill directory escapes its root.')
      }
      await collectFiles(root, physicalDirectory, relativePath, state, depth + 1)
      continue
    }
    if (!stats.isFile()) {
      throw new InvalidLocalSkillError('A Managed Skill contains an unsupported local file.')
    }

    let handle
    try {
      handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW)
      const descriptorStats = await handle.stat()
      if (!descriptorStats.isFile() || descriptorStats.size > MAX_FILE_BYTES) {
        throw new InvalidLocalSkillError('A Managed Skill contains an oversized local file.')
      }
      const bytes = await readBoundedFile(handle)
      state.totalBytes += bytes.byteLength
      if (state.totalBytes > MAX_TOTAL_BYTES || state.files.length >= MAX_FILES) {
        throw new InvalidLocalSkillError('A Managed Skill exceeds local verification limits.')
      }

      let contents: string
      try {
        contents = new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes)
      } catch {
        throw new InvalidLocalSkillError('A Managed Skill contains a non-UTF-8 file.')
      }
      state.files.push({ path: relativePath, contents })
    } finally {
      await handle?.close()
    }
  }
}

async function readBoundedFile(handle: FileHandle): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(MAX_FILE_BYTES + 1)
  let offset = 0
  while (offset < buffer.byteLength) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.byteLength - offset,
      null,
    )
    if (bytesRead === 0) return buffer.subarray(0, offset)
    offset += bytesRead
    if (offset > MAX_FILE_BYTES) {
      throw new InvalidLocalSkillError('A Managed Skill contains an oversized local file.')
    }
  }
  throw new InvalidLocalSkillError('A Managed Skill contains an oversized local file.')
}

async function localState(
  skillsRoot: string,
  name: string,
  expectedHash: string,
): Promise<ManagedSkillInventoryItem['state']> {
  const target = safeDirectChild(skillsRoot, name)
  try {
    const stats = await lstat(target)
    if (!stats.isDirectory() || stats.isSymbolicLink()) return 'invalid'
    const physicalTarget = await realpath(target)
    const collection: CollectionState = { files: [], totalBytes: 0, entries: 0 }
    await collectFiles(physicalTarget, physicalTarget, '', collection, 0)
    const snapshot = validateSnapshot({ hash: expectedHash, files: collection.files })
    if (snapshot.name !== name) return 'invalid'
    return snapshot.localHash === expectedHash ? 'current' : 'locally-modified'
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return 'missing'
    if (error instanceof InvalidLocalSkillError) return 'invalid'
    if (error instanceof Error && error.name === 'SnapshotValidationError') return 'invalid'
    throw error
  }
}

export class InventoryService {
  constructor(private readonly skillsRoot: string) {}

  async list(): Promise<readonly ManagedSkillInventoryItem[]> {
    const managerRoot = await inspectManagerRoot(this.skillsRoot)
    const manifest = await readManifest(managerRoot)
    const items: ManagedSkillInventoryItem[] = []
    for (const record of Object.values(manifest.skills)) {
      items.push({
        ...record,
        state: await localState(this.skillsRoot, record.name, record.localHash),
      })
    }
    return items.sort((left, right) => left.name.localeCompare(right.name))
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

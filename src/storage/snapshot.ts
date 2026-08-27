import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { parse } from 'yaml'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/
const MAX_FILES = 500
const MAX_ENTRIES = 1_000
const MAX_DEPTH = 20
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const SHA256 = /^[a-f0-9]{64}$/

export interface SnapshotFile {
  path: string
  contents: string
}

export interface SkillSnapshot {
  hash: string
  files: SnapshotFile[]
}

export interface ValidatedSnapshot {
  readonly remoteHash: string
  readonly localHash: string
  readonly name: string
  readonly description: string
  readonly files: readonly Readonly<SnapshotFile>[]
}

export class SnapshotValidationError extends Error {
  constructor(
    readonly code: 'unsafe-path' | 'invalid-skill' | 'resource-limit',
    message: string,
  ) {
    super(message)
    this.name = 'SnapshotValidationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateFilePath(path: string): string {
  if (path.length === 0
    || path.length > 500
    || CONTROL_CHARACTERS.test(path)
    || path.includes('\\')
    || posix.isAbsolute(path)
    || WINDOWS_ABSOLUTE_PATH.test(path)
    || path.endsWith('/')) {
    throw new SnapshotValidationError('unsafe-path', 'The snapshot contains an unsafe file path.')
  }

  const segments = path.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new SnapshotValidationError('unsafe-path', 'The snapshot contains an unsafe file path.')
  }

  const normalized = posix.normalize(path)
  if (normalized !== path || normalized.startsWith('../')) {
    throw new SnapshotValidationError('unsafe-path', 'The snapshot contains an unsafe file path.')
  }
  return normalized
}

function metadataFromSkillMarkdown(markdown: string): {
  readonly name: string
  readonly description: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)
  if (match === null) {
    throw new SnapshotValidationError('invalid-skill', 'SKILL.md must contain YAML frontmatter.')
  }

  let frontmatter: unknown
  try {
    frontmatter = parse(match[1])
  } catch {
    throw new SnapshotValidationError('invalid-skill', 'SKILL.md contains invalid YAML frontmatter.')
  }
  if (!isRecord(frontmatter)
    || typeof frontmatter.name !== 'string'
    || !SKILL_NAME.test(frontmatter.name)
    || typeof frontmatter.description !== 'string'
    || frontmatter.description.trim().length === 0) {
    throw new SnapshotValidationError('invalid-skill', 'SKILL.md metadata is invalid for DSH.')
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description.trim().slice(0, 500),
  }
}

function snapshotHash(files: readonly Readonly<SnapshotFile>[]): string {
  const canonical = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => [file.path, file.contents])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export function validateSnapshot(snapshot: SkillSnapshot): ValidatedSnapshot {
  if (typeof snapshot.hash !== 'string' || !SHA256.test(snapshot.hash)) {
    throw new SnapshotValidationError('invalid-skill', 'The snapshot hash is invalid.')
  }
  if (!Array.isArray(snapshot.files) || snapshot.files.length === 0) {
    throw new SnapshotValidationError('invalid-skill', 'The snapshot contains no files.')
  }
  if (snapshot.files.length > MAX_FILES) {
    throw new SnapshotValidationError('resource-limit', 'The snapshot contains too many files.')
  }

  const seenPaths = new Set<string>()
  const seenDirectories = new Set<string>()
  let totalBytes = 0
  const files = snapshot.files.map(file => {
    if (typeof file.path !== 'string' || typeof file.contents !== 'string') {
      throw new SnapshotValidationError('invalid-skill', 'The snapshot contains an invalid file.')
    }
    const path = validateFilePath(file.path)
    const segments = path.split('/')
    if (segments.length - 1 > MAX_DEPTH) {
      throw new SnapshotValidationError('resource-limit', 'The snapshot exceeds the directory depth limit.')
    }
    for (let index = 1; index < segments.length; index += 1) {
      seenDirectories.add(segments.slice(0, index).join('/').toLowerCase())
    }
    if (snapshot.files.length + seenDirectories.size > MAX_ENTRIES) {
      throw new SnapshotValidationError('resource-limit', 'The snapshot exceeds the entry limit.')
    }
    const collisionKey = path.toLowerCase()
    if (seenPaths.has(collisionKey)) {
      throw new SnapshotValidationError('unsafe-path', 'The snapshot contains duplicate file paths.')
    }
    seenPaths.add(collisionKey)

    const encodedContents = Buffer.from(file.contents, 'utf8')
    const decodedContents = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(encodedContents)
    if (decodedContents !== file.contents) {
      throw new SnapshotValidationError(
        'invalid-skill',
        'A snapshot file cannot be represented losslessly as UTF-8.',
      )
    }
    const fileBytes = encodedContents.byteLength
    if (fileBytes > MAX_FILE_BYTES) {
      throw new SnapshotValidationError('resource-limit', 'A snapshot file exceeds the size limit.')
    }
    totalBytes += fileBytes
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new SnapshotValidationError('resource-limit', 'The snapshot exceeds the total size limit.')
    }
    return Object.freeze({ path, contents: file.contents })
  })

  const skillFile = files.find(file => file.path === 'SKILL.md')
  if (skillFile === undefined) {
    throw new SnapshotValidationError('invalid-skill', 'The snapshot must contain a root SKILL.md.')
  }
  const metadata = metadataFromSkillMarkdown(skillFile.contents)

  return {
    remoteHash: snapshot.hash,
    localHash: snapshotHash(files),
    name: metadata.name,
    description: metadata.description,
    files: Object.freeze(files),
  }
}

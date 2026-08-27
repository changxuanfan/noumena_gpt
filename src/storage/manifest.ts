import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MANAGER_DIRECTORY = '.dsh-skill-manager'
export const MANIFEST_VERSION = 1

export interface ManagedSkillRecord {
  readonly name: string
  readonly description: string
  readonly catalogId: string
  readonly source: string
  readonly pageUrl: string
  readonly remoteHash: string
  readonly localHash: string
  readonly installedAt: string
  readonly updatedAt: string
}

export interface SkillManifest {
  readonly version: typeof MANIFEST_VERSION
  readonly skills: Readonly<Record<string, ManagedSkillRecord>>
}

export class ManifestError extends Error {
  constructor(
    readonly code: 'manifest-invalid' | 'manifest-io',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ManifestError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isManagedSkillRecord(value: unknown): value is ManagedSkillRecord {
  if (!isRecord(value)) return false
  return [
    'name',
    'description',
    'catalogId',
    'source',
    'pageUrl',
    'remoteHash',
    'localHash',
    'installedAt',
    'updatedAt',
  ].every(key => typeof value[key] === 'string')
}

function parseManifest(value: unknown): SkillManifest {
  if (!isRecord(value)
    || value.version !== MANIFEST_VERSION
    || !isRecord(value.skills)) {
    throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is invalid.')
  }
  const skills: Record<string, ManagedSkillRecord> = {}
  for (const [key, record] of Object.entries(value.skills)) {
    if (!isManagedSkillRecord(record) || key !== record.name) {
      throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is invalid.')
    }
    skills[key] = record
  }
  return {
    version: MANIFEST_VERSION,
    skills,
  }
}

export function emptyManifest(): SkillManifest {
  return { version: MANIFEST_VERSION, skills: {} }
}

export async function readManifest(managerRoot: string): Promise<SkillManifest> {
  try {
    const text = await readFile(join(managerRoot, 'manifest.json'), 'utf8')
    return parseManifest(JSON.parse(text) as unknown)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return emptyManifest()
    if (error instanceof ManifestError) throw error
    if (error instanceof SyntaxError) {
      throw new ManifestError('manifest-invalid', 'The Skill Manager manifest is not valid JSON.')
    }
    throw new ManifestError('manifest-io', 'The Skill Manager manifest could not be read.', {
      cause: error,
    })
  }
}

export async function writeManifestAtomic(
  managerRoot: string,
  manifest: SkillManifest,
): Promise<void> {
  const temporaryPath = join(managerRoot, 'staging', `manifest-${randomUUID()}.json`)
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, join(managerRoot, 'manifest.json'))
  } catch (error) {
    throw new ManifestError('manifest-io', 'The Skill Manager manifest could not be written.', {
      cause: error,
    })
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export interface CatalogSkill {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly source: string
  readonly installs: number
  readonly pageUrl: string
}

export type SearchErrorCode =
  | 'invalid-query'
  | 'network'
  | 'timeout'
  | 'upstream'
  | 'invalid-response'

export type LifecycleErrorCode =
  | 'invalid-request'
  | 'unsafe-path'
  | 'invalid-skill'
  | 'resource-limit'
  | 'operation-expired'
  | 'overwrite-required'
  | 'unmanaged-collision'
  | 'install-failed'
  | 'rollback-failed'
  | 'unsafe-root'

export type PublicErrorCode = SearchErrorCode | LifecycleErrorCode

export interface PublicError<Code extends PublicErrorCode = PublicErrorCode> {
  readonly code: Code
  readonly message: string
}

export type SearchEnvelope =
  | { readonly ok: true; readonly results: readonly CatalogSkill[] }
  | { readonly ok: false; readonly error: PublicError<SearchErrorCode> }

export interface PreparedInstallDocument {
  readonly operationId: string
  readonly name: string
  readonly description: string
  readonly source: string
  readonly pageUrl: string
  readonly collision: 'none' | 'managed'
  readonly expiresAt: string
}

export interface ManagedSkillDocument {
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

export type PrepareInstallEnvelope =
  | { readonly ok: true; readonly prepared: PreparedInstallDocument }
  | { readonly ok: false; readonly error: PublicError }

export type ConfirmInstallEnvelope =
  | { readonly ok: true; readonly skill: ManagedSkillDocument }
  | { readonly ok: false; readonly error: PublicError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isCatalogSkill(value: unknown): value is CatalogSkill {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && (typeof value.description === 'string' || value.description === null)
    && typeof value.source === 'string'
    && typeof value.installs === 'number'
    && Number.isFinite(value.installs)
    && typeof value.pageUrl === 'string'
}

export function isSearchEnvelope(value: unknown): value is SearchEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  if (value.ok) return Array.isArray(value.results) && value.results.every(isCatalogSkill)
  return isRecord(value.error)
    && isSearchErrorCode(value.error.code)
    && typeof value.error.message === 'string'
}

function isSearchErrorCode(value: unknown): value is SearchErrorCode {
  return value === 'invalid-query'
    || value === 'network'
    || value === 'timeout'
    || value === 'upstream'
    || value === 'invalid-response'
}

function isPublicError(value: unknown): value is PublicError {
  return isRecord(value)
    && typeof value.code === 'string'
    && typeof value.message === 'string'
}

function isPreparedInstall(value: unknown): value is PreparedInstallDocument {
  if (!isRecord(value)) return false
  return typeof value.operationId === 'string'
    && typeof value.name === 'string'
    && typeof value.description === 'string'
    && typeof value.source === 'string'
    && typeof value.pageUrl === 'string'
    && (value.collision === 'none' || value.collision === 'managed')
    && typeof value.expiresAt === 'string'
}

function isManagedSkill(value: unknown): value is ManagedSkillDocument {
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

export function isPrepareInstallEnvelope(value: unknown): value is PrepareInstallEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok ? isPreparedInstall(value.prepared) : isPublicError(value.error)
}

export function isConfirmInstallEnvelope(value: unknown): value is ConfirmInstallEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok ? isManagedSkill(value.skill) : isPublicError(value.error)
}

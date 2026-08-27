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
  | 'not-managed'
  | 'state-changed'

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

export type ManagedSkillState =
  | 'current'
  | 'locally-modified'
  | 'missing'
  | 'invalid'

export interface ManagedSkillInventoryItem extends ManagedSkillDocument {
  readonly state: ManagedSkillState
}

export type InventoryEnvelope =
  | { readonly ok: true; readonly skills: readonly ManagedSkillInventoryItem[] }
  | { readonly ok: false; readonly error: PublicError }

export type UpdateStatus =
  | 'current'
  | 'available'
  | 'locally-modified'
  | 'local-invalid'
  | 'source-unavailable'

export interface UpdateCheckDocument {
  readonly name: string
  readonly status: UpdateStatus
  readonly updateAvailable: boolean
  readonly operationId?: string
  readonly expiresAt?: string
}

export type UpdateCheckEnvelope =
  | { readonly ok: true; readonly update: UpdateCheckDocument }
  | { readonly ok: false; readonly error: PublicError }

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

function isManagedSkillInventoryItem(value: unknown): value is ManagedSkillInventoryItem {
  return isManagedSkill(value)
    && isRecord(value)
    && (value.state === 'current'
      || value.state === 'locally-modified'
      || value.state === 'missing'
      || value.state === 'invalid')
}

export function isPrepareInstallEnvelope(value: unknown): value is PrepareInstallEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok ? isPreparedInstall(value.prepared) : isPublicError(value.error)
}

export function isConfirmInstallEnvelope(value: unknown): value is ConfirmInstallEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok ? isManagedSkill(value.skill) : isPublicError(value.error)
}

export function isInventoryEnvelope(value: unknown): value is InventoryEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  return value.ok
    ? Array.isArray(value.skills) && value.skills.every(isManagedSkillInventoryItem)
    : isPublicError(value.error)
}

function isUpdateStatus(value: unknown): value is UpdateStatus {
  return value === 'current'
    || value === 'available'
    || value === 'locally-modified'
    || value === 'local-invalid'
    || value === 'source-unavailable'
}

export function isUpdateCheckEnvelope(value: unknown): value is UpdateCheckEnvelope {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  if (!value.ok) return isPublicError(value.error)
  if (!isRecord(value.update)) return false
  return typeof value.update.name === 'string'
    && isUpdateStatus(value.update.status)
    && typeof value.update.updateAvailable === 'boolean'
    && (value.update.operationId === undefined || typeof value.update.operationId === 'string')
    && (value.update.expiresAt === undefined || typeof value.update.expiresAt === 'string')
}

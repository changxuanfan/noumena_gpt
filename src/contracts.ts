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

export interface PublicError {
  readonly code: SearchErrorCode
  readonly message: string
}

export type SearchEnvelope =
  | { readonly ok: true; readonly results: readonly CatalogSkill[] }
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
    && typeof value.error.code === 'string'
    && typeof value.error.message === 'string'
}

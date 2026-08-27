import {
  isSearchEnvelope,
  type CatalogSkill,
  type SearchErrorCode,
} from '../contracts.ts'

export class CatalogSearchError extends Error {
  constructor(
    readonly code: SearchErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CatalogSearchError'
  }
}

export async function searchCatalog(
  query: string,
  signal: AbortSignal,
): Promise<readonly CatalogSkill[]> {
  const url = new URL('/dsh-skill-manager/api/search', location.origin)
  url.searchParams.set('q', query)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new CatalogSearchError('network', 'Unable to reach the DSH host.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CatalogSearchError('invalid-response', 'The DSH host returned an invalid response.')
  }

  if (!isSearchEnvelope(body)) {
    throw new CatalogSearchError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new CatalogSearchError(body.error.code, body.error.message)
  return body.results
}

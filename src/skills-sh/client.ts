import { parse } from 'yaml'
import type { CatalogSkill, SearchErrorCode } from '../contracts.ts'
import type { SkillSnapshot } from '../storage/snapshot.ts'

const DEFAULT_BASE_URL = 'https://skills.sh'
const DEFAULT_LIMIT = 20
const DEFAULT_TIMEOUT_MS = 10_000
const DESCRIPTION_CONCURRENCY = 4
const SEARCH_RESPONSE_LIMIT_BYTES = 1 * 1024 * 1024
const SNAPSHOT_RESPONSE_LIMIT_BYTES = 10 * 1024 * 1024
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export class SkillsShError extends Error {
  constructor(
    readonly code: SearchErrorCode | 'cancelled',
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SkillsShError'
  }
}

interface SearchEntry {
  readonly id: string
  readonly name: string
  readonly source: string
  readonly installs: number
}

interface SnapshotFile {
  readonly path: string
  readonly contents: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function cleanDisplayText(value: string, maximumLength: number): string {
  return value.replace(CONTROL_CHARACTERS, '').trim().slice(0, maximumLength)
}

function safeCatalogId(value: string): string | null {
  const id = cleanDisplayText(value, 300)
  const segments = id.split('/')
  if (segments.length < 3) return null
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) return null
  return id
}

function parseSearchEntries(value: unknown): readonly SearchEntry[] {
  if (!isRecord(value) || !Array.isArray(value.skills)) {
    throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid search response.')
  }
  if (value.skills.length > DEFAULT_LIMIT) {
    throw new SkillsShError('invalid-response', 'Skills.sh returned too many search results.')
  }

  return value.skills.map((entry): SearchEntry => {
    if (!isRecord(entry)
      || typeof entry.id !== 'string'
      || typeof entry.name !== 'string'
      || typeof entry.source !== 'string'
      || typeof entry.installs !== 'number'
      || !Number.isFinite(entry.installs)
      || entry.installs < 0) {
      throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid search result.')
    }

    const id = safeCatalogId(entry.id)
    const name = cleanDisplayText(entry.name, 200)
    const source = cleanDisplayText(entry.source, 200)
    if (id === null || name.length === 0 || source.length === 0) {
      throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid search result.')
    }

    return {
      id,
      name,
      source,
      installs: Math.trunc(entry.installs),
    }
  })
}

function parseSnapshotFiles(value: unknown): readonly SnapshotFile[] {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid skill snapshot.')
  }

  return value.files.map((file): SnapshotFile => {
    if (!isRecord(file) || typeof file.path !== 'string' || typeof file.contents !== 'string') {
      throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid skill snapshot.')
    }
    return { path: file.path, contents: file.contents }
  })
}

function parseSkillSnapshot(value: unknown): SkillSnapshot {
  if (!isRecord(value) || typeof value.hash !== 'string') {
    throw new SkillsShError('invalid-response', 'Skills.sh returned an invalid skill snapshot.')
  }
  return {
    hash: value.hash,
    files: [...parseSnapshotFiles(value)],
  }
}

function descriptionFromSkillMarkdown(markdown: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)
  if (match === null) return null

  try {
    const frontmatter: unknown = parse(match[1])
    if (!isRecord(frontmatter) || typeof frontmatter.description !== 'string') return null
    const description = cleanDisplayText(frontmatter.description, 500)
    return description.length === 0 ? null : description
  } catch {
    return null
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index])
    }
  }

  const workerCount = Math.min(concurrency, values.length)
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}

async function readJsonLimited(response: Response, maximumBytes: number): Promise<unknown> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new SkillsShError('invalid-response', 'Skills.sh returned an oversized response.')
    }
  }

  if (response.body === null) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maximumBytes) {
      throw new SkillsShError('invalid-response', 'Skills.sh returned an oversized response.')
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new SkillsShError('invalid-response', 'Skills.sh returned invalid JSON.')
    }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      totalBytes += result.value.byteLength
      if (totalBytes > maximumBytes) {
        await reader.cancel()
        throw new SkillsShError('invalid-response', 'Skills.sh returned an oversized response.')
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new SkillsShError('invalid-response', 'Skills.sh returned invalid JSON.')
  }
}

export interface SkillsShClientOptions {
  readonly fetcher?: Fetcher
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

export class SkillsShClient {
  private readonly fetcher: Fetcher
  private readonly baseUrl: URL
  private readonly timeoutMs: number

  constructor(options: SkillsShClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL)
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async search(query: string, signal: AbortSignal): Promise<readonly CatalogSkill[]> {
    const normalizedQuery = query.trim()
    if (normalizedQuery.length === 0) {
      throw new SkillsShError('invalid-query', 'Enter a search keyword.')
    }

    const url = new URL('/api/search', this.baseUrl)
    url.searchParams.set('q', normalizedQuery)
    url.searchParams.set('limit', String(DEFAULT_LIMIT))
    const search = await this.requestJson(url, signal, SEARCH_RESPONSE_LIMIT_BYTES)
    const entries = [...parseSearchEntries(search)]
      .sort((left, right) => right.installs - left.installs)

    return mapWithConcurrency(entries, DESCRIPTION_CONCURRENCY, async entry => ({
      ...entry,
      description: await this.loadDescription(entry.id, signal),
      pageUrl: new URL(entry.id.split('/').map(encodeURIComponent).join('/'), this.baseUrl).href,
    }))
  }

  async download(id: string, signal: AbortSignal): Promise<SkillSnapshot> {
    const catalogId = safeCatalogId(id)
    if (catalogId === null) {
      throw new SkillsShError('invalid-query', 'The catalog skill identifier is invalid.')
    }
    const encodedId = catalogId.split('/').map(encodeURIComponent).join('/')
    const snapshot = await this.requestJson(
      new URL(`/api/download/${encodedId}`, this.baseUrl),
      signal,
      SNAPSHOT_RESPONSE_LIMIT_BYTES,
    )
    return parseSkillSnapshot(snapshot)
  }

  private async loadDescription(id: string, signal: AbortSignal): Promise<string | null> {
    try {
      const encodedId = id.split('/').map(encodeURIComponent).join('/')
      const snapshot = await this.requestJson(
        new URL(`/api/download/${encodedId}`, this.baseUrl),
        signal,
        SNAPSHOT_RESPONSE_LIMIT_BYTES,
      )
      const files = parseSnapshotFiles(snapshot)
      const skillFile = files.find(file => /(^|\/)skill\.md$/i.test(file.path))
      return skillFile === undefined ? null : descriptionFromSkillMarkdown(skillFile.contents)
    } catch (error) {
      if (error instanceof SkillsShError && error.code === 'cancelled') throw error
      return null
    }
  }

  private async requestJson(
    url: URL,
    signal: AbortSignal,
    maximumBytes: number,
  ): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const combinedSignal = AbortSignal.any([signal, timeoutSignal])

    try {
      const response = await this.fetcher(url, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: combinedSignal,
      })
      if (!response.ok) {
        throw new SkillsShError(
          'upstream',
          `Skills.sh request failed with status ${response.status}.`,
          response.status,
        )
      }
      return await readJsonLimited(response, maximumBytes)
    } catch (error) {
      if (error instanceof SkillsShError) throw error
      if (signal.aborted) {
        throw new SkillsShError('cancelled', 'The request was cancelled.')
      }
      if (timeoutSignal.aborted) {
        throw new SkillsShError('timeout', 'Skills.sh did not respond in time.')
      }
      throw new SkillsShError('network', 'Unable to reach Skills.sh.')
    }
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  CatalogSkill,
  PublicError,
  SearchEnvelope,
  SearchErrorCode,
} from './contracts.ts'
import { SkillsShClient, SkillsShError } from './skills-sh/client.ts'

export interface SearchWebServer {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

interface CatalogSearcher {
  search(query: string, signal: AbortSignal): Promise<readonly CatalogSkill[]>
}

function publicError(error: unknown): {
  readonly status: number
  readonly error: PublicError<SearchErrorCode>
} {
  if (!(error instanceof SkillsShError)) {
    return {
      status: 500,
      error: { code: 'upstream', message: 'The skill search failed unexpectedly.' },
    }
  }

  const code: SearchErrorCode = error.code === 'cancelled' ? 'network' : error.code
  const messages: Record<SearchErrorCode, string> = {
    'invalid-query': 'Enter a search keyword.',
    network: 'Unable to reach Skills.sh. Check your connection and try again.',
    timeout: 'Skills.sh did not respond in time. Try again.',
    'rate-limited': error.message,
    upstream: 'Skills.sh could not complete the search. Try again later.',
    'invalid-response': 'Skills.sh returned data the plugin could not safely read.',
  }
  const statuses: Record<SearchErrorCode, number> = {
    'invalid-query': 400,
    network: 502,
    timeout: 504,
    'rate-limited': 429,
    upstream: 502,
    'invalid-response': 502,
  }
  return { status: statuses[code], error: { code, message: messages[code] } }
}

function writeJson(response: ServerResponse, status: number, body: SearchEnvelope): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

export function mountSearchRoute(
  webServer: SearchWebServer,
  searcher: CatalogSearcher = new SkillsShClient(),
): () => void {
  return webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/api/search',
    async handler(request, response) {
      if (request.method !== 'GET') {
        response.statusCode = 405
        response.setHeader('allow', 'GET')
        response.end()
        return
      }

      const query = new URL(request.url ?? '/', 'http://localhost').searchParams.get('q') ?? ''
      const controller = new AbortController()
      const abort = (): void => controller.abort()
      request.once('aborted', abort)

      try {
        const results = await searcher.search(query, controller.signal)
        if (!response.destroyed) writeJson(response, 200, { ok: true, results })
      } catch (error) {
        if (controller.signal.aborted || response.destroyed) return
        const failure = publicError(error)
        writeJson(response, failure.status, { ok: false, error: failure.error })
      } finally {
        request.off('aborted', abort)
      }
    },
  })
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { InventoryEnvelope } from './contracts.ts'
import type { SearchWebServer } from './search-route.ts'
import type { InventoryService } from './storage/inventory-service.ts'
import { ManifestError } from './storage/manifest.ts'
import { RootSafetyError } from './storage/roots.ts'

function writeJson(response: ServerResponse, status: number, body: InventoryEnvelope): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

export function mountInventoryRoute(
  webServer: SearchWebServer,
  inventory: InventoryService,
): () => void {
  return webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/api/installed',
    async handler(request: IncomingMessage, response: ServerResponse) {
      if (request.method !== 'GET') {
        response.statusCode = 405
        response.setHeader('allow', 'GET')
        response.end()
        return
      }
      try {
        writeJson(response, 200, { ok: true, skills: await inventory.list() })
      } catch (error) {
        const message = error instanceof ManifestError
          ? 'The Skill Manager manifest is invalid or unreadable.'
          : error instanceof RootSafetyError
            ? 'The DSH Skills Root is not safe to inspect.'
            : 'The Managed Skill inventory could not be read.'
        writeJson(response, 500, {
          ok: false,
          error: { code: 'install-failed', message },
        })
      }
    },
  })
}

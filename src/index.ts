import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { mountInstallRoutes } from './install-routes.ts'
import { mountInventoryRoute } from './inventory-route.ts'
import { mountSearchRoute } from './search-route.ts'
import { SkillsShClient } from './skills-sh/client.ts'
import { InstallService } from './storage/install-service.ts'
import { InventoryService } from './storage/inventory-service.ts'
import { defaultSkillsRoot } from './storage/roots.ts'
import { MutationLock } from './storage/mutation-lock.ts'
import { RemovalService } from './storage/removal-service.ts'

export const name = 'dsh-skill-manager'

interface WebServerService {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void
  }): () => void
}

interface SkillManagerHost {
  webServer: WebServerService
  effect(callback: () => () => void, label: string): void
}

export interface HealthDocument {
  readonly ok: true
  readonly service: typeof name
}

export function healthDocument(): HealthDocument {
  return { ok: true, service: name }
}

export function mountHealthRoute(webServer: WebServerService): () => void {
  return webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/health',
    handler(request, response) {
      if (request.method !== 'GET') {
        response.statusCode = 405
        response.setHeader('allow', 'GET')
        response.end()
        return
      }

      response.statusCode = 200
      response.setHeader('content-type', 'application/json; charset=utf-8')
      response.end(JSON.stringify(healthDocument()))
    },
  })
}

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (scopedContext: Context) => {
    const host = scopedContext as unknown as SkillManagerHost
    host.effect(
      () => {
        const skillsSh = new SkillsShClient()
        const mutationLock = new MutationLock()
        const skillsRoot = defaultSkillsRoot()
        const installService = new InstallService({
          skillsRoot,
          catalog: skillsSh,
          mutationLock,
        })
        const removalService = new RemovalService({ skillsRoot, mutationLock })
        const inventoryService = new InventoryService(skillsRoot)
        const disposeHealth = mountHealthRoute(host.webServer)
        const disposeSearch = mountSearchRoute(host.webServer, skillsSh)
        const disposeInstall = mountInstallRoutes(
          host.webServer,
          installService,
          removalService,
        )
        const disposeInventory = mountInventoryRoute(host.webServer, inventoryService)
        return () => {
          disposeInventory()
          disposeInstall()
          disposeSearch()
          disposeHealth()
        }
      },
      'dsh-skill-manager: http routes',
    )
  })
}

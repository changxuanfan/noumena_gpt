import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

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
      () => mountHealthRoute(host.webServer),
      'dsh-skill-manager: health route',
    )
  })
}

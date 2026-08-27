import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http'
import type {
  ConfirmInstallEnvelope,
  LifecycleErrorCode,
  PrepareInstallEnvelope,
  PublicError,
  UpdateCheckEnvelope,
} from './contracts.ts'
import { SkillsShError } from './skills-sh/client.ts'
import { InstallError, type InstallService } from './storage/install-service.ts'
import { ManifestError } from './storage/manifest.ts'
import { RootSafetyError } from './storage/roots.ts'
import { SnapshotValidationError } from './storage/snapshot.ts'
import type { SearchWebServer } from './search-route.ts'

const REQUEST_LIMIT_BYTES = 64 * 1024

class RequestError extends Error {
  readonly code = 'invalid-request'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isTrustedMutationOrigin(headers: IncomingHttpHeaders): boolean {
  const origin = headers.origin
  const host = headers.host
  const fetchSite = headers['sec-fetch-site']
  if (origin === undefined || host === undefined || fetchSite !== 'same-origin') return false
  try {
    const url = new URL(origin)
    const loopbackHost = url.hostname === 'localhost'
      || url.hostname === '::1'
      || url.hostname === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
    return loopbackHost
      && (url.protocol === 'http:' || url.protocol === 'https:')
      && url.host === host
  } catch {
    return false
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string'
    || !contentType.toLowerCase().startsWith('application/json')) {
    throw new RequestError('A JSON request body is required.')
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += bytes.byteLength
    if (totalBytes > REQUEST_LIMIT_BYTES) {
      throw new RequestError('The request body is too large.')
    }
    chunks.push(bytes)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new RequestError('The request body is not valid JSON.')
  }
}

function lifecycleError(error: unknown): {
  readonly status: number
  readonly error: PublicError
} {
  let code: LifecycleErrorCode
  let status: number
  let message: string

  if (error instanceof RequestError) {
    return { status: 400, error: { code: 'invalid-request', message: error.message } }
  }
  if (error instanceof SnapshotValidationError) {
    code = error.code
    status = 422
    message = error.message
  } else if (error instanceof RootSafetyError) {
    code = 'unsafe-root'
    status = 422
    message = error.message
  } else if (error instanceof InstallError) {
    code = error.code
    status = error.code === 'not-managed' ? 404
      : error.code === 'operation-expired' ? 410
      : error.code === 'overwrite-required'
        || error.code === 'unmanaged-collision'
        || error.code === 'state-changed' ? 409
        : 500
    message = error.message
  } else if (error instanceof ManifestError) {
    code = 'install-failed'
    status = 500
    message = 'The Skill Manager state could not be updated safely.'
  } else if (error instanceof SkillsShError) {
    code = error.code === 'invalid-query' ? 'invalid-request' : 'install-failed'
    status = error.code === 'invalid-query' ? 400 : 502
    message = error.code === 'invalid-query'
      ? 'The catalog skill identifier is invalid.'
      : 'Skills.sh could not provide a valid skill snapshot.'
  } else {
    code = 'install-failed'
    status = 500
    message = 'The skill installation failed unexpectedly.'
  }
  return { status, error: { code, message } }
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: PrepareInstallEnvelope | ConfirmInstallEnvelope | UpdateCheckEnvelope,
): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

function assertPost(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('allow', 'POST')
    response.end()
    return false
  }
  if (!isTrustedMutationOrigin(request.headers)) {
    writeJson(response, 403, {
      ok: false,
      error: { code: 'invalid-request', message: 'A same-origin request is required.' },
    })
    return false
  }
  return true
}

export function mountInstallRoutes(
  webServer: SearchWebServer,
  service: InstallService,
): () => void {
  const disposePrepare = webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/api/install/prepare',
    async handler(request, response) {
      if (!assertPost(request, response)) return
      try {
        const body = await readJsonBody(request)
        if (!isRecord(body) || typeof body.id !== 'string') {
          throw new RequestError('A catalog skill identifier is required.')
        }
        const prepared = await service.prepare(body.id, new AbortController().signal)
        writeJson(response, 200, { ok: true, prepared })
      } catch (error) {
        const failure = lifecycleError(error)
        writeJson(response, failure.status, { ok: false, error: failure.error })
      }
    },
  })

  const disposeConfirm = webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/api/install/confirm',
    async handler(request, response) {
      if (!assertPost(request, response)) return
      try {
        const body = await readJsonBody(request)
        if (!isRecord(body)
          || typeof body.operationId !== 'string'
          || typeof body.overwrite !== 'boolean') {
          throw new RequestError('A prepared operation and overwrite decision are required.')
        }
        const skill = await service.confirm({
          operationId: body.operationId,
          overwrite: body.overwrite,
        })
        writeJson(response, 200, { ok: true, skill })
      } catch (error) {
        const failure = lifecycleError(error)
        writeJson(response, failure.status, { ok: false, error: failure.error })
      }
    },
  })

  const disposeUpdateCheck = webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/api/update/check',
    async handler(request, response) {
      if (!assertPost(request, response)) return
      try {
        const body = await readJsonBody(request)
        if (!isRecord(body) || typeof body.name !== 'string') {
          throw new RequestError('A Managed Skill name is required.')
        }
        const update = await service.checkUpdate(body.name, new AbortController().signal)
        writeJson(response, 200, { ok: true, update })
      } catch (error) {
        const failure = lifecycleError(error)
        writeJson(response, failure.status, { ok: false, error: failure.error })
      }
    },
  })

  const disposeUpdateConfirm = webServer.register({
    kind: 'exact',
    path: '/dsh-skill-manager/api/update/confirm',
    async handler(request, response) {
      if (!assertPost(request, response)) return
      try {
        const body = await readJsonBody(request)
        if (!isRecord(body) || typeof body.operationId !== 'string') {
          throw new RequestError('A prepared update operation is required.')
        }
        const skill = await service.confirm({
          operationId: body.operationId,
          overwrite: true,
        })
        writeJson(response, 200, { ok: true, skill })
      } catch (error) {
        const failure = lifecycleError(error)
        writeJson(response, failure.status, { ok: false, error: failure.error })
      }
    },
  })

  return () => {
    disposeUpdateConfirm()
    disposeUpdateCheck()
    disposeConfirm()
    disposePrepare()
  }
}

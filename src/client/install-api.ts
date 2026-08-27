import {
  isConfirmInstallEnvelope,
  isPrepareInstallEnvelope,
  type ManagedSkillDocument,
  type PreparedInstallDocument,
  type PublicErrorCode,
} from '../contracts.ts'

export class InstallApiError extends Error {
  constructor(
    readonly code: PublicErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'InstallApiError'
  }
}

async function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new InstallApiError('network', 'Unable to reach the DSH host.')
  }

  try {
    return await response.json() as unknown
  } catch {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
}

export async function prepareInstall(
  id: string,
  signal: AbortSignal,
): Promise<PreparedInstallDocument> {
  const body = await postJson('/dsh-skill-manager/api/install/prepare', { id }, signal)
  if (!isPrepareInstallEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.prepared
}

export async function confirmInstall(
  operationId: string,
  overwrite: boolean,
): Promise<ManagedSkillDocument> {
  const body = await postJson('/dsh-skill-manager/api/install/confirm', {
    operationId,
    overwrite,
  })
  if (!isConfirmInstallEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.skill
}

import {
  isConfirmRemovalEnvelope,
  isPrepareRemovalEnvelope,
  type PreparedRemovalDocument,
} from '../contracts.ts'
import { InstallApiError } from './install-api.ts'

async function post(path: string, body: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new InstallApiError('network', 'Unable to reach the DSH host.')
  }
  try {
    return await response.json() as unknown
  } catch {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
}

export async function prepareSkillRemoval(name: string): Promise<PreparedRemovalDocument> {
  const body = await post('/dsh-skill-manager/api/remove/prepare', { name })
  if (!isPrepareRemovalEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.prepared
}

export async function confirmSkillRemoval(operationId: string): Promise<string> {
  const body = await post('/dsh-skill-manager/api/remove/confirm', { operationId })
  if (!isConfirmRemovalEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.name
}

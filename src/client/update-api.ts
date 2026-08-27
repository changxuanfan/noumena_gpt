import {
  isConfirmInstallEnvelope,
  isUpdateCheckEnvelope,
  type ManagedSkillDocument,
  type UpdateCheckDocument,
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

export async function checkSkillUpdate(name: string): Promise<UpdateCheckDocument> {
  const body = await post('/dsh-skill-manager/api/update/check', { name })
  if (!isUpdateCheckEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.update
}

export async function confirmSkillUpdate(
  operationId: string,
): Promise<ManagedSkillDocument> {
  const body = await post('/dsh-skill-manager/api/update/confirm', { operationId })
  if (!isConfirmInstallEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.skill
}

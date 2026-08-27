import {
  isInventoryEnvelope,
  type ManagedSkillInventoryItem,
} from '../contracts.ts'
import { InstallApiError } from './install-api.ts'

export async function listManagedSkills(): Promise<readonly ManagedSkillInventoryItem[]> {
  let response: Response
  try {
    response = await fetch('/dsh-skill-manager/api/installed', {
      headers: { accept: 'application/json' },
    })
  } catch {
    throw new InstallApiError('network', 'Unable to reach the DSH host.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!isInventoryEnvelope(body)) {
    throw new InstallApiError('invalid-response', 'The DSH host returned an invalid response.')
  }
  if (!body.ok) throw new InstallApiError(body.error.code, body.error.message)
  return body.skills
}

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ManagedSkillDocument,
  ManagedSkillInventoryItem,
  UpdateCheckDocument,
} from '../src/contracts.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.ts'
import { en, type LocaleKey } from '../src/client/locales.ts'

const t = (key: LocaleKey): string => en[key]
const managed: ManagedSkillInventoryItem = {
  name: 'safe-skill',
  description: 'A safe skill',
  catalogId: 'owner/repo/safe-skill',
  source: 'owner/repo',
  pageUrl: 'https://skills.sh/owner/repo/safe-skill',
  remoteHash: 'a'.repeat(64),
  localHash: 'b'.repeat(64),
  installedAt: '2026-08-27T11:00:00.000Z',
  updatedAt: '2026-08-27T11:00:00.000Z',
  state: 'current',
}
const updated: ManagedSkillDocument = {
  ...managed,
  remoteHash: 'c'.repeat(64),
}

afterEach(cleanup)

function renderUpdate(
  checkSkillUpdate: (name: string) => Promise<UpdateCheckDocument>,
  confirmSkillUpdate: (operationId: string) => Promise<ManagedSkillDocument>,
): void {
  render(h(SkillManagerSection, {
    t,
    search: async () => [],
    prepareInstall: async () => { throw new Error('not called') },
    confirmInstall: async () => { throw new Error('not called') },
    listManagedSkills: async () => [managed],
    checkSkillUpdate,
    confirmSkillUpdate,
  }))
}

describe('Managed Skill update UI', () => {
  it('reports a Source Unavailable without offering a destructive action', async () => {
    renderUpdate(async () => ({
      name: managed.name,
      status: 'source-unavailable',
      updateAvailable: false,
    }), async () => updated)
    await screen.findByRole('heading', { name: managed.name })

    fireEvent.click(screen.getByRole('button', { name: en.checkUpdate }))
    expect(await screen.findByText(en.sourceUnavailable)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('warns about local modifications and updates only after confirmation', async () => {
    const check: UpdateCheckDocument = {
      name: managed.name,
      status: 'locally-modified',
      updateAvailable: true,
      operationId: 'update-operation',
      expiresAt: '2026-08-27T12:00:00.000Z',
    }
    const confirm = vi.fn(async () => updated)
    renderUpdate(async () => check, confirm)
    await screen.findByRole('heading', { name: managed.name })

    fireEvent.click(screen.getByRole('button', { name: en.checkUpdate }))
    expect(await screen.findByText(en.modifiedUpdatePrompt)).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: en.confirmUpdate }))
    expect(await screen.findByText(`${en.updated} ${managed.name}`)).toBeTruthy()
    expect(confirm).toHaveBeenCalledWith('update-operation')
  })
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ManagedSkillInventoryItem,
  PreparedRemovalDocument,
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
  state: 'locally-modified',
}
const prepared: PreparedRemovalDocument = {
  operationId: 'remove-operation',
  name: managed.name,
  description: managed.description,
  source: managed.source,
  state: 'locally-modified',
  expiresAt: '2026-08-27T12:00:00.000Z',
}

afterEach(cleanup)

function renderRemoval(confirmSkillRemoval: (operationId: string) => Promise<string>): void {
  render(h(SkillManagerSection, {
    t,
    search: async () => [],
    prepareInstall: async () => { throw new Error('not called') },
    confirmInstall: async () => { throw new Error('not called') },
    listManagedSkills: async () => [managed],
    checkSkillUpdate: async () => { throw new Error('not called') },
    confirmSkillUpdate: async () => { throw new Error('not called') },
    prepareSkillRemoval: async () => prepared,
    confirmSkillRemoval,
  }))
  fireEvent.click(screen.getByRole('tab', { name: /Managed Skills/ }))
}

describe('Managed Skill removal UI', () => {
  it('warns about local changes and does nothing when cancelled', async () => {
    const confirm = vi.fn(async () => managed.name)
    renderRemoval(confirm)
    await screen.findByRole('heading', { name: managed.name })

    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    expect(await screen.findByText(en.modifiedRemovePrompt)).toBeTruthy()
    expect((screen.getByRole('button', { name: en.checkUpdate }) as HTMLButtonElement).disabled)
      .toBe(true)
    expect((screen.getByRole('button', { name: en.remove }) as HTMLButtonElement).disabled)
      .toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))

    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('removes only after explicit confirmation', async () => {
    const confirm = vi.fn(async () => managed.name)
    renderRemoval(confirm)
    await screen.findByRole('heading', { name: managed.name })

    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: en.confirmRemoval }))

    expect(await screen.findByText(`${en.removed} ${managed.name}`)).toBeTruthy()
    expect(confirm).toHaveBeenCalledWith(prepared.operationId)
  })
})

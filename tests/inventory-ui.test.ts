import { cleanup, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ManagedSkillInventoryItem } from '../src/contracts.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.ts'
import { en, type LocaleKey } from '../src/client/locales.ts'

const t = (key: LocaleKey): string => en[key]

afterEach(cleanup)

function renderInventory(listManagedSkills: () => Promise<readonly ManagedSkillInventoryItem[]>): void {
  render(h(SkillManagerSection, {
    t,
    search: async () => [],
    prepareInstall: async () => { throw new Error('not called') },
    confirmInstall: async () => { throw new Error('not called') },
    listManagedSkills,
    checkSkillUpdate: async () => { throw new Error('not called') },
    confirmSkillUpdate: async () => { throw new Error('not called') },
  }))
}

describe('Managed Skill inventory UI', () => {
  it('renders an explicit empty state', async () => {
    renderInventory(async () => [])
    expect(await screen.findByText(en.noInstalled)).toBeTruthy()
  })

  it('renders ownership metadata and local state', async () => {
    renderInventory(async () => [{
      name: 'safe-skill',
      description: 'A safe skill',
      catalogId: 'owner/repo/safe-skill',
      source: 'owner/repo',
      pageUrl: 'https://skills.sh/owner/repo/safe-skill',
      remoteHash: 'remote',
      localHash: 'local',
      installedAt: '2026-08-27T11:00:00.000Z',
      updatedAt: '2026-08-27T11:00:00.000Z',
      state: 'locally-modified',
    }])

    expect(await screen.findByRole('heading', { name: 'safe-skill' })).toBeTruthy()
    expect(screen.getByText(en.stateModified)).toBeTruthy()
    expect(screen.getByText('owner/repo')).toBeTruthy()
  })

  it('surfaces an inventory error', async () => {
    renderInventory(async () => {
      throw new Error('Manifest is invalid.')
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Manifest is invalid.')
  })
})

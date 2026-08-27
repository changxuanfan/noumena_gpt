import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ManagedSkillInventoryItem } from '../src/contracts.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.ts'
import { en, type LocaleKey } from '../src/client/locales.ts'

const t = (key: LocaleKey): string => en[key]

afterEach(cleanup)

function renderInventory(
  listManagedSkills: () => Promise<readonly ManagedSkillInventoryItem[]>,
  openManaged = true,
): void {
  render(h(SkillManagerSection, {
    t,
    search: async () => [],
    prepareInstall: async () => { throw new Error('not called') },
    confirmInstall: async () => { throw new Error('not called') },
    listManagedSkills,
    checkSkillUpdate: async () => { throw new Error('not called') },
    confirmSkillUpdate: async () => { throw new Error('not called') },
    prepareSkillRemoval: async () => { throw new Error('not called') },
    confirmSkillRemoval: async () => { throw new Error('not called') },
  }))
  if (openManaged) {
    fireEvent.click(screen.getByRole('tab', { name: /Managed Skills/ }))
  }
}

describe('Managed Skill inventory UI', () => {
  it('keeps Discover and Managed Skills in separate tab panels', async () => {
    renderInventory(async () => [])
    expect(screen.getByRole('tab', { name: en.discoverTab }).getAttribute('aria-selected'))
      .toBe('false')
    expect(screen.getByRole('tab', { name: /Managed Skills/ }).getAttribute('aria-selected'))
      .toBe('true')
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(await screen.findByText(en.noInstalled)).toBeTruthy()
  })

  it('uses roving focus and arrow keys to switch tabs', () => {
    renderInventory(async () => [], false)
    const discover = screen.getByRole('tab', { name: en.discoverTab })
    const managedTab = screen.getByRole('tab', { name: /Managed Skills/ })
    discover.focus()

    fireEvent.keyDown(discover, { key: 'ArrowRight' })

    expect(managedTab.getAttribute('aria-selected')).toBe('true')
    expect(managedTab.getAttribute('tabindex')).toBe('0')
    expect(discover.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(managedTab)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

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

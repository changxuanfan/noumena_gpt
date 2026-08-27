import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CatalogSkill,
  ManagedSkillDocument,
  PreparedInstallDocument,
} from '../src/contracts.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.ts'
import { en, type LocaleKey } from '../src/client/locales.ts'

const t = (key: LocaleKey): string => en[key]
const result: CatalogSkill = {
  id: 'owner/repo/safe-skill',
  name: 'safe-skill',
  description: 'A safe skill',
  source: 'owner/repo',
  installs: 10,
  pageUrl: 'https://skills.sh/owner/repo/safe-skill',
}
const prepared: PreparedInstallDocument = {
  operationId: 'operation-id',
  name: 'safe-skill',
  description: 'A safe skill',
  source: 'owner/repo',
  pageUrl: result.pageUrl,
  collision: 'none',
  expiresAt: '2026-08-27T12:00:00.000Z',
}
const installed: ManagedSkillDocument = {
  ...prepared,
  catalogId: result.id,
  remoteHash: 'remote',
  localHash: 'local',
  installedAt: '2026-08-27T11:00:00.000Z',
  updatedAt: '2026-08-27T11:00:00.000Z',
}

afterEach(cleanup)

async function renderResult(
  prepareInstall: (id: string, signal: AbortSignal) => Promise<PreparedInstallDocument>,
  confirmInstall: (
    operationId: string,
    overwrite: boolean,
  ) => Promise<ManagedSkillDocument>,
): Promise<void> {
  render(h(SkillManagerSection, {
    t,
    search: async () => [result],
    prepareInstall,
    confirmInstall,
    listManagedSkills: async () => [],
    checkSkillUpdate: async () => { throw new Error('not called') },
    confirmSkillUpdate: async () => { throw new Error('not called') },
    prepareSkillRemoval: async () => { throw new Error('not called') },
    confirmSkillRemoval: async () => { throw new Error('not called') },
  }))
  fireEvent.change(screen.getByRole('searchbox', { name: en.searchLabel }), {
    target: { value: 'safe' },
  })
  fireEvent.click(screen.getByRole('button', { name: en.searchAction }))
  await screen.findByRole('heading', { name: result.name })
}

describe('Skill Manager installation', () => {
  it('prepares a skill and does not install when confirmation is cancelled', async () => {
    const prepareInstall = vi.fn(async () => prepared)
    const confirmInstall = vi.fn(async () => installed)
    await renderResult(prepareInstall, confirmInstall)

    const installButton = screen.getByRole('button', { name: en.install })
    installButton.focus()
    fireEvent.click(installButton)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(prepareInstall).toHaveBeenCalledWith(result.id, expect.any(AbortSignal))
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: en.confirmInstall }),
    )
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: en.cancel }),
    )
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: en.confirmInstall }),
    )

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(confirmInstall).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(installButton)
  })

  it('installs only after explicit confirmation', async () => {
    const prepareInstall = vi.fn(async () => prepared)
    const confirmInstall = vi.fn(async () => installed)
    await renderResult(prepareInstall, confirmInstall)

    fireEvent.click(screen.getByRole('button', { name: en.install }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: en.confirmInstall }))

    expect(await screen.findByText(`${en.installed} safe-skill`)).toBeTruthy()
    expect(confirmInstall).toHaveBeenCalledWith(prepared.operationId, false)
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: en.title }),
    )
  })
})

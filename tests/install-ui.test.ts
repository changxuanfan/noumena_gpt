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
  }))
  fireEvent.change(screen.getByLabelText(en.searchLabel), { target: { value: 'safe' } })
  fireEvent.click(screen.getByRole('button', { name: en.searchAction }))
  await screen.findByRole('heading', { name: result.name })
}

describe('Skill Manager installation', () => {
  it('prepares a skill and does not install when confirmation is cancelled', async () => {
    const prepareInstall = vi.fn(async () => prepared)
    const confirmInstall = vi.fn(async () => installed)
    await renderResult(prepareInstall, confirmInstall)

    fireEvent.click(screen.getByRole('button', { name: en.install }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(prepareInstall).toHaveBeenCalledWith(result.id, expect.any(AbortSignal))

    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(confirmInstall).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
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
  })
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogSkill } from '../src/contracts.ts'
import { SkillManagerSection } from '../src/client/SkillManagerSection.ts'
import { en, type LocaleKey } from '../src/client/locales.ts'

const t = (key: LocaleKey): string => en[key]

afterEach(cleanup)

function submit(query: string): void {
  fireEvent.change(screen.getByLabelText(en.searchLabel), { target: { value: query } })
  fireEvent.click(screen.getByRole('button', { name: en.searchAction }))
}

function renderManager(
  search: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly CatalogSkill[]>,
): void {
  const prepareInstall = async (): Promise<never> => {
    throw new Error('not called')
  }
  const confirmInstall = async (): Promise<never> => {
    throw new Error('not called')
  }
  render(h(SkillManagerSection, {
    t,
    search,
    prepareInstall,
    confirmInstall,
    listManagedSkills: async () => [],
    checkSkillUpdate: async () => { throw new Error('not called') },
    confirmSkillUpdate: async () => { throw new Error('not called') },
  }))
}

describe('Skill Manager search', () => {
  it('shows loading and then a complete search result', async () => {
    let resolveSearch: ((results: readonly CatalogSkill[]) => void) | undefined
    const search = vi.fn(() => new Promise<readonly CatalogSkill[]>(resolve => {
      resolveSearch = resolve
    }))
    renderManager(search)

    submit('react')
    expect(screen.getByText(en.searching)).toBeTruthy()

    resolveSearch?.([{
      id: 'owner/repo/react-skill',
      name: 'react-skill',
      description: 'React guidance',
      source: 'owner/repo',
      installs: 1200,
      pageUrl: 'https://skills.sh/owner/repo/react-skill',
    }])

    expect(await screen.findByRole('heading', { name: 'react-skill' })).toBeTruthy()
    expect(screen.getByText('React guidance')).toBeTruthy()
    expect(screen.getByText('owner/repo')).toBeTruthy()
    expect(screen.getByRole('link', { name: en.openPage }).getAttribute('href'))
      .toBe('https://skills.sh/owner/repo/react-skill')
  })

  it('shows an explicit empty state', async () => {
    const search = vi.fn(async () => [])
    renderManager(search)

    submit('nothing')
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('shows a retryable failure', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(new Error('Skills.sh is unavailable.'))
      .mockResolvedValueOnce([])
    renderManager(search)

    submit('react')
    expect((await screen.findByRole('alert')).textContent).toBe('Skills.sh is unavailable.')
    fireEvent.click(screen.getByRole('button', { name: en.retry }))

    await waitFor(() => expect(search).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('aborts the previous request when a new search starts', async () => {
    const signals: AbortSignal[] = []
    const search = vi.fn((_query: string, signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<never[]>(() => undefined)
    })
    renderManager(search)

    submit('first')
    fireEvent.change(screen.getByLabelText(en.searchLabel), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: en.searchAction }))

    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
  })
})

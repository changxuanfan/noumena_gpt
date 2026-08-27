import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SkillManagerSection } from '../src/client/SkillManagerSection.ts'
import { en, zh, type LocaleKey } from '../src/client/locales.ts'

describe('SkillManagerSection', () => {
  it.each([
    ['English', en],
    ['Chinese', zh],
  ])('renders its localized heading and introduction in %s', (_language, messages) => {
    const t = (key: LocaleKey): string => messages[key]
    const search = async (): Promise<never[]> => []
    const prepareInstall = async (): Promise<never> => {
      throw new Error('not called')
    }
    const confirmInstall = async (): Promise<never> => {
      throw new Error('not called')
    }
    const listManagedSkills = async (): Promise<never[]> => []
    const checkSkillUpdate = async (): Promise<never> => {
      throw new Error('not called')
    }
    const confirmSkillUpdate = async (): Promise<never> => {
      throw new Error('not called')
    }
    const prepareSkillRemoval = async (): Promise<never> => {
      throw new Error('not called')
    }
    const confirmSkillRemoval = async (): Promise<never> => {
      throw new Error('not called')
    }
    const markup = renderToStaticMarkup(h(SkillManagerSection, {
      t,
      search,
      prepareInstall,
      confirmInstall,
      listManagedSkills,
      checkSkillUpdate,
      confirmSkillUpdate,
      prepareSkillRemoval,
      confirmSkillRemoval,
    }))

    expect(markup).toContain(messages.title)
    expect(markup).toContain(messages.introduction)
    expect(markup).toContain('aria-labelledby="dsh-skill-manager-title"')
  })
})

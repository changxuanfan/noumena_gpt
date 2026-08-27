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
    const markup = renderToStaticMarkup(h(SkillManagerSection, { t, search }))

    expect(markup).toContain(messages.title)
    expect(markup).toContain(messages.introduction)
    expect(markup).toContain('aria-labelledby="dsh-skill-manager-title"')
  })
})

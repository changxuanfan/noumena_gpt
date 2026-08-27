import { createElement as h, type ReactNode } from 'react'
import type { Translate } from './locales.ts'

export interface SkillManagerSectionProps {
  readonly t: Translate
}

export function SkillManagerSection({ t }: SkillManagerSectionProps): ReactNode {
  return h(
    'section',
    { 'aria-labelledby': 'dsh-skill-manager-title' },
    h('h2', { id: 'dsh-skill-manager-title' }, t('title')),
    h('p', null, t('introduction')),
  )
}

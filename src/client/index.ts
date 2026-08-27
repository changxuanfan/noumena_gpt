import { createElement as h } from 'react'
import { SkillManagerSection } from './SkillManagerSection.ts'
import { en, zh, type Translate } from './locales.ts'
import { searchCatalog } from './search-api.ts'
import { confirmInstall, prepareInstall } from './install-api.ts'
import { listManagedSkills } from './inventory-api.ts'
import { checkSkillUpdate, confirmSkillUpdate } from './update-api.ts'

const namespace = 'dsh-skill-manager'

interface LocaleService {
  register(
    namespace: string,
    dictionaries: { readonly en: typeof en; readonly zh: typeof zh },
  ): unknown
  bind(namespace: string): Translate
}

interface SlotsService {
  inject(name: 'settings.section', register: () => unknown): void
  register(
    metadata: {
      readonly name: 'settings.section'
      readonly id: string
      readonly order: number
      readonly label: () => string
      readonly locale: string
      readonly inject: () => { readonly t: Translate }
    },
    component: () => unknown,
  ): unknown
}

interface SkillManagerClientContext {
  readonly locale: LocaleService
  readonly slots: SlotsService
  effect(callback: () => unknown, label: string): void
}

export const name = namespace
export const inject = ['slots', 'locale']

export function apply(ctx: SkillManagerClientContext): void {
  ctx.effect(
    () => ctx.locale.register(namespace, { en, zh }),
    'dsh-skill-manager: dictionaries',
  )

  const t = ctx.locale.bind(namespace)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skill-manager',
    order: 45,
    label: () => t('nav'),
    locale: namespace,
    inject: () => ({ t }),
  }, () => h(SkillManagerSection, {
    t,
    search: searchCatalog,
    prepareInstall,
    confirmInstall,
    listManagedSkills,
    checkSkillUpdate,
    confirmSkillUpdate,
  })))
}

import {
  createElement as h,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { CatalogSkill } from '../contracts.ts'
import type { Translate } from './locales.ts'

export interface SkillManagerSectionProps {
  readonly t: Translate
  readonly search: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly CatalogSkill[]>
}

type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly results: readonly CatalogSkill[] }
  | { readonly status: 'error'; readonly message: string }

function formatInstalls(installs: number): string {
  return new Intl.NumberFormat().format(installs)
}

export function SkillManagerSection({ t, search }: SkillManagerSectionProps): ReactNode {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => activeRequest.current?.abort(), [])

  const runSearch = async (nextQuery: string): Promise<void> => {
    const normalizedQuery = nextQuery.trim()
    if (normalizedQuery.length === 0) return

    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setSubmittedQuery(normalizedQuery)
    setState({ status: 'loading' })

    try {
      const results = await search(normalizedQuery, controller.signal)
      if (activeRequest.current === controller) setState({ status: 'ready', results })
    } catch (error) {
      if (controller.signal.aborted || activeRequest.current !== controller) return
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void runSearch(query)
  }

  return h(
    'section',
    { 'aria-labelledby': 'dsh-skill-manager-title' },
    h('h2', { id: 'dsh-skill-manager-title' }, t('title')),
    h('p', null, t('introduction')),
    h(
      'form',
      { onSubmit: submit },
      h('label', { htmlFor: 'dsh-skill-search' }, t('searchLabel')),
      h('input', {
        id: 'dsh-skill-search',
        name: 'query',
        type: 'search',
        value: query,
        placeholder: t('searchPlaceholder'),
        onChange: (event: { currentTarget: { value: string } }) => setQuery(event.currentTarget.value),
      }),
      h('button', {
        type: 'submit',
        disabled: query.trim().length === 0,
      }, t('searchAction')),
    ),
    state.status === 'loading'
      ? h('p', { role: 'status', 'aria-live': 'polite' }, t('searching'))
      : null,
    state.status === 'error'
      ? h(
          'div',
          null,
          h('p', { role: 'alert' }, state.message),
          h('button', {
            type: 'button',
            onClick: () => void runSearch(submittedQuery),
          }, t('retry')),
        )
      : null,
    state.status === 'ready' && state.results.length === 0
      ? h('p', { role: 'status' }, t('empty'))
      : null,
    state.status === 'ready' && state.results.length > 0
      ? h(
          'ul',
          { 'aria-label': t('searchLabel') },
          ...state.results.map(skill => h(
            'li',
            { key: skill.id },
            h('article', null,
              h('h3', null, skill.name),
              h('p', null, skill.description ?? t('descriptionUnavailable')),
              h('p', null, skill.source),
              h('p', null, `${formatInstalls(skill.installs)} ${t('installs')}`),
              h('a', {
                href: skill.pageUrl,
                target: '_blank',
                rel: 'noreferrer',
              }, t('openPage')),
            ),
          )),
        )
      : null,
  )
}

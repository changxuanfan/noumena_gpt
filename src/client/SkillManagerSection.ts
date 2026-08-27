import {
  createElement as h,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { CatalogSkill } from '../contracts.ts'
import type {
  ManagedSkillDocument,
  ManagedSkillInventoryItem,
  PreparedInstallDocument,
  UpdateCheckDocument,
} from '../contracts.ts'
import type { Translate } from './locales.ts'

export interface SkillManagerSectionProps {
  readonly t: Translate
  readonly search: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly CatalogSkill[]>
  readonly prepareInstall: (
    id: string,
    signal: AbortSignal,
  ) => Promise<PreparedInstallDocument>
  readonly confirmInstall: (
    operationId: string,
    overwrite: boolean,
  ) => Promise<ManagedSkillDocument>
  readonly listManagedSkills: () => Promise<readonly ManagedSkillInventoryItem[]>
  readonly checkSkillUpdate: (name: string) => Promise<UpdateCheckDocument>
  readonly confirmSkillUpdate: (operationId: string) => Promise<ManagedSkillDocument>
}

type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly results: readonly CatalogSkill[] }
  | { readonly status: 'error'; readonly message: string }

type InstallState =
  | { readonly status: 'idle' }
  | { readonly status: 'preparing' }
  | { readonly status: 'confirming'; readonly prepared: PreparedInstallDocument }
  | { readonly status: 'installing'; readonly prepared: PreparedInstallDocument }
  | { readonly status: 'success'; readonly skill: ManagedSkillDocument }
  | { readonly status: 'error'; readonly message: string }

type InventoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly skills: readonly ManagedSkillInventoryItem[] }
  | { readonly status: 'error'; readonly message: string }

type UpdateState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking'; readonly name: string }
  | { readonly status: 'result'; readonly update: UpdateCheckDocument }
  | { readonly status: 'confirming'; readonly update: UpdateCheckDocument }
  | { readonly status: 'updating'; readonly update: UpdateCheckDocument }
  | { readonly status: 'success'; readonly name: string }
  | { readonly status: 'error'; readonly message: string }

function formatInstalls(installs: number): string {
  return new Intl.NumberFormat().format(installs)
}

export function SkillManagerSection({
  t,
  search,
  prepareInstall,
  confirmInstall,
  listManagedSkills,
  checkSkillUpdate,
  confirmSkillUpdate,
}: SkillManagerSectionProps): ReactNode {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [installState, setInstallState] = useState<InstallState>({ status: 'idle' })
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const [inventoryState, setInventoryState] = useState<InventoryState>({ status: 'loading' })
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const activeRequest = useRef<AbortController | null>(null)
  const activePreparation = useRef<AbortController | null>(null)

  useEffect(() => () => {
    activeRequest.current?.abort()
    activePreparation.current?.abort()
  }, [])

  useEffect(() => {
    let current = true
    setInventoryState({ status: 'loading' })
    void listManagedSkills().then(
      skills => {
        if (current) setInventoryState({ status: 'ready', skills })
      },
      error => {
        if (current) {
          setInventoryState({
            status: 'error',
            message: error instanceof Error ? error.message : t('inventoryError'),
          })
        }
      },
    )
    return () => {
      current = false
    }
  }, [inventoryVersion, listManagedSkills, t])

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

  const beginInstall = async (skill: CatalogSkill): Promise<void> => {
    activePreparation.current?.abort()
    const controller = new AbortController()
    activePreparation.current = controller
    setInstallState({ status: 'preparing' })
    try {
      const prepared = await prepareInstall(skill.id, controller.signal)
      if (activePreparation.current === controller) {
        setInstallState({ status: 'confirming', prepared })
      }
    } catch (error) {
      if (controller.signal.aborted || activePreparation.current !== controller) return
      setInstallState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const finishInstall = async (prepared: PreparedInstallDocument): Promise<void> => {
    setInstallState({ status: 'installing', prepared })
    try {
      const skill = await confirmInstall(
        prepared.operationId,
        prepared.collision === 'managed',
      )
      setInstallState({ status: 'success', skill })
      setInventoryVersion(version => version + 1)
    } catch (error) {
      setInstallState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const checkUpdate = async (name: string): Promise<void> => {
    setUpdateState({ status: 'checking', name })
    try {
      const update = await checkSkillUpdate(name)
      setUpdateState(update.updateAvailable
        ? { status: 'confirming', update }
        : { status: 'result', update })
    } catch (error) {
      setUpdateState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const applyUpdate = async (update: UpdateCheckDocument): Promise<void> => {
    if (update.operationId === undefined) return
    setUpdateState({ status: 'updating', update })
    try {
      const skill = await confirmSkillUpdate(update.operationId)
      setUpdateState({ status: 'success', name: skill.name })
      setInventoryVersion(version => version + 1)
    } catch (error) {
      setUpdateState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
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
              h('button', {
                type: 'button',
                disabled: installState.status === 'preparing'
                  || installState.status === 'installing',
                onClick: () => void beginInstall(skill),
              }, t('install')),
            ),
          )),
        )
      : null,
    installState.status === 'preparing'
      ? h('p', { role: 'status', 'aria-live': 'polite' }, t('preparingInstall'))
      : null,
    installState.status === 'confirming'
      ? h(
          'div',
          {
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dsh-skill-install-confirmation',
          },
          h('h3', { id: 'dsh-skill-install-confirmation' }, t('confirmInstallTitle')),
          h('strong', null, installState.prepared.name),
          h('p', null, installState.prepared.description),
          h('p', null, installState.prepared.source),
          h('p', null, installState.prepared.collision === 'managed'
            ? t('overwritePrompt')
            : t('installPrompt')),
          h('button', {
            type: 'button',
            onClick: () => setInstallState({ status: 'idle' }),
          }, t('cancel')),
          h('button', {
            type: 'button',
            onClick: () => void finishInstall(installState.prepared),
          }, installState.prepared.collision === 'managed'
            ? t('confirmOverwrite')
            : t('confirmInstall')),
        )
      : null,
    installState.status === 'installing'
      ? h('p', { role: 'status', 'aria-live': 'polite' }, t('installing'))
      : null,
    installState.status === 'success'
      ? h('p', { role: 'status' }, `${t('installed')} ${installState.skill.name}`)
      : null,
    installState.status === 'error'
      ? h('p', { role: 'alert' }, installState.message)
      : null,
    h('h2', null, t('installedTitle')),
    inventoryState.status === 'loading'
      ? h('p', { role: 'status' }, t('loadingInstalled'))
      : null,
    inventoryState.status === 'error'
      ? h(
          'div',
          null,
          h('p', { role: 'alert' }, inventoryState.message),
          h('button', {
            type: 'button',
            onClick: () => setInventoryVersion(version => version + 1),
          }, t('retry')),
        )
      : null,
    inventoryState.status === 'ready' && inventoryState.skills.length === 0
      ? h('p', null, t('noInstalled'))
      : null,
    inventoryState.status === 'ready' && inventoryState.skills.length > 0
      ? h(
          'ul',
          { 'aria-label': t('installedTitle') },
          ...inventoryState.skills.map(skill => h(
            'li',
            { key: skill.name },
            h('article', null,
              h('h3', null, skill.name),
              h('p', null, skill.description),
              h('p', null, skill.source),
              h('p', null, t(skill.state === 'current'
                ? 'stateCurrent'
                : skill.state === 'locally-modified'
                  ? 'stateModified'
                  : skill.state === 'missing'
                    ? 'stateMissing'
                    : 'stateInvalid')),
              h('a', {
                href: skill.pageUrl,
                target: '_blank',
                rel: 'noreferrer',
              }, t('openPage')),
              h('button', {
                type: 'button',
                disabled: updateState.status === 'checking'
                  || updateState.status === 'updating',
                onClick: () => void checkUpdate(skill.name),
              }, t('checkUpdate')),
            ),
          )),
        )
      : null,
    updateState.status === 'checking'
      ? h('p', { role: 'status' }, `${t('checkingUpdate')} ${updateState.name}`)
      : null,
    updateState.status === 'result'
      ? h('p', { role: 'status' },
          updateState.update.status === 'current'
            ? t('upToDate')
            : updateState.update.status === 'source-unavailable'
              ? t('sourceUnavailable')
              : updateState.update.status === 'locally-modified'
                ? t('stateModified')
                : t('localInvalid'))
      : null,
    updateState.status === 'confirming'
      ? h(
          'div',
          {
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dsh-skill-update-confirmation',
          },
          h('h3', { id: 'dsh-skill-update-confirmation' }, t('confirmUpdateTitle')),
          h('strong', null, updateState.update.name),
          h('p', null, updateState.update.status === 'locally-modified'
            ? t('modifiedUpdatePrompt')
            : updateState.update.status === 'local-invalid'
              ? t('repairUpdatePrompt')
              : t('updatePrompt')),
          h('button', {
            type: 'button',
            onClick: () => setUpdateState({ status: 'idle' }),
          }, t('cancel')),
          h('button', {
            type: 'button',
            onClick: () => void applyUpdate(updateState.update),
          }, t('confirmUpdate')),
        )
      : null,
    updateState.status === 'updating'
      ? h('p', { role: 'status' }, t('updating'))
      : null,
    updateState.status === 'success'
      ? h('p', { role: 'status' }, `${t('updated')} ${updateState.name}`)
      : null,
    updateState.status === 'error'
      ? h('p', { role: 'alert' }, updateState.message)
      : null,
  )
}

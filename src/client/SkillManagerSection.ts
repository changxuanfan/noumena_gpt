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
  PreparedRemovalDocument,
  UpdateCheckDocument,
} from '../contracts.ts'
import { ConfirmDialog } from './ConfirmDialog.ts'
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
  readonly prepareSkillRemoval: (name: string) => Promise<PreparedRemovalDocument>
  readonly confirmSkillRemoval: (operationId: string) => Promise<string>
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

type RemovalState =
  | { readonly status: 'idle' }
  | { readonly status: 'preparing'; readonly name: string }
  | { readonly status: 'confirming'; readonly prepared: PreparedRemovalDocument }
  | { readonly status: 'removing'; readonly prepared: PreparedRemovalDocument }
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
  prepareSkillRemoval,
  confirmSkillRemoval,
}: SkillManagerSectionProps): ReactNode {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [installState, setInstallState] = useState<InstallState>({ status: 'idle' })
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const [inventoryState, setInventoryState] = useState<InventoryState>({ status: 'loading' })
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [removalState, setRemovalState] = useState<RemovalState>({ status: 'idle' })
  const activeRequest = useRef<AbortController | null>(null)
  const activePreparation = useRef<AbortController | null>(null)
  const operationBusy = installState.status === 'preparing'
    || installState.status === 'confirming'
    || installState.status === 'installing'
    || updateState.status === 'checking'
    || updateState.status === 'confirming'
    || updateState.status === 'updating'
    || removalState.status === 'preparing'
    || removalState.status === 'confirming'
    || removalState.status === 'removing'

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
    if (operationBusy) return
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
    if (operationBusy) return
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

  const beginRemoval = async (name: string): Promise<void> => {
    if (operationBusy) return
    setRemovalState({ status: 'preparing', name })
    try {
      const prepared = await prepareSkillRemoval(name)
      setRemovalState({ status: 'confirming', prepared })
    } catch (error) {
      setRemovalState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const finishRemoval = async (prepared: PreparedRemovalDocument): Promise<void> => {
    setRemovalState({ status: 'removing', prepared })
    try {
      const name = await confirmSkillRemoval(prepared.operationId)
      setRemovalState({ status: 'success', name })
      setInventoryVersion(version => version + 1)
    } catch (error) {
      setRemovalState({
        status: 'error',
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  return h(
    'section',
    {
      className: 'dsm-root',
      'aria-labelledby': 'dsh-skill-manager-title',
      'aria-busy': operationBusy,
    },
    h(
      'header',
      { className: 'dsm-header' },
      h('h2', { id: 'dsh-skill-manager-title', tabIndex: -1 }, t('title')),
      h('p', { className: 'dsm-subtitle' }, t('introduction')),
    ),
    h('section', { className: 'dsm-panel', 'aria-labelledby': 'dsm-search-title' },
      h('h2', { id: 'dsm-search-title' }, t('searchLabel')),
    h(
      'form',
      { className: 'dsm-search', onSubmit: submit },
      h('label', { className: 'dsm-field', htmlFor: 'dsh-skill-search' },
        t('searchLabel'),
      h('input', {
        className: 'dsm-input',
        id: 'dsh-skill-search',
        name: 'query',
        type: 'search',
        value: query,
        placeholder: t('searchPlaceholder'),
        onChange: (event: { currentTarget: { value: string } }) => setQuery(event.currentTarget.value),
      })),
      h('button', {
        className: 'dsm-button dsm-button-primary',
        type: 'submit',
        disabled: query.trim().length === 0,
      }, t('searchAction')),
    ),
    state.status === 'loading'
      ? h('p', { className: 'dsm-status', role: 'status', 'aria-live': 'polite' }, t('searching'))
      : null,
    state.status === 'error'
      ? h(
          'div',
          { className: 'dsm-status dsm-error' },
          h('p', { role: 'alert' }, state.message),
          h('button', {
            className: 'dsm-button dsm-button-secondary',
            type: 'button',
            onClick: () => void runSearch(submittedQuery),
          }, t('retry')),
        )
      : null,
    state.status === 'ready' && state.results.length === 0
      ? h('p', { className: 'dsm-empty', role: 'status' }, t('empty'))
      : null,
    state.status === 'ready' && state.results.length > 0
      ? h(
          'ul',
          { className: 'dsm-list', 'aria-label': t('searchLabel') },
          ...state.results.map(skill => h(
            'li',
            { key: skill.id },
            h('article', { className: 'dsm-card' },
              h('h3', null, skill.name),
              h('p', { className: 'dsm-description' }, skill.description ?? t('descriptionUnavailable')),
              h('p', { className: 'dsm-meta' }, skill.source),
              h('p', { className: 'dsm-meta' }, `${formatInstalls(skill.installs)} ${t('installs')}`),
              h('div', { className: 'dsm-actions' },
              h('a', {
                className: 'dsm-link',
                href: skill.pageUrl,
                target: '_blank',
                rel: 'noreferrer',
              }, t('openPage')),
              h('button', {
                className: 'dsm-button dsm-button-primary',
                type: 'button',
                disabled: operationBusy,
                onClick: () => void beginInstall(skill),
              }, t('install')),
              ),
            ),
          )),
        )
      : null,
    ),
    installState.status === 'preparing'
      ? h('p', { className: 'dsm-status', role: 'status', 'aria-live': 'polite' }, t('preparingInstall'))
      : null,
    installState.status === 'confirming'
      ? h(ConfirmDialog, {
          titleId: 'dsh-skill-install-confirmation',
          title: t('confirmInstallTitle'),
          cancelLabel: t('cancel'),
          confirmLabel: installState.prepared.collision === 'managed'
            ? t('confirmOverwrite')
            : t('confirmInstall'),
          onCancel: () => setInstallState({ status: 'idle' }),
          onConfirm: () => void finishInstall(installState.prepared),
        },
          h('strong', null, installState.prepared.name),
          h('p', null, installState.prepared.description),
          h('p', null, installState.prepared.source),
          h('p', null, installState.prepared.collision === 'managed'
            ? t('overwritePrompt')
            : t('installPrompt')),
        )
      : null,
    installState.status === 'installing'
      ? h('p', { className: 'dsm-status', role: 'status', 'aria-live': 'polite' }, t('installing'))
      : null,
    installState.status === 'success'
      ? h('p', { className: 'dsm-status', role: 'status' }, `${t('installed')} ${installState.skill.name}`)
      : null,
    installState.status === 'error'
      ? h('p', { className: 'dsm-status dsm-error', role: 'alert' }, installState.message)
      : null,
    h('section', { className: 'dsm-panel', 'aria-labelledby': 'dsm-installed-title' },
    h('h2', { id: 'dsm-installed-title' }, t('installedTitle')),
    inventoryState.status === 'loading'
      ? h('p', { className: 'dsm-status', role: 'status' }, t('loadingInstalled'))
      : null,
    inventoryState.status === 'error'
      ? h(
          'div',
          { className: 'dsm-status dsm-error' },
          h('p', { role: 'alert' }, inventoryState.message),
          h('button', {
            className: 'dsm-button dsm-button-secondary',
            type: 'button',
            onClick: () => setInventoryVersion(version => version + 1),
          }, t('retry')),
        )
      : null,
    inventoryState.status === 'ready' && inventoryState.skills.length === 0
      ? h('p', { className: 'dsm-empty' }, t('noInstalled'))
      : null,
    inventoryState.status === 'ready' && inventoryState.skills.length > 0
      ? h(
          'ul',
          { className: 'dsm-list', 'aria-label': t('installedTitle') },
          ...inventoryState.skills.map(skill => h(
            'li',
            { key: skill.name },
            h('article', { className: 'dsm-card' },
              h('h3', null, skill.name),
              h('p', { className: 'dsm-description' }, skill.description),
              h('p', { className: 'dsm-meta' }, skill.source),
              h('span', { className: 'dsm-badge', 'data-state': skill.state }, t(skill.state === 'current'
                ? 'stateCurrent'
                : skill.state === 'locally-modified'
                  ? 'stateModified'
                  : skill.state === 'missing'
                    ? 'stateMissing'
                    : 'stateInvalid')),
              h('div', { className: 'dsm-actions' },
              h('a', {
                className: 'dsm-link',
                href: skill.pageUrl,
                target: '_blank',
                rel: 'noreferrer',
              }, t('openPage')),
              h('button', {
                className: 'dsm-button dsm-button-secondary',
                type: 'button',
                disabled: operationBusy,
                onClick: () => void checkUpdate(skill.name),
              }, t('checkUpdate')),
              h('button', {
                className: 'dsm-button dsm-button-danger',
                type: 'button',
                disabled: operationBusy,
                onClick: () => void beginRemoval(skill.name),
              }, t('remove')),
              ),
            ),
          )),
        )
      : null,
    ),
    updateState.status === 'checking'
      ? h('p', { className: 'dsm-status', role: 'status' }, `${t('checkingUpdate')} ${updateState.name}`)
      : null,
    updateState.status === 'result'
      ? h('p', { className: 'dsm-status', role: 'status' },
          updateState.update.status === 'current'
            ? t('upToDate')
            : updateState.update.status === 'source-unavailable'
              ? t('sourceUnavailable')
              : updateState.update.status === 'locally-modified'
                ? t('stateModified')
                : t('localInvalid'))
      : null,
    updateState.status === 'confirming'
      ? h(ConfirmDialog, {
          titleId: 'dsh-skill-update-confirmation',
          title: t('confirmUpdateTitle'),
          cancelLabel: t('cancel'),
          confirmLabel: t('confirmUpdate'),
          onCancel: () => setUpdateState({ status: 'idle' }),
          onConfirm: () => void applyUpdate(updateState.update),
        },
          h('strong', null, updateState.update.name),
          h('p', null, updateState.update.status === 'locally-modified'
            ? t('modifiedUpdatePrompt')
            : updateState.update.status === 'local-invalid'
              ? t('repairUpdatePrompt')
              : t('updatePrompt')),
        )
      : null,
    updateState.status === 'updating'
      ? h('p', { className: 'dsm-status', role: 'status' }, t('updating'))
      : null,
    updateState.status === 'success'
      ? h('p', { className: 'dsm-status', role: 'status' }, `${t('updated')} ${updateState.name}`)
      : null,
    updateState.status === 'error'
      ? h('p', { className: 'dsm-status dsm-error', role: 'alert' }, updateState.message)
      : null,
    removalState.status === 'preparing'
      ? h('p', { className: 'dsm-status', role: 'status' }, `${t('preparingRemoval')} ${removalState.name}`)
      : null,
    removalState.status === 'confirming'
      ? h(ConfirmDialog, {
          titleId: 'dsh-skill-removal-confirmation',
          title: t('confirmRemovalTitle'),
          cancelLabel: t('cancel'),
          confirmLabel: t('confirmRemoval'),
          danger: true,
          onCancel: () => setRemovalState({ status: 'idle' }),
          onConfirm: () => void finishRemoval(removalState.prepared),
        },
          h('strong', null, removalState.prepared.name),
          h('p', null, removalState.prepared.state === 'locally-modified'
            ? t('modifiedRemovePrompt')
            : removalState.prepared.state === 'current'
              ? t('removePrompt')
              : t('invalidRemovePrompt')),
        )
      : null,
    removalState.status === 'removing'
      ? h('p', { className: 'dsm-status', role: 'status' }, t('removing'))
      : null,
    removalState.status === 'success'
      ? h('p', { className: 'dsm-status', role: 'status' }, `${t('removed')} ${removalState.name}`)
      : null,
    removalState.status === 'error'
      ? h('p', { className: 'dsm-status dsm-error', role: 'alert' }, removalState.message)
      : null,
  )
}

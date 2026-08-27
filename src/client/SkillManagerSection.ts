import {
  createElement as h,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
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
  | { readonly status: 'preparing'; readonly catalogId: string }
  | { readonly status: 'confirming'; readonly catalogId: string; readonly prepared: PreparedInstallDocument }
  | { readonly status: 'installing'; readonly catalogId: string; readonly prepared: PreparedInstallDocument }
  | { readonly status: 'success'; readonly catalogId: string; readonly skill: ManagedSkillDocument }
  | { readonly status: 'error'; readonly catalogId: string; readonly message: string }

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
  | { readonly status: 'error'; readonly name: string; readonly message: string }

type RemovalState =
  | { readonly status: 'idle' }
  | { readonly status: 'preparing'; readonly name: string }
  | { readonly status: 'confirming'; readonly prepared: PreparedRemovalDocument }
  | { readonly status: 'removing'; readonly prepared: PreparedRemovalDocument }
  | { readonly status: 'success'; readonly name: string }
  | { readonly status: 'error'; readonly name: string; readonly message: string }

type ActiveTab = 'discover' | 'managed'

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [installState, setInstallState] = useState<InstallState>({ status: 'idle' })
  const [inventoryVersion, setInventoryVersion] = useState(0)
  const [inventoryState, setInventoryState] = useState<InventoryState>({ status: 'loading' })
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [removalState, setRemovalState] = useState<RemovalState>({ status: 'idle' })
  const activeRequest = useRef<AbortController | null>(null)
  const activePreparation = useRef<AbortController | null>(null)
  const discoverTab = useRef<HTMLButtonElement | null>(null)
  const managedTab = useRef<HTMLButtonElement | null>(null)
  const operationBusy = installState.status === 'preparing'
    || installState.status === 'confirming'
    || installState.status === 'installing'
    || updateState.status === 'checking'
    || updateState.status === 'confirming'
    || updateState.status === 'updating'
    || removalState.status === 'preparing'
    || removalState.status === 'confirming'
    || removalState.status === 'removing'

  const selectTab = (tab: ActiveTab): void => {
    setActiveTab(tab)
    const target = tab === 'discover' ? discoverTab : managedTab
    target.current?.focus()
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let next: ActiveTab | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = activeTab === 'discover' ? 'managed' : 'discover'
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = activeTab === 'managed' ? 'discover' : 'managed'
    } else if (event.key === 'Home') {
      next = 'discover'
    } else if (event.key === 'End') {
      next = 'managed'
    }
    if (next === null) return
    event.preventDefault()
    selectTab(next)
  }

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
    setUpdateState({ status: 'idle' })
    setRemovalState({ status: 'idle' })
    activePreparation.current?.abort()
    const controller = new AbortController()
    activePreparation.current = controller
    setInstallState({ status: 'preparing', catalogId: skill.id })
    try {
      const prepared = await prepareInstall(skill.id, controller.signal)
      if (activePreparation.current === controller) {
        setInstallState({ status: 'confirming', catalogId: skill.id, prepared })
      }
    } catch (error) {
      if (controller.signal.aborted || activePreparation.current !== controller) return
      setInstallState({
        status: 'error',
        catalogId: skill.id,
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const finishInstall = async (
    catalogId: string,
    prepared: PreparedInstallDocument,
  ): Promise<void> => {
    setInstallState({ status: 'installing', catalogId, prepared })
    try {
      const skill = await confirmInstall(
        prepared.operationId,
        prepared.collision === 'managed',
      )
      setInstallState({ status: 'success', catalogId, skill })
      setInventoryVersion(version => version + 1)
    } catch (error) {
      setInstallState({
        status: 'error',
        catalogId,
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const checkUpdate = async (name: string): Promise<void> => {
    if (operationBusy) return
    setInstallState({ status: 'idle' })
    setRemovalState({ status: 'idle' })
    setUpdateState({ status: 'checking', name })
    try {
      const update = await checkSkillUpdate(name)
      setUpdateState(update.updateAvailable
        ? { status: 'confirming', update }
        : { status: 'result', update })
    } catch (error) {
      setUpdateState({
        status: 'error',
        name,
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
        name: update.name,
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const beginRemoval = async (name: string): Promise<void> => {
    if (operationBusy) return
    setInstallState({ status: 'idle' })
    setUpdateState({ status: 'idle' })
    setRemovalState({ status: 'preparing', name })
    try {
      const prepared = await prepareSkillRemoval(name)
      setRemovalState({ status: 'confirming', prepared })
    } catch (error) {
      setRemovalState({
        status: 'error',
        name,
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
        name: prepared.name,
        message: error instanceof Error ? error.message : t('genericError'),
      })
    }
  }

  const managedSkills = inventoryState.status === 'ready'
    ? inventoryState.skills
    : []
  const installedCatalogIds = new Set(managedSkills.map(skill => skill.catalogId))
  if (installState.status === 'success') {
    installedCatalogIds.add(installState.catalogId)
  }

  const updateMessage = updateState.status === 'result'
    ? updateState.update.status === 'current'
      ? t('upToDate')
      : updateState.update.status === 'source-unavailable'
        ? t('sourceUnavailable')
        : updateState.update.status === 'locally-modified'
          ? t('stateModified')
          : t('localInvalid')
    : null

  const notice = installState.status === 'preparing'
    ? { kind: 'status' as const, text: t('preparingInstall') }
    : installState.status === 'installing'
      ? { kind: 'status' as const, text: t('installing') }
      : installState.status === 'success'
        ? { kind: 'success' as const, text: `${t('installed')} ${installState.skill.name}`, viewManaged: true }
        : installState.status === 'error'
          ? { kind: 'error' as const, text: installState.message }
          : updateState.status === 'checking'
            ? { kind: 'status' as const, text: `${t('checkingUpdate')} ${updateState.name}` }
            : updateState.status === 'updating'
              ? { kind: 'status' as const, text: t('updating') }
              : updateState.status === 'success'
                ? { kind: 'success' as const, text: `${t('updated')} ${updateState.name}` }
                : updateState.status === 'error'
                  ? { kind: 'error' as const, text: updateState.message }
                  : updateMessage !== null
                    ? { kind: 'status' as const, text: updateMessage }
                    : removalState.status === 'preparing'
                      ? { kind: 'status' as const, text: `${t('preparingRemoval')} ${removalState.name}` }
                      : removalState.status === 'removing'
                        ? { kind: 'status' as const, text: t('removing') }
                        : removalState.status === 'success'
                          ? { kind: 'success' as const, text: `${t('removed')} ${removalState.name}` }
                          : removalState.status === 'error'
                            ? { kind: 'error' as const, text: removalState.message }
                            : null

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
    h(
      'div',
      {
        className: 'dsm-tabs',
        role: 'tablist',
        'aria-label': t('title'),
        onKeyDown: onTabKeyDown,
      },
      h('button', {
        className: 'dsm-tab',
        id: 'dsm-discover-tab',
        type: 'button',
        role: 'tab',
        ref: discoverTab,
        tabIndex: activeTab === 'discover' ? 0 : -1,
        'aria-selected': activeTab === 'discover',
        'aria-controls': 'dsm-discover-panel',
        onClick: () => setActiveTab('discover'),
      }, t('discoverTab')),
      h('button', {
        className: 'dsm-tab',
        id: 'dsm-managed-tab',
        type: 'button',
        role: 'tab',
        ref: managedTab,
        tabIndex: activeTab === 'managed' ? 0 : -1,
        'aria-selected': activeTab === 'managed',
        'aria-controls': 'dsm-managed-panel',
        onClick: () => setActiveTab('managed'),
      }, `${t('managedTab')} (${managedSkills.length})`),
    ),
    notice === null
      ? null
      : h(
          'div',
          {
            className: `dsm-notice dsm-notice-${notice.kind}`,
            role: notice.kind === 'error' ? 'alert' : 'status',
            'aria-live': notice.kind === 'error' ? 'assertive' : 'polite',
          },
          h('span', null, notice.text),
          'viewManaged' in notice && notice.viewManaged
            ? h('button', {
                className: 'dsm-button dsm-button-secondary',
                type: 'button',
                onClick: () => setActiveTab('managed'),
              }, t('viewManaged'))
            : null,
        ),
    activeTab === 'discover'
      ? h(
          'section',
          {
            className: 'dsm-panel',
            id: 'dsm-discover-panel',
            role: 'tabpanel',
            'aria-labelledby': 'dsm-discover-tab',
          },
          h('h2', { id: 'dsm-search-title' }, t('searchLabel')),
          h(
            'form',
            { className: 'dsm-search', onSubmit: submit },
            h(
              'label',
              { className: 'dsm-field', htmlFor: 'dsh-skill-search' },
              t('searchLabel'),
              h('input', {
                className: 'dsm-input',
                id: 'dsh-skill-search',
                name: 'query',
                type: 'search',
                value: query,
                placeholder: t('searchPlaceholder'),
                onChange: (event: { currentTarget: { value: string } }) => {
                  setQuery(event.currentTarget.value)
                },
              }),
            ),
            h('button', {
              className: 'dsm-button dsm-button-primary',
              type: 'submit',
              disabled: query.trim().length === 0,
            }, t('searchAction')),
          ),
          state.status === 'loading'
            ? h('p', {
                className: 'dsm-status',
                role: 'status',
                'aria-live': 'polite',
              }, t('searching'))
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
                ...state.results.map(skill => {
                  const isInstalled = installedCatalogIds.has(skill.id)
                  const isTarget = installState.status !== 'idle'
                    && installState.catalogId === skill.id
                  const buttonLabel = isInstalled
                    ? t('installedBadge')
                    : isTarget && installState.status === 'preparing'
                      ? t('preparingInstall')
                      : isTarget && installState.status === 'installing'
                        ? t('installing')
                        : t('install')

                  return h(
                    'li',
                    { key: skill.id },
                    h(
                      'article',
                      { className: 'dsm-card' },
                      h('h3', null, skill.name),
                      h('p', { className: 'dsm-description' },
                        skill.description ?? t('descriptionUnavailable')),
                      h('p', { className: 'dsm-meta' }, skill.source),
                      h('p', { className: 'dsm-meta' },
                        `${formatInstalls(skill.installs)} ${t('installs')}`),
                      isTarget && installState.status === 'error'
                        ? h('p', {
                            className: 'dsm-card-feedback dsm-error',
                          }, installState.message)
                        : null,
                      isTarget && installState.status === 'success'
                        ? h('p', {
                            className: 'dsm-card-feedback dsm-success',
                          }, t('installed'))
                        : null,
                      h(
                        'div',
                        { className: 'dsm-actions' },
                        h('a', {
                          className: 'dsm-link',
                          href: skill.pageUrl,
                          target: '_blank',
                          rel: 'noreferrer',
                        }, t('openPage')),
                        h('button', {
                          className: 'dsm-button dsm-button-primary',
                          type: 'button',
                          disabled: operationBusy || isInstalled,
                          onClick: () => void beginInstall(skill),
                        }, buttonLabel),
                      ),
                    ),
                  )
                }),
              )
            : null,
        )
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
          onConfirm: () => void finishInstall(
            installState.catalogId,
            installState.prepared,
          ),
        },
          h('strong', null, installState.prepared.name),
          h('p', null, installState.prepared.description),
          h('p', null, installState.prepared.source),
          h('p', null, installState.prepared.collision === 'managed'
            ? t('overwritePrompt')
            : t('installPrompt')),
        )
      : null,
    activeTab === 'managed'
      ? h('section', {
          className: 'dsm-panel',
          id: 'dsm-managed-panel',
          role: 'tabpanel',
          'aria-labelledby': 'dsm-managed-tab',
        },
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
          ...managedSkills.map(skill => {
            const updateTargetsSkill = updateState.status !== 'idle'
              && ('name' in updateState
                ? updateState.name === skill.name
                : updateState.update.name === skill.name)
            const removalTargetsSkill = removalState.status !== 'idle'
              && ('name' in removalState
                ? removalState.name === skill.name
                : removalState.prepared.name === skill.name)
            return h(
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
              updateTargetsSkill && updateState.status === 'result'
                ? h('p', { className: 'dsm-card-feedback' }, updateMessage)
                : null,
              updateTargetsSkill && updateState.status === 'error'
                ? h('p', { className: 'dsm-card-feedback dsm-error' }, updateState.message)
                : null,
              updateTargetsSkill && updateState.status === 'success'
                ? h('p', { className: 'dsm-card-feedback dsm-success' }, t('updated'))
                : null,
              removalTargetsSkill && removalState.status === 'error'
                ? h('p', { className: 'dsm-card-feedback dsm-error' }, removalState.message)
                : null,
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
            )
          }),
        )
      : null,
        )
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
  )
}

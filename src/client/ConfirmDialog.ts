import {
  createElement as h,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export interface ConfirmDialogProps {
  readonly titleId: string
  readonly title: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly danger?: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly children?: ReactNode
}

export function ConfirmDialog({
  titleId,
  title,
  confirmLabel,
  cancelLabel,
  danger = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps): ReactNode {
  const confirmButton = useRef<HTMLButtonElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    confirmButton.current?.focus()
    return () => {
      const previous = previousFocus.current
      const previousDisabled = previous instanceof HTMLButtonElement
        || previous instanceof HTMLInputElement
        || previous instanceof HTMLSelectElement
        || previous instanceof HTMLTextAreaElement
        ? previous.disabled
        : false
      if (previous?.isConnected && !previousDisabled && previous.tabIndex >= 0) {
        previous.focus()
        return
      }
      document.querySelector<HTMLElement>('#dsh-skill-manager-title')?.focus()
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return h(
    'div',
    { className: 'dsm-dialog-backdrop' },
    h(
      'div',
      {
        className: 'dsm-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        onKeyDown,
      },
      h('h3', { id: titleId }, title),
      h('div', { className: 'dsm-dialog-body' }, children),
      h(
        'div',
        { className: 'dsm-dialog-actions' },
        h('button', {
          className: 'dsm-button dsm-button-secondary',
          type: 'button',
          onClick: onCancel,
        }, cancelLabel),
        h('button', {
          className: danger
            ? 'dsm-button dsm-button-danger'
            : 'dsm-button dsm-button-primary',
          type: 'button',
          ref: confirmButton,
          onClick: onConfirm,
        }, confirmLabel),
      ),
    ),
  )
}

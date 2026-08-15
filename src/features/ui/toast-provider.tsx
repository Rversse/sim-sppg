import { useCallback, useMemo, useState, type ReactNode } from 'react'

import {
  ToastContext,
  type ToastContextValue,
  type ToastItem,
  type ToastOptions
} from './toast-context'

const DEFAULT_DURATION = 3200

let nextToastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = nextToastId++
      const toast: ToastItem = {
        ...options,
        variant: options.variant ?? 'info',
        duration: options.duration ?? DEFAULT_DURATION,
        id
      }

      setToasts((current) => [...current, toast])

      if ((toast.duration ?? 0) > 0) {
        window.setTimeout(() => dismiss(id), toast.duration)
      }

      return id
    },
    [dismiss]
  )

  const success = useCallback(
    (title: string, message?: string) =>
      showToast({ title, message, variant: 'success' }),
    [showToast]
  )

  const error = useCallback(
    (title: string, message?: string) =>
      showToast({ title, message, variant: 'error' }),
    [showToast]
  )

  const info = useCallback(
    (title: string, message?: string) =>
      showToast({ title, message, variant: 'info' }),
    [showToast]
  )

  const warning = useCallback(
    (title: string, message?: string) =>
      showToast({ title, message, variant: 'warning' }),
    [showToast]
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      success,
      error,
      info,
      warning,
      dismiss
    }),
    [showToast, success, error, info, warning, dismiss]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="app-toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={`app-toast app-toast-${toast.variant}`}
            role={toast.variant === 'error' ? 'alert' : 'status'}
          >
            <div className="app-toast-indicator" aria-hidden="true">
              {toast.variant === 'success'
                ? '✓'
                : toast.variant === 'error'
                  ? '!'
                  : toast.variant === 'warning'
                    ? '!'
                    : 'i'}
            </div>

            <div className="app-toast-content">
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
            </div>

            <button
              type="button"
              className="app-toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Tutup notifikasi"
            >
              ×
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export type ToastOptions = {
  title: string
  message?: string
  variant?: ToastVariant
  duration?: number
}

export type ToastItem = ToastOptions & {
  id: number
}

export type ToastContextValue = {
  showToast: (options: ToastOptions) => number
  success: (title: string, message?: string) => number
  error: (title: string, message?: string) => number
  info: (title: string, message?: string) => number
  warning: (title: string, message?: string) => number
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used inside ToastProvider')
  }

  return context
}

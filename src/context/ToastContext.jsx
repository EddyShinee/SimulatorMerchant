import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(null)

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((type, message, durationMs = 4000) => {
    const id = ++toastId
    setToasts((prev) => [...prev.slice(-4), { id, type, message }])
    if (durationMs > 0) {
      setTimeout(() => dismiss(id), durationMs)
    }
    return id
  }, [dismiss])

  const toast = useMemo(
    () => ({
      success: (msg) => push('success', msg),
      error: (msg) => push('error', msg, 6000),
      warning: (msg) => push('warning', msg, 5000),
      info: (msg) => push('info', msg),
      dismiss,
      toasts,
    }),
    [push, dismiss, toasts]
  )

  return <ToastContext.Provider value={toast}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

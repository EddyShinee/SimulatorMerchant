import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'

// Full-screen modal shown while a request is in flight, with a live timer.
export default function LoadingOverlay({ show, title }) {
  const { t } = useLanguage()
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!show) {
      setElapsed(0)
      return undefined
    }
    startRef.current = performance.now()
    setElapsed(0)
    const id = setInterval(() => {
      setElapsed((performance.now() - startRef.current) / 1000)
    }, 100)
    return () => clearInterval(id)
  }, [show])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
        <p className="text-sm font-semibold text-slate-800">{title || t('common.waitingResponse')}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-brand-600">{elapsed.toFixed(1)}s</p>
        <p className="mt-1 text-xs text-slate-400">{t('common.pleaseWait')}</p>
      </div>
    </div>
  )
}

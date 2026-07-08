import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { IconCopy } from './icons.jsx'

export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      return true
    } catch {
      return false
    }
  }
}

export default function RequestIdCopyBar({ requestId }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  if (!requestId) return null

  const onCopy = async () => {
    const ok = await copyTextToClipboard(requestId)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30 sm:flex-row sm:items-center">
      <span className="shrink-0 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
        🔖 Request ID
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-slate-900 dark:text-slate-50">
        {requestId}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-100 dark:hover:bg-emerald-800"
      >
        <IconCopy className="h-3.5 w-3.5" />
        {copied ? t('common.copied') : t('createPayout.copyRequestId')}
      </button>
    </div>
  )
}

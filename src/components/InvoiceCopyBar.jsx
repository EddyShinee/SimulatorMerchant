import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { IconCopy } from './icons.jsx'

export default function InvoiceCopyBar({ invoiceNo }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  if (!invoiceNo) return null

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(invoiceNo)
    } catch {
      /* ignore */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/80 sm:flex-row sm:items-center">
      <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">
        🧾 Invoice ID
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-slate-900 dark:text-slate-50">
        {invoiceNo}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      >
        <IconCopy className="h-3.5 w-3.5" />
        {copied ? t('common.copied') : t('paymentToken.copyInvoice')}
      </button>
    </div>
  )
}

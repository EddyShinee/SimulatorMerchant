import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import { IconCopy } from './icons.jsx'

function FlowField({ label, value, truncate }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const display =
    truncate && value.length > truncate ? `${value.slice(0, truncate)}…` : value

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const el = document.createElement('textarea')
      el.value = value
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800/80">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-slate-900 dark:text-slate-50">
          {display}
        </code>
        <button
          type="button"
          onClick={onCopy}
          title={t('common.copy')}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
        >
          <IconCopy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{copied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
    </div>
  )
}

export default function PaymentFlowBar() {
  const { t } = useLanguage()
  const { flow } = usePaymentFlow()
  const { invoiceNo, paymentToken } = flow

  if (!invoiceNo && !paymentToken) return null

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
        <span className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
          {t('paymentFlow.active')}
        </span>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        {invoiceNo && <FlowField label={t('paymentFlow.invoice')} value={invoiceNo} />}
        {paymentToken && (
          <FlowField label={t('paymentFlow.token')} value={paymentToken} truncate={36} />
        )}
      </div>
    </div>
  )
}

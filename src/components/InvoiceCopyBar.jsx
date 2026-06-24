import { useLanguage } from '../context/LanguageContext.jsx'
import CopyButton from './CopyButton.jsx'

export default function InvoiceCopyBar({ invoiceNo }) {
  const { t } = useLanguage()
  if (!invoiceNo) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-brand-400 bg-brand-50 p-3 dark:border-brand-600 dark:bg-brand-950/50 sm:flex-row sm:items-center">
      <span className="shrink-0 text-sm font-semibold text-brand-800 dark:text-brand-200">
        🧾 Invoice ID
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-800 dark:text-slate-100">
        {invoiceNo}
      </code>
      <CopyButton
        text={invoiceNo}
        label={t('paymentToken.copyInvoice')}
        className="shrink-0 border-brand-400 bg-white dark:border-brand-600 dark:bg-slate-800"
      />
    </div>
  )
}

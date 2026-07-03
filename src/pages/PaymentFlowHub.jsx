import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import { WIZARD_STEPS } from '../config/paymentFlowWizard.js'

function StepCard({ step, status, entry, t, lang }) {
  const formatTime = (iso) => {
    if (!iso) return null
    return new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusStyles = {
    done: 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30',
    active: 'border-brand-300 bg-brand-50/80 ring-2 ring-brand-500/20 dark:border-brand-700 dark:bg-brand-950/30',
    pending: 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-600',
  }

  return (
    <Link
      to={step.path}
      className={`block rounded-xl border p-4 transition ${statusStyles[status] || statusStyles.pending}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            status === 'done'
              ? 'bg-emerald-500 text-white'
              : status === 'active'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {status === 'done' ? '✓' : WIZARD_STEPS.indexOf(step) + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-slate-100">{t(step.labelKey)}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t(step.descKey)}</p>
          {entry?.at && (
            <p className="mt-2 text-[11px] text-slate-400">{formatTime(entry.at)}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function PaymentFlowHub() {
  const { t, lang } = useLanguage()
  const { flow } = usePaymentFlow()
  const timeline = flow.flowTimeline || []

  const getStatus = (step) => {
    const entry = timeline.find((e) => e.stepId === step.id)
    if (entry?.status === 'error') return 'error'
    if (entry?.status === 'success' || entry?.status === 'received' || entry?.status === 'viewed') {
      return 'done'
    }
    return 'pending'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('wizard.hubTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('wizard.hubDesc')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {WIZARD_STEPS.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            status={getStatus(step)}
            entry={timeline.find((e) => e.stepId === step.id)}
            t={t}
            lang={lang}
          />
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('wizard.hubHint')}</p>
        <Link to={WIZARD_STEPS[0].path} className="btn-primary mt-3 inline-flex">
          {t('wizard.startFlow')} →
        </Link>
      </div>
    </div>
  )
}

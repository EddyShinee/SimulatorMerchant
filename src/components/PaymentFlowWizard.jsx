import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import {
  WIZARD_STEPS,
  getNextWizardStep,
  getWizardStepIndex,
  isPaymentFlowRoute,
} from '../config/paymentFlowWizard.js'

function StepDot({ status, index }) {
  if (status === 'done') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
        ✓
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-sm">
        {index + 1}
      </span>
    )
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      {index + 1}
    </span>
  )
}

export default function PaymentFlowWizard() {
  const { t, lang } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const { flow, clearTimeline } = usePaymentFlow()
  const [showTimeline, setShowTimeline] = useState(false)

  if (!isPaymentFlowRoute(location.pathname)) return null

  const currentIdx = getWizardStepIndex(location.pathname)
  const nextStep = getNextWizardStep(location.pathname)
  const timeline = flow.flowTimeline || []
  const onHub = currentIdx < 0

  const getStatus = (step, i) => {
    const entry = timeline.find((e) => e.stepId === step.id)
    if (entry?.status === 'error') return 'error'
    if (entry?.status === 'success' || entry?.status === 'received' || entry?.status === 'viewed') {
      return 'done'
    }
    if (i === currentIdx) return 'active'
    return 'pending'
  }

  const formatTime = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/app/payment-flow"
            className="text-sm font-semibold text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
          >
            {t('wizard.title')}
          </Link>
          {!onHub && currentIdx >= 0 && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {t('wizard.stepLabel')} {currentIdx + 1}/{WIZARD_STEPS.length} —{' '}
              {t(WIZARD_STEPS[currentIdx].labelKey)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {nextStep && (
            <button
              type="button"
              onClick={() => navigate(nextStep.path)}
              className="btn-primary !py-1.5 !text-xs"
            >
              {t('wizard.next')} → {t(nextStep.shortKey)}
            </button>
          )}
          {timeline.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTimeline((v) => !v)}
              className="btn-secondary !py-1.5 !text-xs"
            >
              {showTimeline ? t('wizard.hideTimeline') : t('wizard.showTimeline')}
            </button>
          )}
          {timeline.length > 0 && (
            <button
              type="button"
              onClick={clearTimeline}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {t('wizard.clearTimeline')}
            </button>
          )}
        </div>
      </div>

      {/* Steps — vertical on mobile, horizontal scroll on desktop */}
      <div className="p-4">
        <ul className="space-y-2 lg:hidden">
          {WIZARD_STEPS.map((step, i) => {
            const status = getStatus(step, i)
            const isActive = location.pathname === step.path
            return (
              <li key={step.id}>
                <Link
                  to={step.path}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <StepDot status={status} index={i} />
                  <span
                    className={`min-w-0 flex-1 text-sm font-medium ${
                      status === 'active'
                        ? 'text-brand-700 dark:text-brand-300'
                        : status === 'done'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t(step.labelKey)}
                  </span>
                  {status === 'done' && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="hidden lg:block">
          <div className="flex items-center gap-0">
            {WIZARD_STEPS.map((step, i) => {
              const status = getStatus(step, i)
              const isLast = i === WIZARD_STEPS.length - 1
              return (
                <div key={step.id} className="flex min-w-0 flex-1 items-center">
                  <Link
                    to={step.path}
                    className={`group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      status === 'active' ? 'bg-brand-50 dark:bg-brand-950/30' : ''
                    }`}
                  >
                    <StepDot status={status} index={i} />
                    <span
                      className={`max-w-full truncate text-center text-xs font-medium ${
                        status === 'active'
                          ? 'text-brand-700 dark:text-brand-300'
                          : status === 'done'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {t(step.shortKey)}
                    </span>
                  </Link>
                  {!isLast && (
                    <div
                      className={`h-px w-full min-w-[1rem] max-w-[2rem] shrink ${
                        getStatus(WIZARD_STEPS[i + 1], i + 1) !== 'pending' || status === 'done'
                          ? 'bg-emerald-400/70'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showTimeline && timeline.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('wizard.timeline')}
          </p>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {[...timeline].reverse().map((entry, i) => {
              const step = WIZARD_STEPS.find((s) => s.id === entry.stepId)
              return (
                <li
                  key={`${entry.stepId}-${entry.at}-${i}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300"
                >
                  <span className="font-mono text-slate-400">{formatTime(entry.at)}</span>
                  <span className="font-medium">{step ? t(step.labelKey) : entry.stepId}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {entry.status}
                  </span>
                  {entry.invoiceNo && (
                    <span className="truncate font-mono text-slate-500">{entry.invoiceNo}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

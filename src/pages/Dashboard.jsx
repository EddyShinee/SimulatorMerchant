import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getApiOrigin } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import { APP_VERSION } from '../config/appVersion.js'
import { getSuggestedNextStep, WIZARD_STEPS } from '../config/paymentFlowWizard.js'
import { useInboxUnread } from '../hooks/useInboxUnread.js'
import { IconFlow, IconInbox } from '../components/icons.jsx'

function UrlRow({ label, url, hint }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-brand-200">
          {url}
        </code>
        <CopyButton text={url} className="shrink-0" />
      </div>
    </div>
  )
}

function QuickAction({ to, children, variant = 'secondary' }) {
  const cls = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
  return (
    <Link to={to} className={`${cls} !px-3 !py-2 text-xs sm:text-sm`}>
      {children}
    </Link>
  )
}

function methodPill(method) {
  const map = {
    GET: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    POST: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  }
  return map[method] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { t, lang } = useLanguage()
  const { flow } = usePaymentFlow()
  const { unread: inboxUnread } = useInboxUnread(15000)

  const [requests, setRequests] = useState([])
  const [inboxLoading, setInboxLoading] = useState(true)
  const [health, setHealth] = useState({ status: 'loading' })

  const origin = getApiOrigin()
  const urls = useMemo(
    () => ({
      webhook: `${origin}/api/simulator/hook`,
      backendCallback: `${origin}/api/simulator/hook/callback-backend`,
      frontendCallback: `${origin}/api/simulator/callback/frontend`,
      frontendReturn: `${origin}/callback/frontend`,
    }),
    [origin]
  )

  const curlExample = `curl -X POST "${urls.webhook}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"payment.success"}'`

  const nextStep = getSuggestedNextStep(flow)
  const timeline = flow.flowTimeline || []
  const hasSession = !!(flow.invoiceNo || flow.paymentToken)
  const inquiryTo = flow.invoiceNo
    ? `/app/payment-flow/inquiry?invoiceNo=${encodeURIComponent(flow.invoiceNo)}`
    : '/app/payment-flow/inquiry'

  const loadInbox = useCallback(async () => {
    setInboxLoading(true)
    try {
      const { data } = await api.get('/api/simulator/requests')
      setRequests((data.requests || []).slice(0, 5))
    } catch {
      setRequests([])
    } finally {
      setInboxLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/health')
      .then(() => {
        if (!cancelled) setHealth({ status: 'ok' })
      })
      .catch(() => {
        if (!cancelled) setHealth({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const formatTime = (iso) =>
    new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('dashboard.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono">v{APP_VERSION}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
              health.status === 'ok'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : health.status === 'error'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                health.status === 'ok'
                  ? 'bg-emerald-500'
                  : health.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-slate-400'
              }`}
            />
            {health.status === 'ok'
              ? t('dashboard.apiOnline')
              : health.status === 'error'
                ? t('dashboard.apiOffline')
                : t('common.loading')}
          </span>
        </div>
      </div>

      {/* Welcome + Payment Flow continue */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-5 text-white shadow-sm lg:col-span-2">
          <p className="text-sm text-brand-100">{t('dashboard.welcomeBack')}</p>
          <p className="mt-0.5 truncate text-lg font-bold">{user?.email}</p>
          {!hasSession && (
            <p className="mt-3 text-sm text-brand-100">{t('dashboard.noSession')}</p>
          )}
        </div>

        <div className="card p-5 lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                <IconFlow className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  {t('dashboard.flowTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dashboard.flowDesc')}</p>
              </div>
            </div>
            <Link to="/app/payment-flow" className="btn-secondary !py-1.5 !text-xs">
              {t('dashboard.flowHub')}
            </Link>
          </div>

          {hasSession && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {flow.invoiceNo && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/80">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Invoice</p>
                  <p className="truncate font-mono text-sm text-slate-900 dark:text-slate-100">
                    {flow.invoiceNo}
                  </p>
                </div>
              )}
              {flow.paymentToken && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/80">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Payment Token
                  </p>
                  <p className="truncate font-mono text-sm text-slate-900 dark:text-slate-100">
                    {flow.paymentToken.slice(0, 28)}…
                  </p>
                </div>
              )}
            </div>
          )}

          {nextStep ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('dashboard.nextStep')}:{' '}
                <span className="font-semibold">{t(nextStep.labelKey)}</span>
              </p>
              <Link to={nextStep.path} className="btn-primary !py-1.5 !text-xs">
                {t('dashboard.continueFlow')} →
              </Link>
            </div>
          ) : timeline.length > 0 ? (
            <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{t('dashboard.flowComplete')}</p>
          ) : (
            <Link to="/app/payment-flow/token" className="btn-primary mt-4 inline-flex !py-1.5 !text-xs">
              {t('wizard.startFlow')} →
            </Link>
          )}

          {timeline.length > 0 && (
            <ul className="mt-4 max-h-28 space-y-1 overflow-y-auto border-t border-slate-100 pt-3 dark:border-slate-800">
              {[...timeline].reverse().slice(0, 4).map((entry) => {
                const step = WIZARD_STEPS.find((s) => s.id === entry.stepId)
                return (
                  <li
                    key={`${entry.stepId}-${entry.at}`}
                    className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span className="font-mono">{formatTime(entry.at)}</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {step ? t(step.labelKey) : entry.stepId}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">{entry.status}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Quick actions + Inbox snapshot */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.quickActions')}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('dashboard.quickActionsDesc')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <QuickAction to="/app/payment-flow" variant="primary">
              <IconFlow className="mr-1 inline h-4 w-4" />
              {t('nav.paymentFlow')}
            </QuickAction>
            <QuickAction to="/app/payment-flow/token">{t('apis.paymentToken')}</QuickAction>
            <QuickAction to="/app/payment-flow/pay">{t('apis.doPayment')}</QuickAction>
            <QuickAction to={inquiryTo}>{t('apis.paymentInquiry')}</QuickAction>
            <QuickAction to="/app/api/analysis">{t('apis.analysis')}</QuickAction>
            <QuickAction to="/app/pos-standalone">{t('nav.posStandalone')}</QuickAction>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <IconInbox className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.inboxTitle')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inboxUnread > 0
                    ? inboxUnread === 1
                      ? t('dashboard.inboxUnreadOne')
                      : t('dashboard.inboxUnreadMany').replace('{count}', String(inboxUnread))
                    : t('dashboard.inboxDesc')}
                </p>
              </div>
            </div>
            {inboxUnread > 0 && (
              <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
                {inboxUnread > 99 ? '99+' : inboxUnread}
              </span>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {inboxLoading ? (
              <p className="text-sm text-slate-400">{t('common.loading')}</p>
            ) : requests.length === 0 ? (
              <p className="text-sm text-slate-400">{t('dashboard.inboxEmpty')}</p>
            ) : (
              requests.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${methodPill(r.method)}`}>
                    {r.method}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.path}
                  </span>
                  <span className="hidden shrink-0 text-[10px] text-slate-400 sm:block">
                    {formatTime(r.receivedAt)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/app/inbox" className="btn-primary !py-1.5 !text-xs">
              {t('dashboard.openInbox')} →
            </Link>
            <button type="button" onClick={loadInbox} className="btn-secondary !py-1.5 !text-xs">
              {t('inbox.refresh')}
            </button>
          </div>
        </div>
      </div>

      {/* Webhook & callback URLs */}
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('dashboard.urlsTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('dashboard.urlsDesc')}</p>
        </div>

        <UrlRow label={t('dashboard.urlWebhook')} url={urls.webhook} hint={t('dashboard.urlWebhookHint')} />
        <UrlRow
          label={t('dashboard.urlBackendCallback')}
          url={urls.backendCallback}
          hint={t('dashboard.urlBackendHint')}
        />
        <UrlRow
          label={t('dashboard.urlFrontendCallback')}
          url={urls.frontendCallback}
          hint={t('dashboard.urlFrontendApiHint')}
        />
        <UrlRow
          label={t('dashboard.urlFrontendReturn')}
          url={urls.frontendReturn}
          hint={t('dashboard.urlFrontendReturnHint')}
        />

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('inbox.tryItTitle')}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <pre className="flex-1 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {curlExample}
            </pre>
            <CopyButton text={curlExample} />
          </div>
        </div>
      </div>
    </div>
  )
}

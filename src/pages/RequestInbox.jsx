import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api, { getApiOrigin } from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import { isPaymentFlowRoute } from '../config/paymentFlowWizard.js'
import {
  analyzeInboxRequest,
  matchesInboxPathFilter,
} from '../utils/inboxBody.js'

function methodBadge(method) {
  const map = {
    GET: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }
  return map[method] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function Section({ title, data }) {
  if (data == null || (typeof data === 'object' && Object.keys(data).length === 0)) return null
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function JwtBlock({ title, jwtToken, decodedText, copyLabel, t }) {
  if (!jwtToken || !decodedText) return null
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          {title}
        </p>
        <CopyButton text={decodedText} label={copyLabel} />
      </div>
      <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-emerald-100">
        {decodedText}
      </pre>
    </div>
  )
}

function BodySection({ body, t }) {
  if (body == null || (typeof body === 'object' && Object.keys(body).length === 0)) return null

  const { rawText, jwtToken, decodedText } = analyzeInboxRequest({ body })

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('inbox.bodyRaw')}
          </p>
          <CopyButton text={rawText} label={t('inbox.copyBody')} />
        </div>
        <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {rawText}
        </pre>
      </div>
      <JwtBlock
        title={t('inbox.bodyDecoded')}
        jwtToken={jwtToken}
        decodedText={decodedText}
        copyLabel={t('inbox.copyDecoded')}
        t={t}
      />
    </div>
  )
}

function HeadersSection({ headers, t }) {
  if (headers == null || (typeof headers === 'object' && Object.keys(headers).length === 0)) return null

  const { headerJwt, headerDecodedText } = analyzeInboxRequest({ headers })

  return (
    <div className="space-y-4">
      <Section title={t('inbox.headers')} data={headers} />
      <JwtBlock
        title={t('inbox.headerDecoded')}
        jwtToken={headerJwt}
        decodedText={headerDecodedText}
        copyLabel={t('inbox.copyDecoded')}
        t={t}
      />
    </div>
  )
}

function RequestCard({ request, lang, t }) {
  const analysis = useMemo(() => analyzeInboxRequest(request), [request])

  const inquiryUrl = analysis.invoiceNo
    ? `/app/payment-flow/inquiry?invoiceNo=${encodeURIComponent(analysis.invoiceNo)}`
    : null

  return (
    <details className="card overflow-hidden" open={false}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${methodBadge(request.method)}`}>
          {request.method}
        </span>
        {analysis.hasJwt && (
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            JWT
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700 dark:text-slate-200">
          {request.path}
        </span>
        {analysis.invoiceNo && (
          <span className="hidden truncate font-mono text-xs text-brand-600 dark:text-brand-400 md:block">
            {analysis.invoiceNo}
          </span>
        )}
        <span className="hidden text-xs text-slate-400 sm:block">
          {new Date(request.receivedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
        {(inquiryUrl || analysis.invoiceNo) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-800 dark:bg-brand-950/30">
            {analysis.invoiceNo && (
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Invoice: <code className="font-mono font-semibold">{analysis.invoiceNo}</code>
              </span>
            )}
            {inquiryUrl && (
              <Link to={inquiryUrl} className="btn-primary !py-1.5 !text-xs">
                {t('inbox.inquiryWithInvoice')}
              </Link>
            )}
          </div>
        )}
        <Section title={t('inbox.query')} data={request.query} />
        <BodySection body={request.body} t={t} />
        <HeadersSection headers={request.headers} t={t} />
      </div>
    </details>
  )
}

export default function RequestInbox() {
  const { t, lang } = useLanguage()
  const location = useLocation()
  const embedded = isPaymentFlowRoute(location.pathname)
  const { recordStep } = usePaymentFlow()
  const [requests, setRequests] = useState([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const [pathFilter, setPathFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [jwtFilter, setJwtFilter] = useState('all')
  const webhookUrl = `${getApiOrigin()}/api/simulator/hook`
  const intervalRef = useRef(null)
  const recordedCallbackRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/simulator/requests')
      setRequests(data.requests || [])
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false)
    }
  }, [])

  const clearAll = async () => {
    await api.delete('/api/simulator/requests')
    setRequests([])
    recordedCallbackRef.current = false
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 3000)
    }
    return () => clearInterval(intervalRef.current)
  }, [autoRefresh, load])

  useEffect(() => {
    const callbackReq = requests.find(
      (r) => r.path?.includes('callback') || r.path?.includes('hook')
    )
    if (callbackReq && !recordedCallbackRef.current) {
      recordedCallbackRef.current = true
      const analysis = analyzeInboxRequest(callbackReq)
      recordStep('inbox', 'received', {
        path: callbackReq.path,
        invoiceNo: analysis.invoiceNo || undefined,
      })
    }
  }, [requests, recordStep])

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (methodFilter !== 'all' && r.method !== methodFilter) return false
      if (!matchesInboxPathFilter(r.path, pathFilter)) return false
      if (jwtFilter !== 'all') {
        const { hasJwt } = analyzeInboxRequest(r)
        if (jwtFilter === 'jwt' && !hasJwt) return false
        if (jwtFilter === 'no-jwt' && hasJwt) return false
      }
      return true
    })
  }, [requests, pathFilter, methodFilter, jwtFilter])

  const curlExample = `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"payment.success","amount":1000}'`

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('inbox.title')}</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{t('inbox.subtitle')}</p>
        </div>
      )}

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('inbox.yourUrl')}
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3.5 py-2.5 font-mono text-sm text-brand-200">
            {webhookUrl}
          </code>
          <CopyButton text={webhookUrl} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('inbox.tryItTitle')}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t('inbox.tryItDesc')}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <pre className="flex-1 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {curlExample}
            </pre>
            <CopyButton text={curlExample} />
          </div>
        </div>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <div>
          <label className="label !mb-1">{t('inbox.filterPath')}</label>
          <select className="input !w-auto !py-2" value={pathFilter} onChange={(e) => setPathFilter(e.target.value)}>
            <option value="all">{t('inbox.filterAll')}</option>
            <option value="callback">{t('inbox.filterCallback')}</option>
            <option value="pos">{t('inbox.filterPos')}</option>
            <option value="hook">{t('inbox.filterHook')}</option>
          </select>
        </div>
        <div>
          <label className="label !mb-1">{t('inbox.filterMethod')}</label>
          <select className="input !w-auto !py-2" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="all">{t('inbox.filterAll')}</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
        <div>
          <label className="label !mb-1">{t('inbox.filterJwt')}</label>
          <select className="input !w-auto !py-2" value={jwtFilter} onChange={(e) => setJwtFilter(e.target.value)}>
            <option value="all">{t('inbox.filterAll')}</option>
            <option value="jwt">{t('inbox.filterHasJwt')}</option>
            <option value="no-jwt">{t('inbox.filterNoJwt')}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={load} className="btn-secondary" disabled={loading}>
          {loading ? t('common.loading') : t('inbox.refresh')}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          {t('inbox.autoRefresh')}
        </label>
        <span className="text-sm text-slate-400">
          ({filtered.length}/{requests.length})
        </span>
        <button onClick={clearAll} className="btn-danger ml-auto" disabled={!requests.length}>
          {t('inbox.clearAll')}
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-slate-400">{t('inbox.empty')}</p>
          <button type="button" onClick={load} className="btn-secondary mt-4">
            {t('inbox.refresh')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">{t('inbox.noFilterMatch')}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <RequestCard key={r.id} request={r} lang={lang} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

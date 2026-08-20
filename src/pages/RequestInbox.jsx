import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api, { getInboxUrls } from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import { isPaymentFlowRoute } from '../config/paymentFlowWizard.js'
import {
  analyzeInboxRequest,
} from '../utils/inboxBody.js'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

function sameRequestPage(a, b) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every(
    (row, i) =>
      row.id === b[i].id &&
      row.receivedAt === b[i].receivedAt &&
      row.invoiceNo === b[i].invoiceNo &&
      row.method === b[i].method &&
      row.path === b[i].path
  )
}

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

function formatReceivedAt(iso, lang) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return String(iso)
  return d.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
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
  const invoiceNo = request.invoiceNo || analysis.invoiceNo

  const inquiryUrl = invoiceNo
    ? `/app/payment-flow/inquiry?invoiceNo=${encodeURIComponent(invoiceNo)}`
    : null

  return (
    <details className="card overflow-hidden" open={false}>
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${methodBadge(request.method)}`}>
            {request.method}
          </span>
          {analysis.hasJwt && (
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              JWT
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 sm:text-sm dark:text-slate-200">
            {request.path}
          </span>
        </div>
        <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {invoiceNo && (
            <span
              className="max-w-[12rem] truncate font-mono text-xs text-brand-600 dark:text-brand-400"
              title={invoiceNo}
            >
              {invoiceNo}
            </span>
          )}
          <time
            className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400"
            dateTime={request.receivedAt}
            title={request.receivedAt}
          >
            {formatReceivedAt(request.receivedAt, lang)}
          </time>
        </div>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {t('inbox.receivedAt')}:{' '}
            <time className="font-mono font-medium text-slate-700 dark:text-slate-200" dateTime={request.receivedAt}>
              {formatReceivedAt(request.receivedAt, lang)}
            </time>
          </span>
          {request.ip && (
            <span>
              IP: <code className="font-mono">{request.ip}</code>
            </span>
          )}
        </div>
        {(inquiryUrl || invoiceNo) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-800 dark:bg-brand-950/30">
            {invoiceNo && (
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Invoice: <code className="font-mono font-semibold">{invoiceNo}</code>
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
  const { user } = useAuth()
  const location = useLocation()
  const embedded = isPaymentFlowRoute(location.pathname)
  const { recordStep } = usePaymentFlow()
  const [requests, setRequests] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [pathFilter, setPathFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [jwtFilter, setJwtFilter] = useState('all')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const webhookUrl = getInboxUrls(user?.id).webhook
  const intervalRef = useRef(null)
  const recordedCallbackRef = useRef(false)
  const searchDebounceRef = useRef(null)
  const loadSeqRef = useRef(0)
  const hasLoadedRef = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    const seq = ++loadSeqRef.current
    if (silent && hasLoadedRef.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const { data } = await api.get('/api/simulator/requests', {
        params: {
          page,
          pageSize,
          invoiceNo: invoiceSearch || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          method: methodFilter !== 'all' ? methodFilter : undefined,
          pathFilter: pathFilter !== 'all' ? pathFilter : undefined,
        },
      })
      if (seq !== loadSeqRef.current) return
      const next = data.requests || []
      setRequests((prev) => (sameRequestPage(prev, next) ? prev : next))
      setTotal(Number(data.total) || 0)
      setTotalPages(Number(data.totalPages) || 1)
      hasLoadedRef.current = true
      setHasLoaded(true)
    } catch {
      /* keep previous rows on transient errors — avoids empty flicker */
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [page, pageSize, invoiceSearch, fromDate, toDate, methodFilter, pathFilter])

  const clearAll = async () => {
    if (!window.confirm(t('inbox.confirmClear'))) return
    await api.delete('/api/simulator/requests')
    setRequests([])
    setTotal(0)
    setTotalPages(1)
    setPage(1)
    recordedCallbackRef.current = false
  }

  useEffect(() => {
    void load({ silent: false })
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return undefined
    intervalRef.current = setInterval(() => {
      void load({ silent: true })
    }, 5000)
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
        invoiceNo: callbackReq.invoiceNo || analysis.invoiceNo || undefined,
      })
    }
  }, [requests, recordStep])

  // JWT filter is client-side on current page (payload is already JWT-decoded in card)
  const filtered = useMemo(() => {
    if (jwtFilter === 'all') return requests
    return requests.filter((r) => {
      const { hasJwt } = analyzeInboxRequest(r)
      if (jwtFilter === 'jwt') return hasJwt
      if (jwtFilter === 'no-jwt') return !hasJwt
      return true
    })
  }, [requests, jwtFilter])

  const applyInvoiceSearch = () => {
    setPage(1)
    setInvoiceSearch(invoiceQuery.trim())
  }

  const onInvoiceInput = (value) => {
    setInvoiceQuery(value)
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setPage(1)
      setInvoiceSearch(value.trim())
    }, 400)
  }

  const curlExample = `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"payment.success","amount":1000,"invoiceNo":"INV123"}'`

  const rangeLabel =
    total === 0
      ? t('inbox.pageEmpty')
      : t('inbox.pageRange')
          .replace('{from}', String((page - 1) * pageSize + 1))
          .replace('{to}', String(Math.min(page * pageSize, total)))
          .replace('{total}', String(total))

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      {!embedded && (
        <div>
          <h1 className="page-title">{t('inbox.title')}</h1>
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
        <p className="mt-2 text-[11px] text-slate-400">{t('inbox.persistedHint')}</p>

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

      <div className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label !mb-1">{t('inbox.searchInvoice')}</label>
            <div className="flex gap-2">
              <input
                className="input font-mono text-sm"
                value={invoiceQuery}
                onChange={(e) => onInvoiceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyInvoiceSearch()}
                placeholder={t('inbox.searchInvoicePlaceholder')}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={applyInvoiceSearch}>
                {t('inbox.search')}
              </button>
            </div>
          </div>
          <div>
            <label className="label !mb-1">{t('inbox.fromDate')}</label>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => {
                setPage(1)
                setFromDate(e.target.value)
              }}
            />
          </div>
          <div>
            <label className="label !mb-1">{t('inbox.toDate')}</label>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => {
                setPage(1)
                setToDate(e.target.value)
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="label !mb-1">{t('inbox.filterPath')}</label>
            <select
              className="input !w-auto !py-2"
              value={pathFilter}
              onChange={(e) => {
                setPage(1)
                setPathFilter(e.target.value)
              }}
            >
              <option value="all">{t('inbox.filterAll')}</option>
              <option value="callback">{t('inbox.filterCallback')}</option>
              <option value="pos">{t('inbox.filterPos')}</option>
              <option value="hook">{t('inbox.filterHook')}</option>
            </select>
          </div>
          <div>
            <label className="label !mb-1">{t('inbox.filterMethod')}</label>
            <select
              className="input !w-auto !py-2"
              value={methodFilter}
              onChange={(e) => {
                setPage(1)
                setMethodFilter(e.target.value)
              }}
            >
              <option value="all">{t('inbox.filterAll')}</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </select>
          </div>
          <div>
            <label className="label !mb-1">{t('inbox.filterJwt')}</label>
            <select
              className="input !w-auto !py-2"
              value={jwtFilter}
              onChange={(e) => setJwtFilter(e.target.value)}
            >
              <option value="all">{t('inbox.filterAll')}</option>
              <option value="jwt">{t('inbox.filterHasJwt')}</option>
              <option value="no-jwt">{t('inbox.filterNoJwt')}</option>
            </select>
          </div>
          <div>
            <label className="label !mb-1">{t('inbox.pageSize')}</label>
            <select
              className="input !w-auto !py-2"
              value={pageSize}
              onChange={(e) => {
                setPage(1)
                setPageSize(Number(e.target.value))
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load({ silent: false })}
          className="btn-secondary"
          disabled={loading}
        >
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
          {refreshing && (
            <span className="text-xs text-slate-400" aria-hidden>
              …
            </span>
          )}
        </label>
        <span className="text-sm text-slate-500 dark:text-slate-400">{rangeLabel}</span>
        <button onClick={clearAll} className="btn-danger ml-auto" disabled={!total || loading}>
          {t('inbox.clearAll')}
        </button>
      </div>

      {loading && !hasLoaded ? (
        <div className="card py-12 text-center text-sm text-slate-400">{t('common.loading')}</div>
      ) : total === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-slate-400">{t('inbox.empty')}</p>
          <button
            type="button"
            onClick={() => void load({ silent: false })}
            className="btn-secondary mt-4"
          >
            {t('inbox.refresh')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">{t('inbox.noFilterMatch')}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <RequestCard key={r.id || `${r.receivedAt}-${r.path}`} request={r} lang={lang} t={t} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="btn-secondary !px-3 !py-1.5 text-xs"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('inbox.prevPage')}
          </button>
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
            {t('inbox.pageOf').replace('{page}', String(page)).replace('{pages}', String(totalPages))}
          </span>
          <button
            type="button"
            className="btn-secondary !px-3 !py-1.5 text-xs"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('inbox.nextPage')}
          </button>
        </div>
      )}
    </div>
  )
}

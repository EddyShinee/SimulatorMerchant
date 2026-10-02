import { useLanguage } from '../context/LanguageContext.jsx'
import { extractRespInfo } from '../utils/exchangeMeta.js'
import { paymentResponseStatus } from '../utils/paymentResponse.js'

function formatStamp(value, lang) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const locale = lang === 'vi' ? 'vi-VN' : 'en-GB'
  const datePart = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${datePart}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function toneFor(status, resp) {
  const http = Number(status)
  const code = String(resp?.respCode || '')
  const kind = code ? paymentResponseStatus({ respCode: code }) : null
  if (code === '00' || kind === 'success' || kind === 'completed') return 'ok'
  if (kind === 'pending') return 'warn'
  if (kind === 'failed') return 'bad'
  if (Number.isFinite(http) && http >= 200 && http < 300) return 'ok'
  if (Number.isFinite(http) && http >= 400) return 'bad'
  if (Number.isFinite(http) && http >= 300) return 'warn'
  return 'muted'
}

const TONE = {
  ok: {
    card: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30',
    value: 'text-emerald-800 dark:text-emerald-200',
    chip: 'bg-emerald-600 text-white',
  },
  warn: {
    card: 'border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30',
    value: 'text-amber-900 dark:text-amber-200',
    chip: 'bg-amber-500 text-white',
  },
  bad: {
    card: 'border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30',
    value: 'text-red-800 dark:text-red-200',
    chip: 'bg-red-600 text-white',
  },
  muted: {
    card: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
    value: 'text-slate-800 dark:text-slate-100',
    chip: 'bg-slate-700 text-white',
  },
}

function Cell({ label, children, emphasize = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p
        className={`mt-0.5 break-all text-sm ${
          emphasize ? 'font-bold' : 'font-semibold text-slate-800 dark:text-slate-100'
        }`}
      >
        {children}
      </p>
    </div>
  )
}

/**
 * One glance summary for an outbound API call: method, timestamps, latency, HTTP status, respCode.
 */
export default function ExchangeSummary({ result, method = 'POST' }) {
  const { t, lang } = useLanguage()
  if (!result) return null

  const http = result.status
  const resp = extractRespInfo(result)
  let toneKey = toneFor(http, resp)
  if (toneKey === 'muted' && result.error) toneKey = 'bad'
  const tone = TONE[toneKey]
  const requested = formatStamp(result.requestedAt, lang)
  const responded = formatStamp(result.respondedAt, lang)
  const duration = result.clientDurationMs ?? result.durationMs
  const httpLabel =
    http != null && http !== ''
      ? `${http}${result.statusText ? ` ${result.statusText}` : ''}`
      : t('exchange.none')
  const codeLabel = resp?.respCode
    ? resp.respDesc
      ? `${resp.respCode} — ${resp.respDesc}`
      : resp.respCode
    : t('exchange.none')

  return (
    <section className={`rounded-xl border p-3 sm:p-4 ${tone.card}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold tracking-wide ${tone.chip}`}>
          {result.method || method || t('exchange.none')}
        </span>
        <span className={`text-sm font-bold ${tone.value}`}>HTTP {httpLabel}</span>
        {resp?.respCode && (
          <span className={`text-sm font-bold ${tone.value}`}>respCode {resp.respCode}</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Cell label={t('exchange.method')}>{result.method || method || t('exchange.none')}</Cell>
        <Cell label={t('exchange.httpStatus')} emphasize>
          <span className={tone.value}>{httpLabel}</span>
        </Cell>
        <Cell label={t('exchange.respCode')} emphasize>
          <span className={tone.value}>{codeLabel}</span>
        </Cell>
        <Cell label={t('exchange.requestedAt')}>{requested || t('exchange.none')}</Cell>
        <Cell label={t('exchange.respondedAt')}>{responded || t('exchange.none')}</Cell>
        <Cell label={t('exchange.duration')} emphasize>
          {duration != null ? `${duration} ms` : t('exchange.none')}
        </Cell>
      </div>
      {result.error && (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{result.error}</p>
      )}
    </section>
  )
}

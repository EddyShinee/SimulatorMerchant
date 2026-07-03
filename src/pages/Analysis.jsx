import { useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import PasteButton from '../components/PasteButton.jsx'
import AnalysisDashboard from '../components/AnalysisDashboard.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import { ANALYSIS_API_SELECT } from '../config/analysisConfig.js'
import { enrichTransactionRows, parseHtmlTable } from '../utils/transactionAnalysis.js'

export default function Analysis() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [apiKey, setApiKey] = useState(ANALYSIS_API_SELECT[0].label)
  const [sessionId, setSessionId] = useState(flow.analysisSessionId || '')
  const [fullCookie, setFullCookie] = useState(flow.analysisFullCookie || '')
  const [customUrl, setCustomUrl] = useState('')

  const [error, setError] = useState('')
  const [rawHtml, setRawHtml] = useState('')
  const [meta, setMeta] = useState(null)
  const [rows, setRows] = useState(null)
  const [parseError, setParseError] = useState('')

  const apiUrl =
    apiKey === 'Custom'
      ? customUrl
      : ANALYSIS_API_SELECT.find((o) => o.label === apiKey)?.url || ANALYSIS_API_SELECT[0].url

  const handleSend = async () => {
    setError('')
    setParseError('')
    setRows(null)
    setRawHtml('')
    setMeta(null)

    if (!sessionId.trim() && !fullCookie.trim()) {
      setError(t('analysis.sessionRequired'))
      toast.warning(t('analysis.sessionRequired'))
      return
    }
    if (!apiUrl.trim()) {
      setError(t('analysis.urlRequired'))
      toast.warning(t('analysis.urlRequired'))
      return
    }

    updateFlow({
      analysisSessionId: sessionId.trim(),
      analysisFullCookie: fullCookie.trim(),
    })

    const signal = start()
    try {
      const { data } = await api.post(
        '/api/simulator/transaction-analysis',
        {
          url: apiUrl.trim(),
          sessionId: sessionId.trim() || undefined,
          cookie: fullCookie.trim() || undefined,
        },
        { signal }
      )

      setMeta({
        status: data.status,
        durationMs: data.durationMs,
        finalUrl: data.finalUrl,
      })
      setRawHtml(typeof data.body === 'string' ? data.body : '')

      if (!data.ok && data.status !== 200) {
        const msg = data.message || `HTTP ${data.status}`
        setError(msg)
        toast.error(msg)
        return
      }

      const html = typeof data.body === 'string' ? data.body : ''

      if (data.redirectedToLogin) {
        setParseError(t('analysis.loginPage'))
        toast.warning(t('analysis.loginPage'))
        return
      }

      const parsed = parseHtmlTable(html)
      if (parsed.error) {
        const key = `analysis.errors.${parsed.error}`
        const msg = t(key) !== key ? t(key) : parsed.error
        setParseError(msg)
        toast.warning(msg)
        return
      }

      const { rows: enriched, datetimeCol } = enrichTransactionRows(parsed.rows, parsed.headers)
      if (!datetimeCol) {
        const msg = `${t('analysis.noDateTimeCol')} ${parsed.headers.join(', ')}`
        setParseError(msg)
        toast.warning(msg)
        return
      }
      if (!enriched.length) {
        setParseError(t('analysis.noValidDates'))
        toast.warning(t('analysis.noValidDates'))
        return
      }

      setRows(enriched)
      toast.success(t('common.requestSuccess'))
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
    } finally {
      stop()
    }
  }

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">GET</span>
        <h1 className="text-2xl font-bold text-slate-900">📊 {t('analysis.title')}</h1>
      </div>

      <div className="card space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="label">{t('analysis.selection')}</label>
            <select
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            >
              {ANALYSIS_API_SELECT.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label}
                </option>
              ))}
              <option value="Custom">{t('analysis.custom')}</option>
            </select>
            {apiKey === 'Custom' ? (
              <input
                className="input mt-2 font-mono text-xs"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
              />
            ) : (
              <p className="mt-1 break-all font-mono text-xs text-slate-400">{apiUrl}</p>
            )}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0">🔑 {t('analysis.sessionId')}</label>
              <PasteButton onPaste={(text) => text && setSessionId(text)} />
            </div>
            <input
              className="input font-mono text-xs"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="ASP.NET_SessionId"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-400">{t('analysis.sessionHint')}</p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="label mb-0">{t('analysis.fullCookie')}</label>
            <PasteButton onPaste={(text) => text && setFullCookie(text)} />
          </div>
          <textarea
            className="input min-h-[72px] font-mono text-xs"
            value={fullCookie}
            onChange={(e) => setFullCookie(e.target.value)}
            placeholder="ASP.NET_SessionId=...; .ASPXAUTH=..."
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-slate-400">{t('analysis.fullCookieHint')}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
            ⚠️ {error}
          </div>
        )}

        <button onClick={handleSend} className="btn-primary w-full sm:w-auto" disabled={loading}>
          {loading ? t('analysis.sending') : `🚀 ${t('analysis.send')}`}
        </button>
      </div>

      {parseError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          ⚠️ {parseError}
        </div>
      )}

      {rows && meta && <AnalysisDashboard rows={rows} meta={meta} />}

      {rawHtml && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
            📄 {t('analysis.rawResponse')}
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {rawHtml.length > 8000 ? `${rawHtml.slice(0, 8000)}\n...` : rawHtml}
          </pre>
        </details>
      )}
    </div>
  )
}

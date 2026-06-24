import { useCallback, useEffect, useRef, useState } from 'react'
import api, { getApiOrigin } from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import CopyButton from '../components/CopyButton.jsx'

function methodBadge(method) {
  const map = {
    GET: 'bg-green-100 text-green-700',
    POST: 'bg-blue-100 text-blue-700',
    PUT: 'bg-amber-100 text-amber-700',
    PATCH: 'bg-purple-100 text-purple-700',
    DELETE: 'bg-red-100 text-red-700',
  }
  return map[method] || 'bg-slate-100 text-slate-700'
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

export default function RequestInbox() {
  const { t, lang } = useLanguage()
  const [requests, setRequests] = useState([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const webhookUrl = `${getApiOrigin()}/api/simulator/hook`
  const intervalRef = useRef(null)

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

  const curlExample = `curl -X POST "${webhookUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"payment.success","amount":1000}'`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('inbox.title')}</h1>
        <p className="mt-1 text-slate-500">{t('inbox.subtitle')}</p>
      </div>

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

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-700">{t('inbox.tryItTitle')}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t('inbox.tryItDesc')}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <pre className="flex-1 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {curlExample}
            </pre>
            <CopyButton text={curlExample} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={load} className="btn-secondary" disabled={loading}>
          {loading ? t('common.loading') : t('inbox.refresh')}
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          {t('inbox.autoRefresh')}
        </label>
        <span className="text-sm text-slate-400">({requests.length})</span>
        <button onClick={clearAll} className="btn-danger ml-auto" disabled={!requests.length}>
          {t('inbox.clearAll')}
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-slate-400">{t('inbox.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <details key={r.id} className="card overflow-hidden" open={false}>
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${methodBadge(r.method)}`}
                >
                  {r.method}
                </span>
                <span className="flex-1 truncate font-mono text-sm text-slate-700">{r.path}</span>
                <span className="hidden text-xs text-slate-400 sm:block">
                  {new Date(r.receivedAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}
                </span>
              </summary>
              <div className="space-y-3 border-t border-slate-100 px-4 py-4">
                <Section title={t('inbox.query')} data={r.query} />
                <Section title={t('inbox.body')} data={r.body} />
                <Section title={t('inbox.headers')} data={r.headers} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

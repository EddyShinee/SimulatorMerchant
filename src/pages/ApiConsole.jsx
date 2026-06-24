import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import api, { getApiOrigin } from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import { getApiById } from '../config/apis.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function statusColor(status) {
  if (status >= 200 && status < 300) return 'bg-green-100 text-green-700'
  if (status >= 300 && status < 400) return 'bg-amber-100 text-amber-700'
  if (status >= 400) return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-700'
}

export default function ApiConsole() {
  const { apiId } = useParams()
  const { t } = useLanguage()
  const config = getApiById(apiId)

  const defaultUrl = useMemo(
    () => (config ? `${getApiOrigin()}${config.path}` : ''),
    [config]
  )

  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('{\n  "Accept": "application/json"\n}')
  const [bodyText, setBodyText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Re-initialise the form whenever the selected API changes.
  useEffect(() => {
    if (!config) return
    setMethod(config.method)
    setUrl(`${getApiOrigin()}${config.path}`)
    setBodyText(config.sampleBody ? JSON.stringify(config.sampleBody, null, 2) : '')
    setHeadersText('{\n  "Accept": "application/json"\n}')
    setResult(null)
    setError('')
  }, [config])

  const showBody = !['GET', 'HEAD'].includes(method)

  if (!config) {
    return (
      <div className="card p-8 text-center text-slate-500">
        {t('common.none')}
      </div>
    )
  }

  const handleSend = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)

    let headers = {}
    if (headersText.trim()) {
      try {
        headers = JSON.parse(headersText)
      } catch {
        setError(t('apiCaller.invalidHeaders'))
        return
      }
    }

    let body
    if (showBody && bodyText.trim()) {
      try {
        body = JSON.parse(bodyText)
      } catch {
        setError(t('apiCaller.invalidBody'))
        return
      }
    }

    setLoading(true)
    try {
      const { data } = await api.post('/api/simulator/proxy', { method, url, headers, body })
      setResult(data)
    } catch (err) {
      const data = err.response?.data
      if (data) setResult(data)
      else setError(t('errors.network'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
          {method}
        </span>
        <h1 className="text-2xl font-bold text-slate-900">{t(config.nameKey)}</h1>
      </div>
      <p className="-mt-3 text-slate-500">{t('apiCaller.subtitle')}</p>

      <form onSubmit={handleSend} className="card space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:w-36">
            <label className="label">{t('apiCaller.method')}</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="label">{t('apiCaller.url')}</label>
            <input
              className="input font-mono"
              placeholder={t('apiCaller.urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">{t('apiCaller.headers')}</label>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              spellCheck={false}
            />
          </div>
          {showBody && (
            <div>
              <label className="label">{t('apiCaller.body')}</label>
              <textarea
                className="input min-h-[140px] font-mono text-xs"
                placeholder={t('apiCaller.bodyPlaceholder')}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('apiCaller.sending') : t('apiCaller.sendRequest')}
          </button>
        </div>
      </form>

      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-slate-900">{t('apiCaller.response')}</h2>
          {result && result.status != null && (
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${statusColor(result.status)}`}>
              {t('apiCaller.status')}: {result.status} {result.statusText || ''}
            </span>
          )}
          {result && result.durationMs != null && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {t('apiCaller.duration')}: {result.durationMs} ms
            </span>
          )}
        </div>

        {!result ? (
          <p className="text-sm text-slate-400">{t('apiCaller.noResponse')}</p>
        ) : (
          <pre className="max-h-[480px] overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            {JSON.stringify(result.body ?? result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

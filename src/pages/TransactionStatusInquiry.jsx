import { useEffect, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import PaymentTokenField from '../components/PaymentTokenField.jsx'
import {
  TXN_STATUS_INQUIRY_ENVIRONMENTS as ENVIRONMENTS,
  TXN_STATUS_INQUIRY_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
} from '../config/transactionStatusInquiryConfig.js'

function randomClientId() {
  return crypto.randomUUID().replace(/-/g, '')
}

function ResultCard({ title, text, mono }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <CopyButton text={text} />
      </div>
      <pre
        className={`max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 ${
          mono ? 'break-all whitespace-pre-wrap' : ''
        }`}
      >
        {text}
      </pre>
    </div>
  )
}

export default function TransactionStatusInquiry() {
  const { t } = useLanguage()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  const [paymentToken, setPaymentToken] = useState('')
  const [clientId, setClientId] = useState(randomClientId)
  const [locale, setLocale] = useState('en')
  const [additionalInfo, setAdditionalInfo] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    if (!paymentToken.trim()) {
      setError(t('txnStatusInquiry.tokenRequired'))
      return
    }

    const payload = {
      paymentToken: paymentToken.trim(),
      clientID: clientId.trim() || randomClientId(),
      locale: locale.trim() || 'en',
      additionalInfo,
    }

    setLoading(true)
    try {
      const { data } = await api.post('/api/simulator/proxy', {
        method: 'POST',
        url: apiUrl,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })

      setResult({
        payload,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        response: data?.body,
        error: data?.error ? data?.message : null,
      })
    } catch (err) {
      const d = err.response?.data
      setError(d?.message || err.message || t('errors.network'))
    } finally {
      setLoading(false)
    }
  }

  const responseText =
    result?.response != null
      ? typeof result.response === 'string'
        ? result.response
        : JSON.stringify(result.response, null, 2)
      : null

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="text-2xl font-bold text-slate-900">🔍 {t('txnStatusInquiry.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">⚙️ {t('paymentToken.configuration')}</h2>

          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => handleEnv(e.target.value)}>
                  {ENVIRONMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('paymentToken.apiUrl')}</label>
                <input
                  className="input font-mono text-xs"
                  value={apiUrl}
                  onChange={(e) => {
                    setApiUrl(e.target.value)
                    setEnv('custom')
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800">{t('doPayment.basicInfo')}</h3>
            <PaymentTokenField value={paymentToken} onChange={setPaymentToken} />
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label mb-0">🧾 Client ID</label>
                <button
                  type="button"
                  onClick={() => setClientId(randomClientId())}
                  className="text-xs text-brand-600 hover:underline"
                >
                  🔄 {t('txnStatusInquiry.newClientId')}
                </button>
              </div>
              <input
                className="input font-mono text-xs"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="label">🌍 Locale</label>
              <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('txnStatusInquiry.additionalInfo')}</label>
              <div className="flex gap-2">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setAdditionalInfo(val)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                      additionalInfo === val
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {val ? t('txnStatusInquiry.yes') : t('txnStatusInquiry.no')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('txnStatusInquiry.sending') : `🚀 ${t('txnStatusInquiry.send')}`}
          </button>
        </div>

        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">📊 {t('paymentToken.results')}</h2>

          {!result ? (
            <div className="card p-8 text-center text-sm text-slate-400">{t('paymentToken.noResult')}</div>
          ) : (
            <div className="space-y-4">
              {(result.status != null || result.error) && (
                <div className="flex flex-wrap items-center gap-2">
                  {result.status != null && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        result.status >= 200 && result.status < 300
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {result.status} {result.statusText || ''}
                    </span>
                  )}
                  {result.durationMs != null && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {result.durationMs} ms
                    </span>
                  )}
                  {result.error && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      {result.error}
                    </span>
                  )}
                </div>
              )}

              <ResultCard
                title={`📤 ${t('txnStatusInquiry.requestTitle')}`}
                text={JSON.stringify(result.payload, null, 2)}
              />

              {responseText != null && (
                <ResultCard title={`📥 ${t('txnStatusInquiry.responseTitle')}`} text={responseText} mono />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

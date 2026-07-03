import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import PasteButton from '../components/PasteButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { signJwtHS256 } from '../utils/jwt.js'
import { parseProxyBody, proxyErrorMessage } from '../utils/proxyResponse.js'
import { DEFAULT_SECRET_KEY } from '../config/paymentTokenFields.js'
import {
  PAYMENT_INQUIRY_ENVIRONMENTS as ENVIRONMENTS,
  PAYMENT_INQUIRY_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
} from '../config/paymentInquiryConfig.js'

function ResultCard({ title, text, mono }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <CopyButton text={text} />
      </div>
      <pre
        className={`max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 ${
          mono ? 'break-all whitespace-pre-wrap' : ''
        }`}
      >
        {text}
      </pre>
    </div>
  )
}

export default function PaymentInquiry() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow, recordStep } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()
  const [searchParams] = useSearchParams()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  useEffect(() => {
    const inv = searchParams.get('invoiceNo')
    if (inv?.trim()) {
      setInvoiceNo(inv.trim())
      updateFlow({ invoiceNo: inv.trim() })
    }
  }, [searchParams, updateFlow])

  const [merchantId, setMerchantId] = useState(flow.merchantId || '704704000000000')
  const [invoiceNo, setInvoiceNo] = useState(flow.invoiceNo || '254b77aabc')
  const [locale, setLocale] = useState('en')
  const [secretKey, setSecretKey] = useState(flow.secretKey || DEFAULT_SECRET_KEY)

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const handlePasteInvoice = (text) => {
    if (text) setInvoiceNo(text)
    else toast.error(t('errors.clipboardDenied') || 'Cannot read clipboard')
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    if (!secretKey?.trim()) {
      setError(t('paymentInquiry.secretRequired'))
      toast.warning(t('paymentInquiry.secretRequired'))
      return
    }

    const payloadData = {
      merchantID: merchantId,
      invoiceNo: invoiceNo.trim(),
      locale: locale.trim() || 'en',
    }

    const signal = start()
    let jwtToken = null
    let finalPayload = null
    try {
      jwtToken = await signJwtHS256(payloadData, secretKey)
      finalPayload = { payload: jwtToken }

      const { data } = await api.post(
        '/api/simulator/proxy',
        {
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: finalPayload,
        },
        { signal }
      )

      const respBody = data?.body
      const { decodedResponse } = parseProxyBody(respBody)

      updateFlow({ merchantId, secretKey, invoiceNo: invoiceNo.trim() })

      setResult({
        payloadData,
        finalPayload,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        response: respBody,
        decodedResponse,
        error: data?.error ? data?.message : null,
      })

      if (data?.status >= 200 && data?.status < 300) {
        toast.success(t('common.requestSuccess'))
        recordStep('payment-inquiry', 'success', { invoiceNo: invoiceNo.trim() })
      } else toast.warning(data?.message || `HTTP ${data?.status}`)
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({
          payloadData,
          finalPayload,
          jwtToken,
          error: t('common.requestCancelled'),
        })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
      setResult({
        payloadData,
        finalPayload,
        jwtToken,
        error: message,
      })
    } finally {
      stop()
    }
  }

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="text-2xl font-bold text-slate-900">🧾 {t('paymentInquiry.title')}</h1>
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
            <div>
              <label className="label">🏢 merchantID</label>
              <input className="input" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label mb-0">🧾 invoiceNo</label>
                <PasteButton onPaste={handlePasteInvoice} />
              </div>
              <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
            <div>
              <label className="label">🌍 locale</label>
              <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} />
            </div>
          </div>

          <div className="card p-4">
            <label className="label">🔑 {t('paymentToken.secretKey')}</label>
            <input
              type="password"
              className="input font-mono text-xs"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('paymentInquiry.sending') : `🚀 ${t('paymentInquiry.send')}`}
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
                title={`📤 ${t('paymentInquiry.rawPayload')}`}
                text={JSON.stringify(result.payloadData, null, 2)}
              />
              <ResultCard
                title={`📨 ${t('paymentInquiry.requestPayload')}`}
                text={JSON.stringify(result.finalPayload, null, 2)}
              />

              {result.response != null && (
                <ResultCard
                  title={`📬 ${t('paymentToken.rawResponse')}`}
                  text={
                    typeof result.response === 'string'
                      ? result.response
                      : JSON.stringify(result.response, null, 2)
                  }
                />
              )}

              {result.decodedResponse && !result.decodedResponse.error && (
                <ResultCard
                  title={`🔓 ${t('paymentToken.decodedResponse')}`}
                  text={JSON.stringify(result.decodedResponse, null, 2)}
                />
              )}
              {result.decodedResponse?.error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                  ⚠️ Could not decode response JWT: {result.decodedResponse.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

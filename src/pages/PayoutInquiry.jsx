import { useEffect, useRef, useState } from 'react'
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
import {
  DEFAULT_PAYOUT_MERCHANT_ID,
  DEFAULT_PAYOUT_SECRET_KEY,
} from '../config/payoutCreateConfig.js'
import {
  PAYOUT_INQUIRY_ENVIRONMENTS as ENVIRONMENTS,
  PAYOUT_INQUIRY_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
} from '../config/payoutInquiryConfig.js'

function ResultCard({ title, text, mono }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function readClipboardText() {
  try {
    return (await navigator.clipboard.readText())?.trim() || ''
  } catch {
    return ''
  }
}

export default function PayoutInquiry() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  const [merchantId] = useState(DEFAULT_PAYOUT_MERCHANT_ID)
  const [secretKey] = useState(DEFAULT_PAYOUT_SECRET_KEY)
  const [requestId, setRequestId] = useState(() => flow.payoutRequestId?.trim() || '')
  const [utr, setUtr] = useState(() => flow.invoiceNo?.trim() || '')
  const clipboardHydratedRef = useRef(false)

  useEffect(() => {
    if (clipboardHydratedRef.current) return
    clipboardHydratedRef.current = true

    if (flow.payoutRequestId?.trim()) return

    let cancelled = false
    readClipboardText().then((clip) => {
      if (cancelled || !clip || !isUuid(clip)) return
      setRequestId((prev) => (prev.trim() ? prev : clip))
    })

    return () => {
      cancelled = true
    }
  }, [flow.payoutRequestId])

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const handlePasteRequestId = async (text) => {
    if (text) {
      setRequestId(text)
      toast.success(t('payoutInquiry.requestIdPasted'))
      return
    }

    const fromFlow = flow.payoutRequestId?.trim()
    if (fromFlow) {
      setRequestId(fromFlow)
      toast.success(t('payoutInquiry.requestIdPasted'))
      return
    }

    toast.error(t('payoutInquiry.pasteRequestIdFailed'))
  }

  const handlePasteUtr = (text) => {
    if (text) {
      setUtr(text)
      return
    }
    const fromFlow = flow.invoiceNo?.trim()
    if (fromFlow) setUtr(fromFlow)
    else toast.error(t('payoutInquiry.pasteUtrFailed'))
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    if (!requestId.trim() && !utr.trim()) {
      setError(t('payoutInquiry.requestOrUtrRequired'))
      toast.warning(t('payoutInquiry.requestOrUtrRequired'))
      return
    }

    const payloadData = {
      merchantID: merchantId,
      requestID: requestId.trim(),
      UTR: utr.trim(),
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
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          POST
        </span>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">🔍 {t('payoutInquiry.title')}</h1>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{t('payoutInquiry.subtitle')}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            ⚙️ {t('paymentToken.configuration')}
          </h2>

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
              <input className="input font-mono text-xs" value={merchantId} readOnly disabled />
            </div>
            <div>
              <label className="label">🔑 {t('paymentToken.secretKey')}</label>
              <input type="password" className="input font-mono text-xs" value={secretKey} readOnly disabled />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label mb-0">🔖 requestID</label>
                <PasteButton
                  label={t('payoutInquiry.pasteRequestId')}
                  onPaste={handlePasteRequestId}
                />
              </div>
              <input
                className="input font-mono text-xs"
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                placeholder={t('payoutInquiry.requestIdHint')}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label mb-0">🧾 UTR (invoiceID)</label>
                <PasteButton label={t('payoutInquiry.pasteUtr')} onPaste={handlePasteUtr} />
              </div>
              <input
                className="input font-mono text-xs"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder={t('payoutInquiry.utrPlaceholder')}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('payoutInquiry.sending') : `🚀 ${t('payoutInquiry.send')}`}
          </button>
        </div>

        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            📊 {t('paymentToken.results')}
          </h2>

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
                          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {result.status} {result.statusText || ''}
                    </span>
                  )}
                  {result.durationMs != null && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {result.durationMs} ms
                    </span>
                  )}
                  {result.error && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                      {result.error}
                    </span>
                  )}
                </div>
              )}

              <ResultCard
                title={`📤 ${t('payoutInquiry.rawPayload')}`}
                text={JSON.stringify(result.payloadData, null, 2)}
              />
              <ResultCard
                title={`📨 ${t('payoutInquiry.requestPayload')}`}
                text={JSON.stringify(result.finalPayload, null, 2)}
                mono
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  ⚠️ {t('payoutInquiry.decodeFailed')}: {result.decodedResponse.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

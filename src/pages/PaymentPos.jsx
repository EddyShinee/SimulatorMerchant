import { useEffect, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { signJwtHS256 } from '../utils/jwt.js'
import { parseProxyBody, proxyErrorMessage } from '../utils/proxyResponse.js'
import { DEFAULT_SECRET_KEY, generateIdempotencyId } from '../config/paymentTokenFields.js'
import {
  PAYMENT_POS_ENVIRONMENTS as ENVIRONMENTS,
  PAYMENT_POS_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
  DEFAULT_REQUEST_TIMEOUT_SEC,
  MIN_REQUEST_TIMEOUT_SEC,
  MAX_REQUEST_TIMEOUT_SEC,
} from '../config/paymentPosConfig.js'

const PAYMENT_CHANNELS = ['POSCC', 'VNQR']

function generateInvoiceNoPos() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts =
    String(d.getFullYear()).slice(2) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `INV-POS-${ts}${ms}`
}

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
        className={`max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 ${
          mono ? 'break-all whitespace-pre-wrap' : ''
        }`}
      >
        {text}
      </pre>
    </div>
  )
}

export default function PaymentPos() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [env, setEnv] = useState('mpay')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.mpay)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  const [merchantId, setMerchantId] = useState(flow.merchantId || '704704000000211')
  const [invoiceNo, setInvoiceNo] = useState(flow.invoiceNo || '')
  const [idempotencyId, setIdempotencyId] = useState(generateIdempotencyId)
  const [amount, setAmount] = useState(5000)
  const [currencyCode, setCurrencyCode] = useState('VND')
  const [paymentChannel, setPaymentChannel] = useState('POSCC')
  const [userDefined1, setUserDefined1] = useState('00024500937')
  const [secretKey, setSecretKey] = useState(flow.secretKey || DEFAULT_SECRET_KEY)
  const [responseReturnUrl, setResponseReturnUrl] = useState(
    'https://webhook.site/08fd12ec-4a71-4499-968c-0dbe729b8686'
  )
  const [customerName, setCustomerName] = useState('Eddy')
  const [customerEmail, setCustomerEmail] = useState('eddy.vu@2c2p.com')
  const [timeoutSec, setTimeoutSec] = useState(flow.posTimeoutSec ?? DEFAULT_REQUEST_TIMEOUT_SEC)

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    const finalInvoice = invoiceNo.trim() || generateInvoiceNoPos()
    const finalIdem = idempotencyId.trim() || generateIdempotencyId()

    const payloadData = {
      merchantId,
      invoiceNo: finalInvoice,
      description: `Eddy - Payment ${finalInvoice}`,
      amount: Number(amount),
      currencyCode,
      idempotencyID: finalIdem,
      userDefined1,
    }

    const signal = start()

    let jwtToken = null
    let apiPayload = null

    const partialResult = (extra = {}) => ({
      payloadData,
      jwtToken,
      apiPayload,
      invoiceNo: finalInvoice,
      ...extra,
    })

    try {
      jwtToken = await signJwtHS256(payloadData, secretKey)
      apiPayload = {
        paymentToken: jwtToken,
        clientID: randomClientId(),
        locale: 'en',
        responseReturnUrl,
        payment: {
          code: { channelCode: paymentChannel },
          data: { name: customerName, email: customerEmail },
        },
      }

      const requestTimeoutMs =
        Math.min(
          MAX_REQUEST_TIMEOUT_SEC,
          Math.max(MIN_REQUEST_TIMEOUT_SEC, Number(timeoutSec) || DEFAULT_REQUEST_TIMEOUT_SEC)
        ) * 1000

      const { data } = await api.post(
        '/api/simulator/proxy',
        {
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: apiPayload,
          timeoutMs: requestTimeoutMs,
        },
        { signal, timeout: requestTimeoutMs + 30000 }
      )

      const respBody = data?.body
      const { decodedResponse } = parseProxyBody(respBody)

      updateFlow({
        merchantId,
        secretKey,
        invoiceNo: finalInvoice,
        posTimeoutSec: Number(timeoutSec) || DEFAULT_REQUEST_TIMEOUT_SEC,
      })

      setResult(
        partialResult({
          status: data?.status,
          statusText: data?.statusText,
          durationMs: data?.durationMs,
          response: respBody,
          decodedResponse,
          error: data?.error ? data?.message : null,
        })
      )

      if (data?.status >= 200 && data?.status < 300) toast.success(t('common.requestSuccess'))
      else toast.warning(data?.message || `HTTP ${data?.status}`)

      setInvoiceNo('')
      setIdempotencyId(generateIdempotencyId())
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult(partialResult({ error: t('common.requestCancelled') }))
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
      const d = err.response?.data
      setResult(
        partialResult({
          status: err.response?.status,
          durationMs: d?.durationMs,
          error: message,
        })
      )
    } finally {
      stop()
    }
  }

  const webPaymentUrl = result?.decodedResponse?.webPaymentUrl

  return (
    <div className="space-y-6">
      <LoadingOverlay
        show={loading}
        onCancel={cancel}
        timeoutSec={Number(timeoutSec) || DEFAULT_REQUEST_TIMEOUT_SEC}
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="text-2xl font-bold text-slate-900">🔐 {t('paymentPos.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration */}
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
              <div>
                <label className="label">{t('paymentPos.timeout')}</label>
                <input
                  type="number"
                  className="input"
                  min={MIN_REQUEST_TIMEOUT_SEC}
                  max={MAX_REQUEST_TIMEOUT_SEC}
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">{t('paymentPos.timeoutHint')}</p>
              </div>
            </div>
          </div>

          <div className="card space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">merchantID</label>
                <input className="input" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
              </div>
              <div>
                <label className="label">idempotencyID</label>
                <input className="input" value={idempotencyId} onChange={(e) => setIdempotencyId(e.target.value)} />
              </div>
              <div>
                <label className="label">invoiceNo</label>
                <input
                  className="input"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Auto (INV-POS-…) nếu để trống"
                />
              </div>
              <div>
                <label className="label">amount</label>
                <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">currencyCode</label>
                <input className="input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} />
              </div>
              <div>
                <label className="label">userDefined1</label>
                <input className="input" value={userDefined1} onChange={(e) => setUserDefined1(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">{t('paymentPos.paymentChannel')}</label>
              <div className="flex gap-2">
                {PAYMENT_CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setPaymentChannel(ch)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                      paymentChannel === ch
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">responseReturnUrl</label>
              <input
                className="input font-mono text-xs"
                value={responseReturnUrl}
                onChange={(e) => setResponseReturnUrl(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Customer Name</label>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div>
                <label className="label">Customer Email</label>
                <input className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
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
            {loading ? t('paymentPos.sending') : `🔐 ${t('paymentPos.send')}`}
          </button>
        </div>

        {/* Results */}
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
                title={`📤 ${t('paymentPos.unencryptedPayload')}`}
                text={JSON.stringify(result.payloadData, null, 2)}
              />
              {result.jwtToken && (
                <ResultCard title={`🔏 ${t('paymentPos.encryptedPayload')}`} text={result.jwtToken} mono />
              )}
              {result.apiPayload && (
                <ResultCard
                  title={`📦 ${t('paymentPos.finalApiPayload')}`}
                  text={JSON.stringify(result.apiPayload, null, 2)}
                />
              )}

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

              {result.decodedResponse && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                      🧩 {t('paymentToken.decodedResponse')}
                    </p>
                    <CopyButton text={JSON.stringify(result.decodedResponse, null, 2)} />
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {JSON.stringify(result.decodedResponse, null, 2)}
                  </pre>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {webPaymentUrl && (
                      <a href={webPaymentUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                        🌐 {t('paymentToken.openPaymentUrl')}
                      </a>
                    )}
                    <CopyButton text={result.invoiceNo} />
                    <span className="text-xs text-slate-400">Invoice: {result.invoiceNo}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

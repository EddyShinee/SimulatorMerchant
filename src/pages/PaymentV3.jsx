import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import ExchangeSummary from '../components/ExchangeSummary.jsx'
import JsonResultCard from '../components/JsonResultCard.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import MerchantVaultPicker from '../components/MerchantVaultPicker.jsx'
import { useAccess } from '../context/AccessContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import api from '../api/client.js'
import { stampExchange } from '../utils/exchangeMeta.js'
import { vaultEnvToPageEnv } from '../utils/merchantVault.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import {
  classifyQrData,
  hmacSha256Upper,
  parsePaymentV3Response,
  signPaymentV3Request,
} from '../utils/paymentV3.js'
import {
  PAYMENT_V3_BODY_OPTIONS,
  PAYMENT_V3_CHANNELS,
  PAYMENT_V3_ENV_OPTIONS,
  PAYMENT_V3_ENVIRONMENTS,
  PAYMENT_V3_QR_OPTIONS,
  createPaymentV3Defaults,
  formatAmount12,
  refreshPaymentV3Timing,
} from '../config/paymentV3Config.js'

const OPTIONAL_FIELDS = [
  ['qrType', 'qrType'],
  ['panCountry', 'panCountry'],
  ['cardholderName', 'cardholderName'],
  ['cardholderEmail', 'cardholderEmail'],
  ['mobileNo', 'mobileNo'],
  ['userDefined1', 'userDefined1'],
  ['userDefined2', 'userDefined2'],
  ['userDefined3', 'userDefined3'],
  ['userDefined4', 'userDefined4'],
  ['userDefined5', 'userDefined5'],
  ['returnUrl', 'returnUrl'],
  ['backendUrl', 'backendUrl'],
]

function QrPanel({ qr }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (!qr || qr.type !== 'qr') {
      setSrc('')
      return undefined
    }
    let active = true
    QRCode.toDataURL(qr.value, { width: 280, margin: 1 })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(''))
    return () => {
      active = false
    }
  }, [qr])

  if (!qr) return null
  const image = qr.type === 'image' ? qr.src : src
  if (!image) return null
  return (
    <img
      src={image}
      alt="QR"
      width={280}
      height={280}
      className="mx-auto h-auto w-full max-w-[280px] rounded-lg border border-slate-200 bg-white p-2"
    />
  )
}

function amountErrorKey(code) {
  if (code === 'scale') return 'paymentV3.amountScale'
  if (code === 'tooLarge') return 'paymentV3.amountTooLarge'
  return 'paymentV3.amountInvalid'
}

export default function PaymentV3() {
  const { t } = useLanguage()
  const toast = useToast()
  const { isFeatureOn } = useAccess()
  const { flow, updateFlow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(PAYMENT_V3_ENVIRONMENTS.sandbox)
  const [secretKey, setSecretKey] = useState(flow.secretKey || '')
  const [form, setForm] = useState(() => ({
    ...createPaymentV3Defaults(),
    merchantID: flow.merchantId || createPaymentV3Defaults().merchantID,
  }))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(PAYMENT_V3_ENVIRONMENTS[env])
  }, [env])

  const amountInfo = useMemo(
    () => formatAmount12(form.amount, form.currencyCode),
    [form.amount, form.currencyCode]
  )

  const requestFields = useMemo(
    () => ({
      version: form.version,
      timeStamp: form.timeStamp,
      merchantID: form.merchantID,
      uniqueTransactionCode: form.uniqueTransactionCode,
      desc: form.desc,
      amt: amountInfo.amt,
      currencyCode: form.currencyCode,
      paymentChannel: form.paymentChannel,
      paymentExpiry: form.paymentExpiry,
      qrOption: form.qrOption,
      qrType: form.qrType,
      panCountry: form.panCountry,
      cardholderName: form.cardholderName,
      cardholderEmail: form.cardholderEmail,
      mobileNo: form.mobileNo,
      userDefined1: form.userDefined1,
      userDefined2: form.userDefined2,
      userDefined3: form.userDefined3,
      userDefined4: form.userDefined4,
      userDefined5: form.userDefined5,
      returnUrl: form.returnUrl,
      backendUrl: form.backendUrl,
    }),
    [form, amountInfo.amt]
  )

  const setField = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
  }

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(PAYMENT_V3_ENVIRONMENTS[value])
  }

  const handleRefreshTiming = () => {
    setForm((prev) => refreshPaymentV3Timing(prev))
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    if (!secretKey.trim()) {
      setError(t('paymentV3.secretRequired'))
      toast.warning(t('paymentV3.secretRequired'))
      return
    }
    if (!form.merchantID.trim() || !form.desc.trim() || !form.paymentChannel.trim()) {
      setError(t('paymentV3.fieldsRequired'))
      toast.warning(t('paymentV3.fieldsRequired'))
      return
    }

    const stamped = refreshPaymentV3Timing(form, { rotateCode: true })
    const stampedAmount = formatAmount12(stamped.amount, stamped.currencyCode)
    if (!stampedAmount.amt) {
      const message = t(amountErrorKey(stampedAmount.error))
      setError(message)
      toast.warning(message)
      return
    }

    setForm(stamped)
    const fields = {
      ...requestFields,
      timeStamp: stamped.timeStamp,
      uniqueTransactionCode: stamped.uniqueTransactionCode,
      paymentExpiry: stamped.paymentExpiry,
      amt: stampedAmount.amt,
    }

    const exchangeStarted = new Date()
    const signal = start()
    let signed = null
    try {
      signed = await signPaymentV3Request(fields, secretKey.trim(), stamped.requestEncoding)
      const { data } = await api.post(
        '/api/simulator/proxy',
        {
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: signed.formBody,
          timeoutMs: 60000,
        },
        { signal }
      )

      const parsed = parsePaymentV3Response(data?.body)
      let signatureValid = null
      if (parsed.payload && parsed.signature && secretKey.trim()) {
        const expected = await hmacSha256Upper(parsed.payload, secretKey.trim())
        signatureValid = expected === parsed.signature.toUpperCase()
      }

      updateFlow({
        merchantId: stamped.merchantID.trim(),
        secretKey: secretKey.trim(),
        invoiceNo: stamped.uniqueTransactionCode,
      })

      setResult({
        ...signed,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        ...stampExchange(exchangeStarted),
        response: data?.body,
        decryptedXml: parsed.decodedXml,
        parsed,
        signatureValid,
        error: data?.error ? data?.message : null,
      })

      const httpOk = data?.status >= 200 && data?.status < 300
      const code = parsed.respCode
      if (httpOk && (!code || code === '00' || code === '000' || code === '001')) {
        toast.success(t('common.requestSuccess'))
      } else {
        toast.warning(parsed.failReason || data?.message || `HTTP ${data?.status}`)
      }
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({
          ...(signed || {}),
          error: t('common.requestCancelled'),
          ...stampExchange(exchangeStarted),
        })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      const errorBody = err?.response?.data?.body ?? err?.response?.data ?? null
      setError(message)
      toast.error(message)
      setResult({
        ...(signed || {}),
        error: message,
        response: errorBody,
        ...stampExchange(exchangeStarted),
      })
    } finally {
      stop()
    }
  }

  const qr = classifyQrData(result?.parsed?.qrData, result?.parsed?.qrOption || form.qrOption)
  const responseText =
    result?.response == null
      ? ''
      : typeof result.response === 'string'
        ? result.response
        : JSON.stringify(result.response, null, 2)

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="page-title">{t('paymentV3.title')}</h1>
      </div>

      <div className="split-panel">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">⚙️ {t('paymentToken.configuration')}</h2>

          <div className="card space-y-4 p-4">
            <div className="form-grid-3">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => handleEnv(e.target.value)}>
                  {PAYMENT_V3_ENV_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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

          <div className="card space-y-4 p-4">
            <h3 className="font-semibold text-slate-800">{t('paymentToken.basicInfo')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">merchantID</label>
                <div className="flex items-stretch gap-2">
                  <input
                    className="input min-w-0 flex-1"
                    value={form.merchantID}
                    onChange={setField('merchantID')}
                  />
                  {isFeatureOn('merchant-vault') && (
                    <MerchantVaultPicker
                      currentMid={form.merchantID}
                      currentSecretKey={secretKey}
                      currentPageEnv={env}
                      onSelect={({ mid, secretKey: key, environment }) => {
                        if (mid) setForm((prev) => ({ ...prev, merchantID: mid }))
                        if (key !== undefined) setSecretKey(key)
                        if (environment) handleEnv(vaultEnvToPageEnv(environment))
                        updateFlow({
                          merchantId: mid || form.merchantID,
                          ...(key !== undefined ? { secretKey: key } : {}),
                        })
                      }}
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="label">desc</label>
                <input className="input" value={form.desc} onChange={setField('desc')} />
              </div>
              <div>
                <label className="label">uniqueTransactionCode</label>
                <input
                  className="input font-mono text-xs"
                  value={form.uniqueTransactionCode}
                  onChange={setField('uniqueTransactionCode')}
                />
              </div>
              <div>
                <label className="label">version</label>
                <input className="input font-mono" value={form.version} onChange={setField('version')} />
              </div>
              <div>
                <label className="label">amount</label>
                <input className="input font-mono" value={form.amount} onChange={setField('amount')} />
                <p className="mt-1 text-xs text-slate-400">
                  amt {amountInfo.amt || '—'}
                  {form.currencyCode === '704' ? ` · ${t('paymentV3.vndHint')}` : ''}
                </p>
              </div>
              <div>
                <label className="label">currencyCode</label>
                <input className="input font-mono" value={form.currencyCode} onChange={setField('currencyCode')} />
              </div>
              <div>
                <label className="label">paymentChannel</label>
                <input
                  className="input font-mono"
                  list="payment-v3-channels"
                  value={form.paymentChannel}
                  onChange={setField('paymentChannel')}
                />
                <datalist id="payment-v3-channels">
                  {PAYMENT_V3_CHANNELS.map((channel) => (
                    <option key={channel} value={channel} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label">qrOption</label>
                <select className="input" value={form.qrOption} onChange={setField('qrOption')}>
                  {PAYMENT_V3_QR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">timeStamp</label>
                <input className="input font-mono text-xs" value={form.timeStamp} onChange={setField('timeStamp')} />
              </div>
              <div>
                <label className="label">{t('paymentV3.expiryMinutes')}</label>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  value={form.expiryMinutes}
                  onChange={setField('expiryMinutes')}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">paymentExpiry</label>
                <input
                  className="input font-mono text-xs"
                  value={form.paymentExpiry}
                  onChange={setField('paymentExpiry')}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('paymentV3.requestEncoding')}</label>
                <select className="input" value={form.requestEncoding} onChange={setField('requestEncoding')}>
                  {PAYMENT_V3_BODY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">{t('paymentV3.encodingHint')}</p>
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={handleRefreshTiming}>
              {t('paymentV3.refreshTiming')}
            </button>
          </div>

          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((open) => !open)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span>➕ {t('paymentToken.advancedOptions')}</span>
              <span className="text-slate-400">{showAdvanced ? '−' : '+'}</span>
            </button>
            {showAdvanced && (
              <div className="border-t border-slate-100 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {OPTIONAL_FIELDS.map(([key, label]) => (
                    <div key={key} className={key.endsWith('Url') ? 'sm:col-span-2' : ''}>
                      <label className="label">{label}</label>
                      <input className="input font-mono text-xs" value={form[key]} onChange={setField(key)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card p-4">
            <label className="label">🔑 {t('paymentToken.secretKey')}</label>
            <input
              type="password"
              className="input font-mono text-xs"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              {error}
            </div>
          )}

          <button type="button" onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('paymentV3.sending') : `🚀 ${t('paymentV3.send')}`}
          </button>
        </div>

        <div className="result-panel space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">📊 {t('paymentToken.results')}</h2>

          {!result ? (
            <div className="card p-8 text-center text-sm text-slate-400">{t('paymentToken.noResult')}</div>
          ) : (
            <div className="result-panel space-y-4">
              <ExchangeSummary result={result} method="POST" />

              {(result.parsed?.respCode || result.parsed?.failReason || qr) && (
                <div className="card space-y-3 p-4">
                  {result.parsed?.respCode && (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">respCode</span>{' '}
                      <span className="font-mono">{result.parsed.respCode}</span>
                    </p>
                  )}
                  {result.parsed?.failReason && (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">failReason</span> {result.parsed.failReason}
                    </p>
                  )}
                  {result.parsed?.tranRef && (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">tranRef</span>{' '}
                      <span className="font-mono">{result.parsed.tranRef}</span>
                    </p>
                  )}
                  {result.signatureValid === true && (
                    <p className="text-sm text-emerald-700">{t('paymentV3.signatureOk')}</p>
                  )}
                  {result.signatureValid === false && (
                    <p className="text-sm text-amber-700">{t('paymentV3.signatureBad')}</p>
                  )}
                  {qr && (
                    <>
                      <p className="text-sm font-semibold text-slate-700">{t('paymentV3.qrTitle')}</p>
                      <QrPanel qr={qr} />
                      <p className="break-all font-mono text-xs text-slate-400">{result.parsed.qrData}</p>
                    </>
                  )}
                </div>
              )}

              {result.innerXml && <JsonResultCard title={t('paymentV3.innerXml')} text={result.innerXml} />}
              {result.payload && (
                <JsonResultCard
                  title={t('paymentV3.payload')}
                  text={result.payload}
                  language="text"
                  maxHeight="max-h-40"
                />
              )}
              {result.signature && (
                <JsonResultCard
                  title={t('paymentV3.signature')}
                  text={result.signature}
                  language="text"
                  maxHeight="max-h-24"
                />
              )}
              {result.outerXml && <JsonResultCard title={t('paymentV3.outerXml')} text={result.outerXml} />}
              <JsonResultCard
                title={t('paymentToken.rawResponse')}
                text={responseText || t('paymentV3.emptyResponse')}
              />
              {result.decryptedXml && (
                <JsonResultCard title={t('paymentV3.decodedResponse')} text={result.decryptedXml} />
              )}
              {result.parsed?.decodeError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                  {result.parsed.decodeError}
                </div>
              )}
              {result.error && !result.response && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                  {result.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

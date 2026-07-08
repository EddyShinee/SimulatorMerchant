import { useEffect, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import RequestIdCopyBar, { copyTextToClipboard } from '../components/RequestIdCopyBar.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { signJwtHS256 } from '../utils/jwt.js'
import { parseProxyBody, proxyErrorMessage } from '../utils/proxyResponse.js'
import { generateInvoiceNo } from '../config/paymentTokenFields.js'
import {
  BENEFICIARY_TYPE_OPTIONS,
  DEFAULT_PAYOUT_MERCHANT_ID,
  DEFAULT_PAYOUT_PAYLOAD,
  DEFAULT_PAYOUT_SECRET_KEY,
  PAYOUT_CREATE_FIELD_META,
  buildPayoutCreatePayload,
  formatPayoutDateToday,
  PAYOUT_CREATE_ENVIRONMENTS as ENVIRONMENTS,
  PAYOUT_CREATE_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
} from '../config/payoutCreateConfig.js'

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

function randomRequestId() {
  return crypto.randomUUID()
}

function ParamLabel({ name, meta }) {
  const badgeClass =
    meta.mandatory === 'M'
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
      : meta.mandatory === 'C'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'

  return (
    <div className="mb-1 flex flex-wrap items-center gap-2">
      <label className="label mb-0 font-mono text-xs">{name}</label>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>{meta.mandatory}</span>
      <span className="text-[10px] text-slate-400">
        {meta.type}
        {meta.maxLength ? ` · max ${meta.maxLength}` : ''}
        {meta.decimals ? ` · ${meta.decimals} decimals` : ''}
      </span>
    </div>
  )
}

function trimOrDefault(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : value
  return trimmed || fallback
}

function sliceField(value, maxLength) {
  if (maxLength && typeof value === 'string') return value.slice(0, maxLength)
  return value
}

export default function CreatePayout() {
  const { t } = useLanguage()
  const toast = useToast()
  const { updateFlow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)
  const [showUserDefined, setShowUserDefined] = useState(false)
  const [showOptional, setShowOptional] = useState(false)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  const [merchantId, setMerchantId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [beneficiaryName, setBeneficiaryName] = useState('')
  const [amount, setAmount] = useState('')
  const [beneficiaryBankCode, setBeneficiaryBankCode] = useState('')
  const [requestId, setRequestId] = useState('')
  const [utr, setUtr] = useState('')
  const [payoutDate, setPayoutDate] = useState('')
  const [preferredSofProfile, setPreferredSofProfile] = useState('')
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [beneficiaryType, setBeneficiaryType] = useState('')
  const [beneficiaryTypeValue, setBeneficiaryTypeValue] = useState('')
  const [preferredProvider, setPreferredProvider] = useState('')
  const [notificationUrl, setNotificationUrl] = useState('')
  const [userDefined, setUserDefined] = useState({
    userDefined1: '',
    userDefined2: '',
    userDefined3: '',
    userDefined4: '',
    userDefined5: '',
  })

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const handleUserDefined = (key, value) => {
    const max = PAYOUT_CREATE_FIELD_META[key]?.maxLength
    setUserDefined((prev) => ({
      ...prev,
      [key]: max ? value.slice(0, max) : value,
    }))
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    const resolvedSecretKey = trimOrDefault(secretKey, DEFAULT_PAYOUT_SECRET_KEY)
    const resolvedMerchantId = trimOrDefault(merchantId, DEFAULT_PAYOUT_MERCHANT_ID)
    const resolvedAmountRaw = amount.trim() ? amount : String(DEFAULT_PAYOUT_PAYLOAD.amount)
    const parsedAmount = Number.parseFloat(resolvedAmountRaw)

    if (!resolvedSecretKey) {
      setError(t('createPayout.secretRequired'))
      toast.warning(t('createPayout.secretRequired'))
      return
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t('createPayout.amountRequired'))
      toast.warning(t('createPayout.amountRequired'))
      return
    }

    const finalUtr = sliceField(
      trimOrDefault(utr, generateInvoiceNo()),
      PAYOUT_CREATE_FIELD_META.UTR.maxLength
    )
    const finalRequestId = trimOrDefault(requestId, randomRequestId())
    const finalPayoutDate = trimOrDefault(payoutDate, formatPayoutDateToday())

    setUtr('')
    setRequestId('')

    const payloadData = buildPayoutCreatePayload({
      merchantID: resolvedMerchantId,
      beneficiaryName: trimOrDefault(beneficiaryName, DEFAULT_PAYOUT_PAYLOAD.beneficiaryName),
      amount: resolvedAmountRaw,
      beneficiaryBankCode: trimOrDefault(beneficiaryBankCode, DEFAULT_PAYOUT_PAYLOAD.beneficiaryBankCode),
      requestID: finalRequestId,
      UTR: finalUtr,
      payoutDate: finalPayoutDate,
      beneficiaryType: trimOrDefault(beneficiaryType, DEFAULT_PAYOUT_PAYLOAD.beneficiaryType),
      beneficiaryTypeValue: trimOrDefault(
        beneficiaryTypeValue,
        DEFAULT_PAYOUT_PAYLOAD.beneficiaryTypeValue
      ),
      preferredSofProfile,
      beneficiaryId,
      preferredProvider,
      notificationUrl,
      ...userDefined,
    })

    const signal = start()
    let jwtToken = null
    let finalPayload = null

    try {
      jwtToken = await signJwtHS256(payloadData, resolvedSecretKey)
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

      updateFlow({
        merchantId: resolvedMerchantId,
        secretKey: resolvedSecretKey,
        invoiceNo: finalUtr,
        payoutRequestId: finalRequestId,
      })

      setResult({
        payloadData,
        finalPayload,
        utr: finalUtr,
        requestId: finalRequestId,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        response: respBody,
        decodedResponse,
        error: data?.error ? data?.message : null,
      })

      if (data?.status >= 200 && data?.status < 300) {
        const copied = await copyTextToClipboard(finalRequestId)
        toast.success(
          copied ? t('createPayout.requestIdCopied') : t('common.requestSuccess')
        )
        if (!copied) toast.warning(t('createPayout.requestIdCopyFailed'))
      } else toast.warning(data?.message || `HTTP ${data?.status}`)
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({ payloadData, finalPayload, jwtToken, requestId: finalRequestId, error: t('common.requestCancelled') })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
      setResult({ payloadData, finalPayload, jwtToken, requestId: finalRequestId, error: message })
    } finally {
      stop()
    }
  }

  const meta = PAYOUT_CREATE_FIELD_META

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          POST
        </span>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">💸 {t('createPayout.title')}</h1>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{t('createPayout.subtitle')}</p>

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

          {/* M — Merchant */}
          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t('createPayout.sectionMerchant')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('createPayout.defaultFieldHint')}</p>
            <div>
              <ParamLabel name="merchantID" meta={meta.merchantID} />
              <input
                className="input font-mono text-xs"
                value={merchantId}
                maxLength={meta.merchantID.maxLength}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder={DEFAULT_PAYOUT_MERCHANT_ID}
              />
            </div>
            <div>
              <label className="label">🔑 {t('paymentToken.secretKey')}</label>
              <input
                type="password"
                className="input font-mono text-xs"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={t('createPayout.defaultSecretHint')}
              />
            </div>
          </div>

          {/* M + C — Beneficiary */}
          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t('createPayout.sectionBeneficiary')}</h3>
            <div>
              <ParamLabel name="beneficiaryName" meta={meta.beneficiaryName} />
              <input
                className="input"
                value={beneficiaryName}
                maxLength={meta.beneficiaryName.maxLength}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder={DEFAULT_PAYOUT_PAYLOAD.beneficiaryName}
              />
            </div>
            <div>
              <ParamLabel name="beneficiaryBankCode" meta={meta.beneficiaryBankCode} />
              <input
                className="input font-mono text-xs"
                value={beneficiaryBankCode}
                maxLength={meta.beneficiaryBankCode.maxLength}
                onChange={(e) => setBeneficiaryBankCode(e.target.value)}
                placeholder={DEFAULT_PAYOUT_PAYLOAD.beneficiaryBankCode}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <ParamLabel name="beneficiaryType" meta={meta.beneficiaryType} />
                <select
                  className="input font-mono text-xs"
                  value={beneficiaryType}
                  onChange={(e) => setBeneficiaryType(e.target.value)}
                >
                  <option value="">
                    {t('createPayout.useDefault')} ({DEFAULT_PAYOUT_PAYLOAD.beneficiaryType})
                  </option>
                  {BENEFICIARY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <ParamLabel name="beneficiaryTypeValue" meta={meta.beneficiaryTypeValue} />
                <input
                  className="input font-mono text-xs"
                  value={beneficiaryTypeValue}
                  maxLength={meta.beneficiaryTypeValue.maxLength}
                  onChange={(e) => setBeneficiaryTypeValue(e.target.value)}
                  placeholder={DEFAULT_PAYOUT_PAYLOAD.beneficiaryTypeValue}
                />
              </div>
            </div>
          </div>

          {/* M + O — Payout core */}
          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{t('createPayout.sectionPayout')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <ParamLabel name="amount" meta={meta.amount} />
                <input
                  className="input font-mono text-xs"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(DEFAULT_PAYOUT_PAYLOAD.amount)}
                />
              </div>
              <div>
                <ParamLabel name="payoutDate" meta={meta.payoutDate} />
                <input
                  className="input font-mono text-xs"
                  value={payoutDate}
                  maxLength={meta.payoutDate.maxLength}
                  onChange={(e) => setPayoutDate(e.target.value)}
                  placeholder={formatPayoutDateToday()}
                />
                <p className="mt-1 text-[10px] text-slate-400">{t('createPayout.payoutDateHint')}</p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <ParamLabel name="requestID" meta={meta.requestID} />
                <div className="flex items-center gap-2">
                  {requestId.trim() && <CopyButton text={requestId.trim()} label={t('createPayout.copyRequestId')} className="!px-2 !py-1 text-xs" />}
                  <button
                    type="button"
                    onClick={() => setRequestId(randomRequestId())}
                    className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                  >
                    🔄 {t('createPayout.newRequestId')}
                  </button>
                </div>
              </div>
              <input
                className="input font-mono text-xs"
                value={requestId}
                maxLength={meta.requestID.maxLength}
                onChange={(e) => setRequestId(e.target.value)}
                placeholder={t('createPayout.requestIdAutoHint')}
              />
              <p className="mt-1 text-[10px] text-slate-400">{t('createPayout.requestIdHint')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <ParamLabel name="UTR" meta={meta.UTR} />
                <input
                  className="input font-mono text-xs"
                  value={utr}
                  maxLength={meta.UTR.maxLength}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder={t('createPayout.utrPlaceholder')}
                />
                <p className="mt-1 text-[10px] text-slate-400">{t('createPayout.utrHint')}</p>
              </div>
              <div>
                <ParamLabel name="preferredSofProfile" meta={meta.preferredSofProfile} />
                <input
                  className="input font-mono text-xs"
                  value={preferredSofProfile}
                  maxLength={meta.preferredSofProfile.maxLength}
                  onChange={(e) => setPreferredSofProfile(e.target.value)}
                  placeholder={t('createPayout.preferredSofProfileHint')}
                />
              </div>
            </div>
          </div>

          {/* C + O — Optional / conditional */}
          <div className="card p-4">
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="font-semibold text-slate-800 dark:text-slate-100">{t('createPayout.sectionOptional')}</span>
              <span className="text-slate-400">{showOptional ? '−' : '+'}</span>
            </button>
            {showOptional && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <ParamLabel name="beneficiaryId" meta={meta.beneficiaryId} />
                  <input
                    className="input font-mono text-xs"
                    value={beneficiaryId}
                    maxLength={meta.beneficiaryId.maxLength}
                    onChange={(e) => setBeneficiaryId(e.target.value)}
                  />
                </div>
                <div>
                  <ParamLabel name="preferredProvider" meta={meta.preferredProvider} />
                  <input
                    className="input font-mono text-xs"
                    value={preferredProvider}
                    maxLength={meta.preferredProvider.maxLength}
                    onChange={(e) => setPreferredProvider(e.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">{t('createPayout.preferredProviderHint')}</p>
                </div>
                <div>
                  <ParamLabel name="notificationUrl" meta={meta.notificationUrl} />
                  <input
                    className="input font-mono text-xs"
                    value={notificationUrl}
                    maxLength={meta.notificationUrl.maxLength}
                    onChange={(e) => setNotificationUrl(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* O — User defined (collapsed) */}
          <div className="card p-4">
            <button
              type="button"
              onClick={() => setShowUserDefined((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="font-semibold text-slate-800 dark:text-slate-100">{t('createPayout.sectionUserDefined')}</span>
              <span className="text-slate-400">{showUserDefined ? '−' : '+'}</span>
            </button>
            {showUserDefined && (
              <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-slate-800">
                {[1, 2, 3, 4, 5].map((n) => {
                  const key = `userDefined${n}`
                  return (
                    <div key={key}>
                      <ParamLabel name={key} meta={meta[key]} />
                      <input
                        className="input font-mono text-xs"
                        value={userDefined[key]}
                        maxLength={meta[key].maxLength}
                        onChange={(e) => handleUserDefined(key, e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('createPayout.sending') : `🚀 ${t('createPayout.send')}`}
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

              {result.requestId && <RequestIdCopyBar requestId={result.requestId} />}

              <ResultCard
                title={`📤 ${t('createPayout.rawPayload')}`}
                text={JSON.stringify(result.payloadData, null, 2)}
              />
              <ResultCard
                title={`📨 ${t('createPayout.requestPayload')}`}
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
                  ⚠️ {t('createPayout.decodeFailed')}: {result.decodedResponse.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

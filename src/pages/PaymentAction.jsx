import { useEffect, useMemo, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import PasteButton from '../components/PasteButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import {
  PAYMENT_ACTION_ENVIRONMENTS,
  PAYMENT_ACTION_ENV_OPTIONS,
  PROCESS_TYPE_OPTIONS,
  generateTimestamp,
  buildPaymentActionXml,
} from '../config/paymentActionConfig.js'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Recursively serialize a DOM node into indented XML.
function serializeIndented(node, level) {
  const pad = '  '.repeat(level)
  const tag = node.tagName
  const children = Array.from(node.children)
  if (children.length === 0) {
    const text = node.textContent
    if (text.trim() === '') return `${pad}<${tag} />`
    return `${pad}<${tag}>${text}</${tag}>`
  }
  const inner = children.map((c) => serializeIndented(c, level + 1)).join('\n')
  return `${pad}<${tag}>\n${inner}\n${pad}</${tag}>`
}

// Parse a PaymentProcessResponse-style XML into {rootName, fields, pretty}.
function parseXmlResponse(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    const root = doc.documentElement
    if (!root) return null
    const fields = Array.from(root.children).map((node) => ({
      tag: node.tagName,
      value: node.children.length === 0 ? node.textContent.trim() : null,
      isComplex: node.children.length > 0,
      complexXml: node.children.length > 0 ? serializeIndented(node, 0) : null,
    }))
    return { rootName: root.tagName, fields, pretty: serializeIndented(root, 0) }
  } catch {
    return null
  }
}

function get(fields, tag) {
  return fields.find((f) => f.tag === tag)?.value
}

function DecryptedXmlView({ xml }) {
  const { t } = useLanguage()
  const parsed = parseXmlResponse(xml)

  if (!parsed) {
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
        {xml}
      </pre>
    )
  }

  const { fields, pretty } = parsed
  const respCode = get(fields, 'respCode')
  const respDesc = get(fields, 'respDesc')
  const status = get(fields, 'status')
  const success = respCode === '00'

  return (
    <div className="space-y-3">
      {/* Highlighted summary */}
      <div className="flex flex-wrap items-center gap-2">
        {respCode != null && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${
              success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {success ? '✓' : '✕'} respCode: {respCode}
            {respDesc ? ` · ${respDesc}` : ''}
          </span>
        )}
        {status && (
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            status: {status}
          </span>
        )}
      </div>

      {/* Field table */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.tag} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                <td className="w-1/2 break-words px-3 py-1.5 font-medium text-slate-500 align-top">
                  {f.tag}
                </td>
                <td className="w-1/2 break-words px-3 py-1.5 font-mono text-slate-800">
                  {f.isComplex ? (
                    <pre className="overflow-auto whitespace-pre-wrap text-xs text-slate-600">
                      {f.complexXml}
                    </pre>
                  ) : f.value ? (
                    f.value
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pretty XML (collapsible) */}
      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
          {t('paymentAction.xmlPayload')}
        </summary>
        <div className="relative">
          <div className="absolute right-2 top-2 z-10">
            <CopyButton text={pretty} />
          </div>
          <pre className="max-h-96 overflow-auto rounded-b-lg bg-slate-900 p-3 text-xs text-slate-100">
            {pretty}
          </pre>
        </div>
      </details>
    </div>
  )
}

const emptyLoyalty = () => ({
  loyaltyProvider: '',
  externalMerchantId: '',
  totalRefundRewardAmount: '',
  rewards: [],
})

function LoyaltyEditor({ value, onChange, title }) {
  const { t } = useLanguage()
  const update = (key, val) => onChange({ ...value, [key]: val })

  const setRewardCount = (n) => {
    const count = Math.max(0, Math.min(10, Number(n) || 0))
    const rewards = [...(value.rewards || [])]
    while (rewards.length < count) rewards.push({ type: '', quantity: '' })
    rewards.length = count
    onChange({ ...value, rewards })
  }

  const updateReward = (idx, key, val) => {
    const rewards = [...(value.rewards || [])]
    rewards[idx] = { ...rewards[idx], [key]: val }
    onChange({ ...value, rewards })
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className="input"
          placeholder="loyaltyProvider"
          value={value.loyaltyProvider}
          onChange={(e) => update('loyaltyProvider', e.target.value)}
        />
        <input
          className="input"
          placeholder="externalMerchantId"
          value={value.externalMerchantId}
          onChange={(e) => update('externalMerchantId', e.target.value)}
        />
        <input
          className="input"
          placeholder="totalRefundRewardAmount"
          value={value.totalRefundRewardAmount}
          onChange={(e) => update('totalRefundRewardAmount', e.target.value)}
        />
      </div>
      <div className="mt-2">
        <label className="label">{t('paymentAction.rewardCount')}</label>
        <input
          type="number"
          min={0}
          max={10}
          className="input sm:w-40"
          value={(value.rewards || []).length}
          onChange={(e) => setRewardCount(e.target.value)}
        />
      </div>
      {(value.rewards || []).map((r, i) => (
        <div key={i} className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            placeholder={`reward #${i + 1} - type`}
            value={r.type}
            onChange={(e) => updateReward(i, 'type', e.target.value)}
          />
          <input
            className="input"
            placeholder={`reward #${i + 1} - quantity`}
            value={r.quantity}
            onChange={(e) => updateReward(i, 'quantity', e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

export default function PaymentAction() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  // Environment
  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(PAYMENT_ACTION_ENVIRONMENTS.sandbox)

  // Keep the API URL in sync with the selected environment (avoids stale URLs).
  useEffect(() => {
    if (env !== 'custom') setApiUrl(PAYMENT_ACTION_ENVIRONMENTS[env])
  }, [env])

  // Keys
  const [useDefaultKeys, setUseDefaultKeys] = useState(true)
  const [privateKeyFile, setPrivateKeyFile] = useState(null)
  const [publicCertFile, setPublicCertFile] = useState(null)
  const [password, setPassword] = useState('')

  // Request params
  const [version, setVersion] = useState('4.3')
  const [mid, setMid] = useState('704704000000211')
  const [invoiceNo, setInvoiceNo] = useState(flow.invoiceNo || '01a00a81-364c-48f4-8278-3aef4ec61399')
  const [amount, setAmount] = useState('5000')
  const [processType, setProcessType] = useState('I')
  const [timestamp, setTimestamp] = useState(generateTimestamp)
  const [recurringId, setRecurringId] = useState('')
  const [notifyURL, setNotifyURL] = useState('')

  // Optional
  const [showOptional, setShowOptional] = useState(false)
  const [bankCode, setBankCode] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [idempotencyId, setIdempotencyId] = useState('')
  const [userDefined, setUserDefined] = useState(['', '', '', '', ''])
  const [subMerchants, setSubMerchants] = useState([])
  const [topLoyaltyEnabled, setTopLoyaltyEnabled] = useState(false)
  const [topLoyalty, setTopLoyalty] = useState(emptyLoyalty)

  // Result
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(PAYMENT_ACTION_ENVIRONMENTS[value])
  }

  const setUd = (idx, val) =>
    setUserDefined((prev) => prev.map((v, i) => (i === idx ? val : v)))

  const setSubCount = (n) => {
    const count = Math.max(0, Math.min(20, Number(n) || 0))
    setSubMerchants((prev) => {
      const next = [...prev]
      while (next.length < count)
        next.push({ subMID: '', subAmount: '', loyaltyEnabled: false, loyalty: emptyLoyalty() })
      next.length = count
      return next
    })
  }

  const updateSub = (idx, patch) =>
    setSubMerchants((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))

  const fields = useMemo(
    () => ({
      version,
      timestamp,
      mid,
      processType,
      invoiceNo,
      amount,
      recurringId,
      bankCode,
      accountName,
      accountNumber,
      notifyURL: processType === 'R' || processType === 'V' ? notifyURL : '',
      idempotencyId,
      userDefined,
      subMerchants,
      topLoyalty: topLoyaltyEnabled ? topLoyalty : null,
    }),
    [
      version, timestamp, mid, processType, invoiceNo, amount, recurringId, bankCode,
      accountName, accountNumber, notifyURL, idempotencyId, userDefined, subMerchants,
      topLoyaltyEnabled, topLoyalty,
    ]
  )

  const xmlPreview = useMemo(() => buildPaymentActionXml(fields), [fields])

  const handleSend = async () => {
    setError('')
    setResult(null)
    if (!useDefaultKeys && (!privateKeyFile || !publicCertFile)) {
      setError(t('paymentAction.keysRequired'))
      toast.warning(t('paymentAction.keysRequired'))
      return
    }

    const signal = start()
    try {
      const payloadBody = { apiUrl, xml: xmlPreview, password, useDefaultKeys }
      if (!useDefaultKeys) {
        const [privBase64, pubBase64] = await Promise.all([
          fileToBase64(privateKeyFile),
          fileToBase64(publicCertFile),
        ])
        payloadBody.privateKey = { base64: privBase64, filename: privateKeyFile.name }
        payloadBody.publicCert = { base64: pubBase64, filename: publicCertFile.name }
      }
      const { data } = await api.post('/api/simulator/payment-action', payloadBody, { signal })
      updateFlow({ invoiceNo: invoiceNo.trim() })
      setResult(data)
      if (data?.success !== false) toast.success(t('common.requestSuccess'))
      else toast.warning(data?.message || t('errors.network'))
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({ error: t('common.requestCancelled'), xml: xmlPreview })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
      setResult({ error: message, xml: xmlPreview })
    } finally {
      stop()
    }
  }

  const showNotify = processType === 'R' || processType === 'V'

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="text-2xl font-bold text-slate-900">🔐 {t('paymentAction.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- Configuration ---------------- */}
        <div className="space-y-5">
          {/* Environment */}
          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => handleEnv(e.target.value)}>
                  {PAYMENT_ACTION_ENV_OPTIONS.map((o) => (
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

          {/* Key management */}
          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800">🔑 {t('paymentAction.keyManagement')}</h3>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={useDefaultKeys}
                onChange={(e) => setUseDefaultKeys(e.target.checked)}
              />
              {t('paymentAction.useDefaultKeys')}
              <span className="text-xs font-normal text-slate-400">(123.pfx, abc.cer)</span>
            </label>

            {!useDefaultKeys && (
              <>
                <div>
                  <label className="label">🔐 {t('paymentAction.privateKey')}</label>
                  <input
                    type="file"
                    accept=".pfx,.p12,.pem,.key,.der"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                    onChange={(e) => setPrivateKeyFile(e.target.files?.[0] || null)}
                  />
                  {privateKeyFile && <p className="mt-1 text-xs text-slate-500">{privateKeyFile.name}</p>}
                </div>
                <div>
                  <label className="label">📄 {t('paymentAction.publicCert')}</label>
                  <input
                    type="file"
                    accept=".cer,.crt,.pem"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                    onChange={(e) => setPublicCertFile(e.target.files?.[0] || null)}
                  />
                  {publicCertFile && <p className="mt-1 text-xs text-slate-500">{publicCertFile.name}</p>}
                </div>
              </>
            )}

            <div>
              <label className="label">🔑 {t('paymentAction.privateKeyPassword')}</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Request params */}
          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800">📝 {t('paymentAction.requestParams')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Version</label>
                <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} />
              </div>
              <div>
                <label className="label">Merchant ID</label>
                <input className="input" value={mid} onChange={(e) => setMid(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="label mb-0">Invoice No</label>
                  <PasteButton onPaste={(text) => text && setInvoiceNo(text)} />
                </div>
                <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
              <div>
                <label className="label">Action Amount</label>
                <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Process Type</label>
                <select className="input" value={processType} onChange={(e) => setProcessType(e.target.value)}>
                  {PROCESS_TYPE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Timestamp (ddMMyyHHmmss)</label>
                <div className="flex gap-2">
                  <input className="input" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
                  <button
                    type="button"
                    onClick={() => setTimestamp(generateTimestamp())}
                    className="btn-secondary whitespace-nowrap"
                  >
                    ↻
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Recurring Unique ID</label>
                <input className="input" value={recurringId} onChange={(e) => setRecurringId(e.target.value)} />
              </div>
              {showNotify && (
                <div className="sm:col-span-2">
                  <label className="label">Notify URL</label>
                  <input className="input" value={notifyURL} onChange={(e) => setNotifyURL(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* Optional info */}
          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span>➕ {t('paymentAction.optionalInfo')}</span>
              <span className="text-slate-400">{showOptional ? '−' : '+'}</span>
            </button>
            {showOptional && (
              <div className="space-y-4 border-t border-slate-100 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="input" placeholder="Bank Code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
                  <input className="input" placeholder="Account Name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                  <input className="input" placeholder="Account Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                  <input className="input" placeholder="Idempotency ID" value={idempotencyId} onChange={(e) => setIdempotencyId(e.target.value)} />
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{t('paymentAction.userDefined')}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {userDefined.map((v, i) => (
                      <input
                        key={i}
                        className="input"
                        placeholder={`userDefined${i + 1}`}
                        value={v}
                        onChange={(e) => setUd(i, e.target.value)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">{t('paymentAction.subMerchantList')}</p>
                  <label className="label">{t('paymentAction.subMerchantCount')}</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    className="input sm:w-40"
                    value={subMerchants.length}
                    onChange={(e) => setSubCount(e.target.value)}
                  />
                  <div className="mt-3 space-y-3">
                    {subMerchants.map((s, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="mb-2 text-sm font-semibold text-slate-700">Sub Merchant #{i + 1}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input className="input" placeholder="subMID" value={s.subMID} onChange={(e) => updateSub(i, { subMID: e.target.value })} />
                          <input className="input" placeholder="subAmount" value={s.subAmount} onChange={(e) => updateSub(i, { subAmount: e.target.value })} />
                        </div>
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={s.loyaltyEnabled}
                            onChange={(e) => updateSub(i, { loyaltyEnabled: e.target.checked })}
                          />
                          {t('paymentAction.addLoyaltySub')}
                        </label>
                        {s.loyaltyEnabled && (
                          <LoyaltyEditor
                            value={s.loyalty}
                            onChange={(val) => updateSub(i, { loyalty: val })}
                            title={t('paymentAction.loyaltyRefund')}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={topLoyaltyEnabled}
                      onChange={(e) => setTopLoyaltyEnabled(e.target.checked)}
                    />
                    {t('paymentAction.addLoyaltyTop')}
                  </label>
                  {topLoyaltyEnabled && (
                    <LoyaltyEditor
                      value={topLoyalty}
                      onChange={setTopLoyalty}
                      title={t('paymentAction.loyaltyRefund')}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* XML preview */}
          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">📄 {t('paymentAction.xmlPreview')}</p>
              <CopyButton text={xmlPreview} />
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {xmlPreview}
            </pre>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('paymentAction.sending') : `🔁 ${t('paymentAction.send')}`}
          </button>
        </div>

        {/* ---------------- Results ---------------- */}
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
                </div>
              )}

              {result.jwe && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">🔐 {t('paymentAction.jwe')}</p>
                    <CopyButton text={result.jwe} />
                  </div>
                  <p className="break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-brand-200">
                    {result.jwe}
                  </p>
                </div>
              )}

              {result.jws && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">🖋️ {t('paymentAction.jws')}</p>
                    <CopyButton text={result.jws} />
                  </div>
                  <p className="break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-brand-200">
                    {result.jws}
                  </p>
                </div>
              )}

              {result.rawResponse != null && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">📦 {t('paymentAction.rawResponse')}</p>
                    <CopyButton text={String(result.rawResponse)} />
                  </div>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {String(result.rawResponse)}
                  </pre>
                </div>
              )}

              {result.decryptedXml && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">✅ {t('paymentAction.decryptedResponse')}</p>
                    <CopyButton text={result.decryptedXml} />
                  </div>
                  <DecryptedXmlView xml={result.decryptedXml} />
                  {result.decryptError && (
                    <p className="mt-2 text-xs text-amber-600">⚠️ {result.decryptError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

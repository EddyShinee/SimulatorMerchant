import { useMemo, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import InvoiceCopyBar from '../components/InvoiceCopyBar.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { signJwtHS256, decodeJwtPayload } from '../utils/jwt.js'
import { parseProxyBody, proxyErrorMessage } from '../utils/proxyResponse.js'
import {
  PARAM_CATEGORIES,
  PAYMENT_CHANNEL_OPTIONS,
  DEFAULT_MERCHANT_ID,
  DEFAULT_SECRET_KEY,
  ENVIRONMENTS,
  ENVIRONMENT_OPTIONS,
  generateInvoiceNo,
  generateIdempotencyId,
  omitEmptyFields,
} from '../config/paymentTokenFields.js'
import { getApiOrigin } from '../api/client.js'

// Build the initial raw-value map for every advanced field.
function initialAdvancedValues() {
  const values = {}
  for (const cat of PARAM_CATEGORIES) {
    for (const f of cat.fields) {
      if (f.kind === 'submerchants') continue
      values[f.name] = f.default ?? ''
    }
  }
  // Default the return URLs to this project's own webhook receiver so the
  // callbacks are captured in the Request Inbox.
  const origin = getApiOrigin()
  values.frontendReturnUrl = `${origin}/api/simulator/callback/frontend`
  values.backendReturnUrl = `${origin}/api/simulator/hook/callback-backend`
  return values
}

// ---------------------------------------------------------------------------
// Single advanced field renderer
// ---------------------------------------------------------------------------
function ParamField({ field, value, onChange }) {
  const { t } = useLanguage()
  const { label, kind, options, help } = field

  if (kind === 'select') {
    return (
      <div>
        <label className="label">{label}</label>
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('paymentToken.notSet')}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {help && <p className="mt-1 text-xs text-slate-400">{help}</p>}
      </div>
    )
  }

  if (kind === 'bool') {
    return (
      <div>
        <label className="label">{label}</label>
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('paymentToken.notSet')}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    )
  }

  if (kind === 'json') {
    return (
      <div>
        <label className="label">{label}</label>
        <textarea
          className="input min-h-[110px] font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder='{ "key": "value" }'
        />
      </div>
    )
  }

  const placeholder =
    kind === 'list_csv'
      ? 'a, b, c'
      : kind === 'list_int_csv'
      ? '3, 6, 12'
      : kind === 'int' || kind === 'float'
      ? '123'
      : ''

  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {help && <p className="mt-1 text-xs text-slate-400">{help}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub Merchants editor
// ---------------------------------------------------------------------------
function SubMerchants({ count, setCount, rows, setRows }) {
  const { t } = useLanguage()

  const updateRow = (idx, key, val) => {
    setRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: val }
      return next
    })
  }

  const handleCount = (n) => {
    const num = Math.max(0, Math.min(20, Number(n) || 0))
    setCount(num)
    setRows((prev) => {
      const next = [...prev]
      while (next.length < num) next.push({})
      next.length = num
      return next
    })
  }

  return (
    <div className="md:col-span-2">
      <label className="label">Sub Merchants</label>
      <input
        type="number"
        min={0}
        max={20}
        className="input mb-3 sm:w-48"
        value={count}
        onChange={(e) => handleCount(e.target.value)}
        placeholder={t('paymentToken.numberOfSubMerchants')}
      />
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">Sub Merchant #{i + 1}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input"
                placeholder="merchantID *"
                value={rows[i]?.merchantID || ''}
                onChange={(e) => updateRow(i, 'merchantID', e.target.value)}
              />
              <input
                className="input"
                placeholder="amount *"
                value={rows[i]?.amount || ''}
                onChange={(e) => updateRow(i, 'amount', e.target.value)}
              />
              <input
                className="input"
                placeholder="invoiceNo *"
                value={rows[i]?.invoiceNo || ''}
                onChange={(e) => updateRow(i, 'invoiceNo', e.target.value)}
              />
              <input
                className="input"
                placeholder="originalAmount"
                value={rows[i]?.originalAmount || ''}
                onChange={(e) => updateRow(i, 'originalAmount', e.target.value)}
              />
              <input
                className="input sm:col-span-2"
                placeholder="description *"
                value={rows[i]?.description || ''}
                onChange={(e) => updateRow(i, 'description', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PaymentToken() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow, recordStep } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  // Environment / endpoint
  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)

  // Basic fields
  const [merchantId, setMerchantId] = useState(flow.merchantId || DEFAULT_MERCHANT_ID)
  const [invoiceNo, setInvoiceNo] = useState('')
  const [idempotencyId, setIdempotencyId] = useState(generateIdempotencyId)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(5000)
  const [currencyCode, setCurrencyCode] = useState('VND')

  // Payment channel
  const [channelMode, setChannelMode] = useState('list')
  const [channelSelected, setChannelSelected] = useState(['ALL'])
  const [channelCustom, setChannelCustom] = useState('')

  // Advanced
  const [advanced, setAdvanced] = useState(initialAdvancedValues)
  const [activeTab, setActiveTab] = useState(PARAM_CATEGORIES[0].id)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sub merchants
  const [subCount, setSubCount] = useState(0)
  const [subRows, setSubRows] = useState([])

  // Secret
  const [secretKey, setSecretKey] = useState(flow.secretKey || DEFAULT_SECRET_KEY)

  // Result
  const [warnings, setWarnings] = useState([])
  const [result, setResult] = useState(null)
  const [showIframe, setShowIframe] = useState(false)

  const setAdvancedValue = (name, val) => setAdvanced((prev) => ({ ...prev, [name]: val }))

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const toggleChannel = (ch) => {
    setChannelSelected((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  // Convert advanced raw values into typed optional fields.
  const buildOptional = () => {
    const out = {}
    const warns = []
    for (const cat of PARAM_CATEGORIES) {
      for (const f of cat.fields) {
        const raw = advanced[f.name]
        switch (f.kind) {
          case 'text': {
            if (raw && raw.trim()) out[f.name] = raw.trim()
            break
          }
          case 'select': {
            if (raw) out[f.name] = raw
            break
          }
          case 'bool': {
            if (raw === 'true') out[f.name] = true
            else if (raw === 'false') out[f.name] = false
            break
          }
          case 'int': {
            if (raw && raw.trim()) {
              const n = Number(raw.trim())
              if (Number.isInteger(n)) out[f.name] = n
              else warns.push(`${f.label}: ${t('paymentToken.mustBeInt')}`)
            }
            break
          }
          case 'float': {
            if (raw && raw.trim()) {
              const n = Number(raw.trim())
              if (!Number.isNaN(n)) out[f.name] = n
              else warns.push(`${f.label}: ${t('paymentToken.mustBeNumber')}`)
            }
            break
          }
          case 'list_csv': {
            const items = (raw || '').split(',').map((v) => v.trim()).filter(Boolean)
            if (items.length) out[f.name] = items
            break
          }
          case 'list_int_csv': {
            const parts = (raw || '').split(',').map((v) => v.trim()).filter(Boolean)
            const items = []
            let ok = true
            for (const p of parts) {
              const n = Number(p)
              if (Number.isInteger(n)) items.push(n)
              else ok = false
            }
            if (!ok) warns.push(`${f.label}: ${t('paymentToken.mustBeInt')}`)
            if (items.length) out[f.name] = items
            break
          }
          case 'json': {
            if (raw && raw.trim()) {
              try {
                const parsed = JSON.parse(raw)
                out[f.name] = parsed
              } catch (e) {
                warns.push(`${f.label}: ${t('paymentToken.invalidJson')}`)
              }
            }
            break
          }
          case 'submerchants': {
            const list = []
            for (let i = 0; i < subCount; i += 1) {
              const r = subRows[i] || {}
              const sub = {}
              if (r.merchantID?.trim()) sub.merchantID = r.merchantID.trim()
              if (r.invoiceNo?.trim()) sub.invoiceNo = r.invoiceNo.trim()
              if (r.description?.trim()) sub.description = r.description.trim()
              for (const fld of ['amount', 'originalAmount']) {
                const v = (r[fld] || '').trim()
                if (!v) continue
                const n = Number(v)
                if (!Number.isNaN(n)) sub[fld] = n
                else warns.push(`Sub Merchant #${i + 1} - ${fld}: ${t('paymentToken.mustBeNumber')}`)
              }
              if (Object.keys(sub).length) list.push(sub)
            }
            if (list.length) out[f.name] = list
            break
          }
          default:
            break
        }
      }
    }
    return { optional: out, warns }
  }

  const handleGenerate = async () => {
    setWarnings([])
    setResult(null)
    setShowIframe(false)

    const finalInvoice = invoiceNo.trim() || generateInvoiceNo()
    const desc = description.trim() || `Eddy - Payment ${finalInvoice}`
    const channel =
      channelMode === 'list'
        ? channelSelected
        : channelCustom.split(',').map((c) => c.trim()).filter(Boolean)

    const { optional, warns } = buildOptional()
    if (warns.length) setWarnings(warns)

    const payload = omitEmptyFields({
      merchantID: merchantId,
      invoiceNo: finalInvoice,
      idempotencyID: idempotencyId,
      description: desc,
      amount: Number(amount),
      currencyCode,
      paymentChannel: channel,
      ...optional,
    })

    // Refresh invoice/idempotency for the next request (like the Python tool)
    setInvoiceNo('')
    setIdempotencyId(generateIdempotencyId())

    const signal = start()
    let jwtToken = null
    try {
      jwtToken = await signJwtHS256(payload, secretKey)
      const { data } = await api.post(
        '/api/simulator/proxy',
        {
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: { payload: jwtToken },
        },
        { signal }
      )

      const respBody = data?.body
      const { decodedResponse } = parseProxyBody(respBody)
      const paymentTokenValue = decodedResponse?.paymentToken

      updateFlow({
        merchantId,
        secretKey,
        invoiceNo: finalInvoice,
        ...(paymentTokenValue ? { paymentToken: paymentTokenValue } : {}),
      })

      setResult({
        payload,
        invoiceNo: finalInvoice,
        jwtToken,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        response: respBody,
        decodedResponse,
        ok: data?.ok,
        error: data?.error ? data?.message : null,
      })

      if (data?.status >= 200 && data?.status < 300) {
        toast.success(t('common.requestSuccess'))
        recordStep('payment-token', 'success', { invoiceNo: finalInvoice })
      } else {
        toast.warning(data?.message || `HTTP ${data?.status}`)
      }
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({
          payload,
          invoiceNo: finalInvoice,
          jwtToken,
          error: t('common.requestCancelled'),
        })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      toast.error(message)
      setResult({
        payload,
        invoiceNo: finalInvoice,
        jwtToken,
        error: message,
      })
    } finally {
      stop()
    }
  }

  const webPaymentUrl = result?.decodedResponse?.webPaymentUrl
  const paymentTokenValue = result?.decodedResponse?.paymentToken
  const resultInvoiceNo = result?.invoiceNo || result?.payload?.invoiceNo
  const iframeModeEnabled = result?.payload?.iframeMode === true

  const openPaymentPopup = () => {
    if (!webPaymentUrl) return
    const width = 480
    const height = 760
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2))
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2))
    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'scrollbars=yes',
      'resizable=yes',
      'noopener=yes',
      'noreferrer=yes',
    ].join(',')
    const popup = window.open(webPaymentUrl, '2c2p-payment-iframe', features)
    if (!popup) {
      toast.warning(t('paymentToken.popupBlocked'))
      setShowIframe(true)
      return
    }
    popup.focus()
  }

  const activeCategory = useMemo(
    () => PARAM_CATEGORIES.find((c) => c.id === activeTab) || PARAM_CATEGORIES[0],
    [activeTab]
  )

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
          POST
        </span>
        <h1 className="text-2xl font-bold text-slate-900">{t('paymentToken.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- Configuration ---------------- */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">
            ⚙️ {t('paymentToken.configuration')}
          </h2>

          {/* Environment */}
          <div className="card space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => handleEnv(e.target.value)}>
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
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

          {/* Basic info */}
          <div className="card space-y-4 p-4">
            <h3 className="font-semibold text-slate-800">{t('paymentToken.basicInfo')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Merchant ID</label>
                <input
                  className="input"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Description</label>
                <input
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Eddy - Payment ..."
                />
              </div>
              <div>
                <label className="label">Invoice No</label>
                <input
                  className="input"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Auto (INVyymmddHHMMSS) nếu để trống"
                />
              </div>
              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Idempotency ID</label>
                <input
                  className="input"
                  value={idempotencyId}
                  onChange={(e) => setIdempotencyId(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Currency Code</label>
                <input
                  className="input"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                />
              </div>
            </div>

            {/* Payment channel */}
            <div>
              <label className="label">{t('paymentToken.paymentChannel')}</label>
              <div className="mb-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {[
                  ['list', t('paymentToken.channelSelectFromList')],
                  ['custom', t('paymentToken.channelCustom')],
                ].map(([mode, lbl]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChannelMode(mode)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      channelMode === mode
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {channelMode === 'list' ? (
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_CHANNEL_OPTIONS.map((ch) => {
                    const active = channelSelected.includes(ch)
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {ch}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <input
                  className="input"
                  value={channelCustom}
                  onChange={(e) => setChannelCustom(e.target.value)}
                  placeholder={t('paymentToken.channelCustomPlaceholder')}
                />
              )}
            </div>
          </div>

          {/* Advanced options */}
          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span>➕ {t('paymentToken.advancedOptions')}</span>
              <span className="text-slate-400">{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="border-t border-slate-100 p-4">
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {PARAM_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveTab(cat.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        activeTab === cat.id
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.title}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {activeCategory.fields.map((field) =>
                    field.kind === 'submerchants' ? (
                      <SubMerchants
                        key={field.name}
                        count={subCount}
                        setCount={setSubCount}
                        rows={subRows}
                        setRows={setSubRows}
                      />
                    ) : (
                      <div
                        key={field.name}
                        className={field.kind === 'json' ? 'sm:col-span-2' : ''}
                      >
                        <ParamField
                          field={field}
                          value={advanced[field.name]}
                          onChange={(val) => setAdvancedValue(field.name, val)}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Secret key */}
          <div className="card p-4">
            <label className="label">🔑 {t('paymentToken.secretKey')}</label>
            <input
              type="password"
              className="input font-mono text-xs"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              <ul className="list-disc pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={handleGenerate} className="btn-primary w-full" disabled={loading}>
            {loading ? t('paymentToken.generating') : `🚀 ${t('paymentToken.generate')}`}
          </button>
        </div>

        {/* ---------------- Results ---------------- */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">📊 {t('paymentToken.results')}</h2>

          {!result ? (
            <div className="card p-8 text-center text-sm text-slate-400">
              {t('paymentToken.noResult')}
            </div>
          ) : (
            <div className="space-y-4">
              <InvoiceCopyBar invoiceNo={resultInvoiceNo} />

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

              <div className="card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">
                    📨 {t('paymentToken.requestPayload')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {resultInvoiceNo && (
                      <CopyButton text={resultInvoiceNo} label={t('paymentToken.copyInvoice')} />
                    )}
                    <CopyButton text={JSON.stringify(result.payload, null, 2)} />
                  </div>
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
                {resultInvoiceNo && (
                  <p className="mt-2 text-xs text-slate-400">
                    Invoice: <span className="font-mono text-slate-500 dark:text-slate-300">{resultInvoiceNo}</span>
                  </p>
                )}
              </div>

              {result.jwtToken && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                      🔏 {t('paymentToken.jwtToken')}
                    </p>
                    <CopyButton text={result.jwtToken} />
                  </div>
                  <p className="break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-brand-200">
                    {result.jwtToken}
                  </p>
                </div>
              )}

              {result.response != null && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                      📬 {t('paymentToken.rawResponse')}
                    </p>
                    <CopyButton
                      text={
                        typeof result.response === 'string'
                          ? result.response
                          : JSON.stringify(result.response, null, 2)
                      }
                    />
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {typeof result.response === 'string'
                      ? result.response
                      : JSON.stringify(result.response, null, 2)}
                  </pre>
                </div>
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
                      <a
                        href={webPaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary"
                      >
                        🌐 {t('paymentToken.openPaymentUrl')}
                      </a>
                    )}
                    {webPaymentUrl && iframeModeEnabled && (
                      <>
                        <button type="button" className="btn-primary" onClick={openPaymentPopup}>
                          🗔 {t('paymentToken.openPopup')}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setShowIframe(true)}>
                          🖼️ {t('paymentToken.openInIframe')}
                        </button>
                      </>
                    )}
                    {paymentTokenValue && (
                      <CopyButton text={paymentTokenValue} />
                    )}
                  </div>
                </div>
              )}

              {showIframe && webPaymentUrl && iframeModeEnabled && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <button
                    type="button"
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px]"
                    aria-label={t('paymentToken.closeIframe')}
                    onClick={() => setShowIframe(false)}
                  />
                  <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          🖼️ {t('paymentToken.iframePreview')}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{webPaymentUrl}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button type="button" className="btn-secondary" onClick={openPaymentPopup}>
                          🗔 {t('paymentToken.openPopup')}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setShowIframe(false)}>
                          {t('paymentToken.closeIframe')}
                        </button>
                      </div>
                    </div>
                    <iframe
                      title={t('paymentToken.iframePreview')}
                      src={webPaymentUrl}
                      className="h-[75vh] w-full min-h-[520px] bg-white"
                      allow="payment *; clipboard-write *"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
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

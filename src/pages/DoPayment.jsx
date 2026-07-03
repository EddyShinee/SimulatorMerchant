import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import PaymentTokenField from '../components/PaymentTokenField.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import { omitEmptyFields } from '../config/paymentTokenFields.js'
import {
  DO_PAYMENT_ENVIRONMENTS,
  DO_PAYMENT_ENV_OPTIONS,
  QR_TYPE_OPTIONS,
  MY2C2P_SDK_URL,
} from '../config/doPaymentConfig.js'
import { PAYMENT_OPTIONS_ENVIRONMENTS } from '../config/paymentOptionsConfig.js'
import { fetchPaymentOptions, fetchAllPaymentOptionDetails, resolveDetailsUrl } from '../utils/paymentChannelApi.js'
import {
  parsePaymentOptions,
  channelSelectionToFlow,
  buildChannelGroups,
} from '../utils/paymentOptionParse.js'
import PaymentChannelPicker from '../components/PaymentChannelPicker.jsx'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load 2C2P SDK'))
    document.body.appendChild(s)
  })
}

// Classify the response "data" field:
//  - acs   : an http(s) link to the 3DS ACS page  -> "Go to ACS Page" button
//  - image : an image URL / data URI / base64 QR   -> show image
//  - qr    : a raw QR string (e.g. EMVCo payload)  -> render a QR code
//  - none  : nothing usable
function classifyResponseData(data, qrType) {
  if (typeof data !== 'string' || !data.trim()) return { type: 'none' }
  const value = data.trim()

  if (/^data:image\//i.test(value)) return { type: 'image', src: value, raw: value }
  if (qrType === 'BASE64') return { type: 'image', src: `data:image/png;base64,${value}`, raw: value }

  if (/^https?:\/\//i.test(value)) {
    const looksImage = /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(value) || qrType === 'URL'
    return looksImage ? { type: 'image', src: value, raw: value } : { type: 'acs', url: value }
  }

  // Non-URL string -> treat as raw QR content
  return { type: 'qr', value }
}

// Render a QR code generated from a raw string (client-side, offline).
function QrDisplay({ value }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, { width: 260, margin: 1 })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(''))
    return () => {
      active = false
    }
  }, [value])
  if (!src) return null
  return (
    <img
      src={src}
      alt="QR code"
      width={260}
      height={260}
      className="rounded-lg border border-slate-200 bg-white p-2"
    />
  )
}

// ---------------------------------------------------------------------------
// 2C2P client-side card encryption (uses the my2c2p SDK)
// ---------------------------------------------------------------------------
function CardEncryption({ cardNumber, expiryMonth, expiryYear, cvv, onEncrypted }) {
  const { t } = useLanguage()
  const formRef = useRef(null)
  const [status, setStatus] = useState(null) // {type, message}
  const [encrypted, setEncrypted] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadScript(MY2C2P_SDK_URL).catch(() =>
      setStatus({ type: 'error', message: 'Unable to load 2C2P encryption SDK.' })
    )
  }, [])

  const handleEncrypt = async () => {
    setStatus(null)
    setEncrypted('')
    try {
      await loadScript(MY2C2P_SDK_URL)
    } catch {
      setStatus({ type: 'error', message: 'Unable to load 2C2P encryption SDK.' })
      return
    }
    if (!window.My2c2p) {
      setStatus({ type: 'error', message: '2C2P SDK not available.' })
      return
    }

    setBusy(true)
    setStatus({ type: 'loading', message: '🔐 Encrypting card data...' })

    window.My2c2p.onSubmitForm('2c2p-payment-form', (errCode, errDesc) => {
      setBusy(false)
      if (errCode !== 0) {
        setStatus({ type: 'error', message: `❌ Encryption failed: ${errDesc} (Code: ${errCode})` })
        return
      }
      const form = formRef.current
      const encInput = form?.querySelector('input[name="encryptedCardInfo"]')
      const token = encInput?.value || ''
      if (token) {
        setEncrypted(token)
        onEncrypted(token)
        setStatus({ type: 'success', message: '✅ Card encrypted. securePayToken auto-filled above.' })
      } else {
        setStatus({ type: 'error', message: 'Encryption succeeded but no token was produced.' })
      }
    })

    formRef.current?.dispatchEvent(new Event('submit'))
  }

  const statusColor = {
    loading: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-sm font-semibold text-slate-700">🧾 {t('doPayment.encryptForm')}</p>

      {/* Hidden form read by the 2C2P SDK */}
      <form id="2c2p-payment-form" ref={formRef} style={{ display: 'none' }}>
        <input type="hidden" data-encrypt="cardnumber" value={(cardNumber || '').replace(/\s/g, '')} readOnly />
        <input type="hidden" data-encrypt="month" value={expiryMonth || ''} readOnly />
        <input type="hidden" data-encrypt="year" value={expiryYear || ''} readOnly />
        <input type="hidden" data-encrypt="cvv" value={cvv || ''} readOnly />
      </form>

      <button type="button" onClick={handleEncrypt} className="btn-primary" disabled={busy}>
        {busy ? t('doPayment.encrypting') : `🔒 ${t('doPayment.encryptCard')}`}
      </button>

      {status && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${statusColor[status.type]}`}>
          {status.message}
        </div>
      )}

      {encrypted && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{t('doPayment.encryptedData')}</span>
            <CopyButton text={encrypted} />
          </div>
          <p className="break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-brand-200">
            {encrypted}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">💡 {t('doPayment.encryptInstruction')}</p>
    </div>
  )
}

export default function DoPayment() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow, recordStep } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  // Environment
  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(DO_PAYMENT_ENVIRONMENTS.sandbox)

  // Basic info
  const [paymentToken, setPaymentToken] = useState(flow.paymentToken || '')
  const [clientId, setClientId] = useState(() => crypto.randomUUID())
  const [clientIp, setClientIp] = useState('47.89.102.11')
  const [locale, setLocale] = useState('en')

  // Channel code
  const [channelCode, setChannelCode] = useState(flow.channelCode || 'CC')
  const [agentCode, setAgentCode] = useState(flow.agentCode || '')
  const [agentChannelCode, setAgentChannelCode] = useState(flow.agentChannelCode || '')

  const [autoFetchBusy, setAutoFetchBusy] = useState(false)
  const [channelGroups, setChannelGroups] = useState(flow.channelGroups || [])
  const [activeChannel, setActiveChannel] = useState(null)
  const [activeContext, setActiveContext] = useState(null)

  // Payment information
  const [customerName, setCustomerName] = useState('NGUYEN VAN A')
  const [customerEmail, setCustomerEmail] = useState('eddy.vu@2c2p.com')
  const [mobileNo, setMobileNo] = useState('1')
  const [mobileNoPrefix, setMobileNoPrefix] = useState('1')
  const [cardEmail, setCardEmail] = useState('eddy.vu@2c2p.com')
  const [ipp, setIpp] = useState(false)
  const [installmentPeriod, setInstallmentPeriod] = useState('')
  const [qrType, setQrType] = useState('')

  // Card details
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111')
  const [expiryMonth, setExpiryMonth] = useState('12')
  const [expiryYear, setExpiryYear] = useState('2029')
  const [cvv, setCvv] = useState('123')
  const [securePayToken, setSecurePayToken] = useState('')
  const [sendCardDetails, setSendCardDetails] = useState(true)
  const [sendSecurePayToken, setSendSecurePayToken] = useState(false)

  useEffect(() => {
    const isCc = channelCode.trim().toUpperCase() === 'CC'
    if (flow.selectedChannelName) {
      setSendCardDetails(Boolean(flow.requiresCard))
    } else {
      setSendCardDetails(isCc)
    }
    if (!isCc) setSendSecurePayToken(false)
  }, [channelCode, flow.requiresCard, flow.selectedChannelName])

  useEffect(() => {
    if (flow.channelCode) setChannelCode(flow.channelCode)
    if (flow.agentCode != null) setAgentCode(flow.agentCode)
    if (flow.agentChannelCode != null) setAgentChannelCode(flow.agentChannelCode)
  }, [flow.channelCode, flow.agentCode, flow.agentChannelCode])

  useEffect(() => {
    if (flow.channelGroups?.length) setChannelGroups(flow.channelGroups)
  }, [flow.channelGroups])

  useEffect(() => {
    if (flow.selectedChannelName && flow.channelCode) {
      setActiveChannel({
        name: flow.selectedChannelName,
        channelCode: flow.channelCode,
        agentCode: flow.agentCode || '',
        agentChannelCode: flow.agentChannelCode || '',
        requiresCard: flow.requiresCard,
      })
      setActiveContext({
        categoryCode: flow.categoryCode,
        groupCode: flow.groupCode,
        categoryName: flow.categoryName,
        groupName: flow.groupName,
      })
    }
  }, [
    flow.selectedChannelName,
    flow.channelCode,
    flow.agentCode,
    flow.agentChannelCode,
    flow.categoryCode,
    flow.groupCode,
    flow.categoryName,
    flow.groupName,
    flow.requiresCard,
  ])

  const handleEncryptedToken = (token) => {
    setSecurePayToken(token)
    setSendSecurePayToken(true)
  }

  // Result
  const [warning, setWarning] = useState('')
  const [result, setResult] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(DO_PAYMENT_ENVIRONMENTS[value])
  }

  const applyChannelFromFlow = (patch) => {
    updateFlow(patch)
    if (patch.channelCode != null) setChannelCode(patch.channelCode)
    if (patch.agentCode != null) setAgentCode(patch.agentCode)
    if (patch.agentChannelCode != null) setAgentChannelCode(patch.agentChannelCode)
  }

  const handleSelectChannel = (channel, context) => {
    setActiveChannel(channel)
    setActiveContext(context)
    applyChannelFromFlow(channelSelectionToFlow(channel, context))
    toast.success(t('doPayment.autoFetchApplied').replace('{name}', channel.name))
  }

  const handleAutoFetchChannel = async () => {
    if (!paymentToken.trim()) {
      toast.warning(t('doPayment.tokenRequired'))
      return
    }

    const optionsUrl =
      env === 'custom' ? PAYMENT_OPTIONS_ENVIRONMENTS.sandbox : PAYMENT_OPTIONS_ENVIRONMENTS[env]
    const detailsUrl = resolveDetailsUrl(env, optionsUrl)

    setAutoFetchBusy(true)

    try {
      const { proxy: optionsProxy } = await fetchPaymentOptions({
        url: optionsUrl,
        paymentToken,
        clientId,
        locale,
      })

      if (!(optionsProxy?.status >= 200 && optionsProxy?.status < 300)) {
        toast.warning(optionsProxy?.message || `Options HTTP ${optionsProxy?.status}`)
        return
      }

      const optionsParsed = parsePaymentOptions(optionsProxy.body)
      if (!optionsParsed.ok || !optionsParsed.categories.length) {
        toast.warning(optionsParsed.respDesc || t('doPayment.autoFetchOptionsFailed'))
        return
      }

      const detailResults = await fetchAllPaymentOptionDetails({
        url: detailsUrl,
        paymentToken,
        categories: optionsParsed.categories,
        clientId,
        locale,
      })

      const groups = buildChannelGroups(optionsParsed.categories, detailResults)
      setChannelGroups(groups)
      updateFlow({ channelGroups: groups, optionCategories: optionsParsed.categories })

      const allChannels = groups.flatMap((g) =>
        (g.channels || []).filter((c) => !c.isDown).map((c) => ({ channel: c, group: g }))
      )

      if (!allChannels.length) {
        toast.warning(t('doPayment.autoFetchAllDown'))
        return
      }

      const preferred =
        allChannels.find(
          ({ channel, group }) =>
            group.categoryCode === flow.categoryCode &&
            group.groupCode === flow.groupCode &&
            channel.name === flow.selectedChannelName
        ) ||
        allChannels.find(({ channel }) => /visa/i.test(channel.name)) ||
        allChannels[0]

      const ctx = {
        categoryCode: preferred.group.categoryCode,
        groupCode: preferred.group.groupCode,
        categoryName: preferred.group.categoryName,
        groupName: preferred.group.groupName,
      }
      setActiveChannel(preferred.channel)
      setActiveContext(ctx)
      applyChannelFromFlow(channelSelectionToFlow(preferred.channel, ctx))
      toast.success(t('doPayment.autoFetchPickChannel'))
    } catch (err) {
      toast.error(proxyErrorMessage(err, t('errors.network')))
    } finally {
      setAutoFetchBusy(false)
    }
  }

  const flowChannelLabel =
    flow.categoryCode && flow.selectedChannelName
      ? `${flow.categoryCode} / ${flow.groupCode} → ${flow.selectedChannelName} (${flow.channelCode})`
      : flow.channelCode
        ? flow.channelCode
        : null

  const pasteToken = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setPaymentToken(text.trim())
      else toast.warning(t('errors.clipboardDenied') || 'Cannot read clipboard')
    } catch {
      toast.error(t('errors.clipboardDenied') || 'Cannot read clipboard')
    }
  }

  const codeJson = omitEmptyFields({
    channelCode,
    agentCode,
    agentChannelCode,
  })

  const buildPaymentData = () => {
    const optional = {}
    if (ipp) {
      optional.interestType = 'Y'
      if (installmentPeriod.trim()) optional.installmentPeriod = installmentPeriod.trim()
    }
    if (qrType) optional.qrType = qrType
    return omitEmptyFields({
      name: customerName,
      cardDetails: { email: cardEmail },
      loyaltyPoints: [],
      email: customerEmail,
      mobileNo,
      mobileNoPrefix,
      ...optional,
    })
  }

  const paymentData = buildPaymentData()

  const handleSend = async () => {
    setWarning('')
    setResult(null)

    if (!paymentToken.trim()) {
      setWarning(t('doPayment.tokenRequired'))
      toast.warning(t('doPayment.tokenRequired'))
      return
    }
    if (!clientId.trim()) {
      setWarning(t('doPayment.clientIdRequired'))
      toast.warning(t('doPayment.clientIdRequired'))
      return
    }

    const paymentBody = { ...paymentData }
    if (sendSecurePayToken && securePayToken.trim()) {
      paymentBody.securePayToken = securePayToken.trim()
    }
    if (sendCardDetails) {
      Object.assign(
        paymentBody,
        omitEmptyFields({
          cardNo: cardNumber ? cardNumber.replace(/\s/g, '') : '',
          expiryMonth,
          expiryYear,
          securityCode: cvv,
        })
      )
    }

    const payload = omitEmptyFields({
      paymentToken: paymentToken.trim(),
      clientID: clientId.trim(),
      clientIP: clientIp,
      locale,
      payment: {
        code: codeJson,
        data: omitEmptyFields(paymentBody),
      },
    })

    const signal = start()
    try {
      const { data } = await api.post(
        '/api/simulator/proxy',
        {
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        },
        { signal }
      )

      const respBody = data?.body
      let respObj = respBody && typeof respBody === 'object' ? respBody : null
      if (!respObj && typeof respBody === 'string') {
        try {
          respObj = JSON.parse(respBody)
        } catch {
          respObj = null
        }
      }
      const dataField = respObj && respObj.data != null ? respObj.data : null

      updateFlow({
        paymentToken: paymentToken.trim(),
        channelCode: channelCode.trim(),
        agentCode: agentCode.trim(),
        agentChannelCode: agentChannelCode.trim(),
      })

      setResult({
        payload,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        response: respBody,
        dataField,
        qrType,
        error: data?.error ? data?.message : null,
      })

      if (data?.status >= 200 && data?.status < 300) {
        toast.success(t('common.requestSuccess'))
        recordStep('do-payment', 'success')
      } else toast.warning(data?.message || `HTTP ${data?.status}`)
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({ payload, error: t('common.requestCancelled') })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setResult({ payload, error: message })
      toast.error(message)
    } finally {
      stop()
    }
  }

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="text-2xl font-bold text-slate-900">💳 {t('doPayment.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- Configuration ---------------- */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">⚙️ {t('paymentToken.configuration')}</h2>

          {/* Environment */}
          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => handleEnv(e.target.value)}>
                  {DO_PAYMENT_ENV_OPTIONS.map((o) => (
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

          {/* Basic info */}
          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800">{t('doPayment.basicInfo')}</h3>
            <PaymentTokenField value={paymentToken} onChange={setPaymentToken} onPaste={pasteToken} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">🧾 Client ID</label>
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
              </div>
              <div>
                <label className="label">📡 Client IP</label>
                <input className="input" value={clientIp} onChange={(e) => setClientIp(e.target.value)} />
              </div>
              <div>
                <label className="label">🌐 Locale</label>
                <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Channel code */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">💰 {t('doPayment.channelCode')}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFetchChannel}
                  disabled={loading || autoFetchBusy}
                  className="rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300"
                >
                  {autoFetchBusy ? t('doPayment.autoFetching') : `⚡ ${t('doPayment.autoFetchChannel')}`}
                </button>
                <CopyButton text={JSON.stringify(codeJson, null, 2)} />
              </div>
            </div>
            {flowChannelLabel && (
              <div className="rounded-lg border border-brand-200 bg-brand-50/80 px-3 py-2 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-200">
                📌 {t('doPayment.flowChannelBadge')}: <span className="font-mono font-semibold">{flowChannelLabel}</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Channel Code</label>
                <input className="input" value={channelCode} onChange={(e) => setChannelCode(e.target.value)} />
              </div>
              <div>
                <label className="label">Agent Code</label>
                <input className="input" value={agentCode} onChange={(e) => setAgentCode(e.target.value)} />
              </div>
              <div>
                <label className="label">Agent Channel Code</label>
                <input
                  className="input"
                  value={agentChannelCode}
                  onChange={(e) => setAgentChannelCode(e.target.value)}
                />
              </div>
            </div>
            <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(codeJson, null, 2)}
            </pre>

            {channelGroups.length > 0 && (
              <PaymentChannelPicker
                groups={channelGroups}
                selected={flow}
                activeChannel={activeChannel}
                activeContext={activeContext}
                onSelect={handleSelectChannel}
              />
            )}
          </div>

          {/* Payment information */}
          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">👤 {t('doPayment.paymentInformation')}</h3>
              <CopyButton text={JSON.stringify(paymentData, null, 2)} />
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
              <div>
                <label className="label">Mobile No</label>
                <input className="input" value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} />
              </div>
              <div>
                <label className="label">Mobile No Prefix</label>
                <input className="input" value={mobileNoPrefix} onChange={(e) => setMobileNoPrefix(e.target.value)} />
              </div>
              <div>
                <label className="label">Card Email</label>
                <input className="input" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">QR Type</label>
                <select className="input" value={qrType} onChange={(e) => setQrType(e.target.value)}>
                  <option value="">{t('paymentToken.notSet')}</option>
                  {QR_TYPE_OPTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={ipp}
                  onChange={(e) => setIpp(e.target.checked)}
                />
                {t('doPayment.ippPayment')} (interestType = Y)
              </label>
              {ipp && (
                <div className="mt-2">
                  <label className="label">{t('doPayment.installmentPeriod')}</label>
                  <input
                    className="input"
                    value={installmentPeriod}
                    onChange={(e) => setInstallmentPeriod(e.target.value)}
                    placeholder="e.g. 3, 6, 12"
                  />
                </div>
              )}
            </div>
            <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(paymentData, null, 2)}
            </pre>
          </div>

          {/* Card details — raw PAN / expiry / CVV */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                💳 {t('doPayment.rawCardDetails')}
              </h3>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-600 dark:bg-slate-800/80">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                  checked={sendCardDetails}
                  onChange={(e) => setSendCardDetails(e.target.checked)}
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('doPayment.sendCardDetails')}
                </span>
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {sendCardDetails ? t('doPayment.sendCardDetailsOn') : t('doPayment.sendCardDetailsOff')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">💳 Card Number</label>
                <input className="input" maxLength={19} value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
              </div>
              <div>
                <label className="label">🔒 CVV / CVC</label>
                <input className="input" type="password" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value)} />
              </div>
              <div>
                <label className="label">📅 Expiry Month (MM)</label>
                <input className="input" maxLength={2} value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} />
              </div>
              <div>
                <label className="label">📅 Expiry Year (YYYY)</label>
                <input className="input" maxLength={4} value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} />
              </div>
            </div>
          </div>

          {/* 2C2P encryption → securePayToken (independent from raw card fields) */}
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                🔐 {t('doPayment.securePaySection')}
              </h3>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-600 dark:bg-slate-800/80">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                  checked={sendSecurePayToken}
                  onChange={(e) => setSendSecurePayToken(e.target.checked)}
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('doPayment.sendSecurePayToken')}
                </span>
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {sendSecurePayToken ? t('doPayment.sendSecurePayTokenOn') : t('doPayment.sendSecurePayTokenOff')}
            </p>
            <div>
              <label className="label">🔐 securePayToken</label>
              <input
                className="input font-mono text-xs"
                value={securePayToken}
                onChange={(e) => setSecurePayToken(e.target.value)}
                placeholder="Auto-filled after encryption, or paste manually"
              />
            </div>
            {cardNumber && expiryMonth && expiryYear && cvv ? (
              <CardEncryption
                cardNumber={cardNumber}
                expiryMonth={expiryMonth}
                expiryYear={expiryYear}
                cvv={cvv}
                onEncrypted={handleEncryptedToken}
              />
            ) : (
              <p className="text-xs text-slate-400">{t('doPayment.encryptNeedsCard')}</p>
            )}
          </div>

          {warning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              ⚠️ {warning}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('doPayment.sending') : `🚀 ${t('doPayment.sendRequest')}`}
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
                  {result.error && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      {result.error}
                    </span>
                  )}
                </div>
              )}

              <div className="card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">📨 {t('paymentToken.requestPayload')}</p>
                  <CopyButton text={JSON.stringify(result.payload, null, 2)} />
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </div>

              {result.response != null && (
                <div className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">📬 {t('paymentToken.rawResponse')}</p>
                    <CopyButton
                      text={
                        typeof result.response === 'string'
                          ? result.response
                          : JSON.stringify(result.response, null, 2)
                      }
                    />
                  </div>
                  <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {typeof result.response === 'string'
                      ? result.response
                      : JSON.stringify(result.response, null, 2)}
                  </pre>
                </div>
              )}

              {(() => {
                const cls = classifyResponseData(result.dataField, result.qrType)
                if (cls.type === 'acs') {
                  return (
                    <div className="card p-4">
                      <p className="mb-2 text-sm font-semibold text-slate-700">
                        🔗 {t('doPayment.nextStep')}
                      </p>
                      <a href={cls.url} target="_blank" rel="noreferrer" className="btn-primary">
                        ➡️ {t('doPayment.goAcs')}
                      </a>
                      <p className="mt-2 break-all text-xs text-slate-400">{cls.url}</p>
                    </div>
                  )
                }
                if (cls.type === 'image') {
                  return (
                    <div className="card p-4">
                      <p className="mb-3 text-sm font-semibold text-slate-700">
                        📱 {t('doPayment.qrCode')}
                      </p>
                      <img
                        src={cls.src}
                        alt="QR"
                        className="mx-auto max-w-[280px] rounded-lg border border-slate-200 bg-white p-2"
                      />
                    </div>
                  )
                }
                if (cls.type === 'qr') {
                  return (
                    <div className="card p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">
                          📱 {t('doPayment.qrCode')}
                        </p>
                        <CopyButton text={cls.value} />
                      </div>
                      <div className="flex justify-center">
                        <QrDisplay value={cls.value} />
                      </div>
                      <p className="mt-3 break-all rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-500">
                        {cls.value}
                      </p>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

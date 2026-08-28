import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CodeBlock from '../components/CodeBlock.jsx'
import CopyButton from '../components/CopyButton.jsx'
import JsonResultCard from '../components/JsonResultCard.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import PaymentTokenField from '../components/PaymentTokenField.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import { omitEmptyFields } from '../config/paymentTokenFields.js'
import {
  DO_PAYMENT_ENVIRONMENTS,
  DO_PAYMENT_ENV_OPTIONS,
  QR_TYPE_OPTIONS,
  INTEREST_TYPE_OPTIONS,
  INSTALLMENT_PERIOD_OPTIONS,
  MY2C2P_SDK_URL,
  isWalletChannel,
  isCardChannel,
  isGooglePayChannel,
  isApplePayChannel,
  isDirectWalletChannel,
  WALLET_CHANNEL_QUICK_PICKS,
  buildResponseReturnUrl,
  effectiveDoPaymentEnv,
  doPaymentEnvLabel,
  inferPaymentTokenEnvFromFlow,
} from '../config/doPaymentConfig.js'
import { PAYMENT_OPTIONS_ENVIRONMENTS } from '../config/paymentOptionsConfig.js'
import { fetchPaymentOptions, fetchAllPaymentOptionDetails, resolveDetailsUrl } from '../utils/paymentChannelApi.js'
import {
  parsePaymentOptions,
  channelSelectionToFlow,
  buildChannelGroups,
} from '../utils/paymentOptionParse.js'
import PaymentChannelPicker from '../components/PaymentChannelPicker.jsx'
import GooglePayButton from '../components/GooglePayButton.jsx'
import ApplePayButton from '../components/ApplePayButton.jsx'
import { DEFAULT_MERCHANT_ID } from '../config/paymentTokenFields.js'
import {
  GOOGLE_PAY_ENV_OPTIONS,
  encodeGooglePayTokenFor2C2P,
  googlePayEnvironmentForDoPaymentEnv,
} from '../utils/googlePay.js'
import {
  countryCodeForCurrency,
  encodeApplePayTokenFor2C2P,
  applePayMerchantValidationUrl,
  getApplePayPageDomain,
  isLikelyUnregisteredApplePayDomain,
  paymentTokenSupportsApplePay,
} from '../utils/applePay.js'

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
      className="mx-auto h-auto w-full max-w-[260px] rounded-lg border border-slate-200 bg-white p-2"
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

  // Environment — default to Payment Token env so Apple/Google validation matches token origin
  const [env, setEnv] = useState(() => inferPaymentTokenEnvFromFlow(flow) || 'sandbox')
  const [apiUrl, setApiUrl] = useState(() => {
    const initialEnv = inferPaymentTokenEnvFromFlow(flow) || 'sandbox'
    if (initialEnv !== 'custom' && DO_PAYMENT_ENVIRONMENTS[initialEnv]) {
      return DO_PAYMENT_ENVIRONMENTS[initialEnv]
    }
    if (flow.paymentTokenApiUrl) return flow.paymentTokenApiUrl
    return DO_PAYMENT_ENVIRONMENTS.sandbox
  })

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
  const [customerName, setCustomerName] = useState(flow.paymentCustomerName || 'NGUYEN VAN A')
  const [customerEmail, setCustomerEmail] = useState(flow.paymentCustomerEmail || 'eddy.vu@2c2p.com')
  const [mobileNo, setMobileNo] = useState('1')
  const [mobileNoPrefix, setMobileNoPrefix] = useState('1')
  const [cardEmail, setCardEmail] = useState(flow.paymentCustomerEmail || 'eddy.vu@2c2p.com')
  const [isIppChosen, setIsIppChosen] = useState(true)
  const [installmentPeriod, setInstallmentPeriod] = useState('3')
  const [interestType, setInterestType] = useState('M')
  const [qrType, setQrType] = useState('')

  // Token pay: wallet (Zalo/MoMo) or card (CC) — same payload shape
  const [tokenPayMode, setTokenPayMode] = useState('none')
  const [responseReturnUrl, setResponseReturnUrl] = useState(
    () => flow.webPaymentUrl || buildResponseReturnUrl(flow.paymentToken, 'sandbox')
  )
  const [customerToken, setCustomerToken] = useState(flow.customerToken || '')
  const [accountNo, setAccountNo] = useState(flow.accountNo || '')
  const [tokenCardName, setTokenCardName] = useState(flow.paymentCustomerName || '')
  const [tokenCardExpiry, setTokenCardExpiry] = useState('XX/XX')
  const [tokenCardBrand, setTokenCardBrand] = useState('')
  const [tokenCardStatus, setTokenCardStatus] = useState('A')
  const [tokenSubChannelCode, setTokenSubChannelCode] = useState('')
  const [tokenIconUrl, setTokenIconUrl] = useState('')
  const [tokenLogoUrl, setTokenLogoUrl] = useState('')
  const [accountTokenization, setAccountTokenization] = useState(true)

  // Card details
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111')
  const [expiryMonth, setExpiryMonth] = useState('12')
  const [expiryYear, setExpiryYear] = useState('2029')
  const [cvv, setCvv] = useState('123')
  const [securePayToken, setSecurePayToken] = useState('')
  const [sendCardDetails, setSendCardDetails] = useState(true)
  const [sendSecurePayToken, setSendSecurePayToken] = useState(false)

  // Google Pay Direct API (2C2P)
  const [googlePayToken, setGooglePayToken] = useState('')
  const [googlePayEnv, setGooglePayEnv] = useState(() => googlePayEnvironmentForDoPaymentEnv('sandbox'))
  const [gatewayMerchantId, setGatewayMerchantId] = useState(flow.merchantId || DEFAULT_MERCHANT_ID)
  const [googleMerchantId, setGoogleMerchantId] = useState('')
  const [googleMerchantName, setGoogleMerchantName] = useState('2C2P Test Merchant')
  const [gpayAmount, setGpayAmount] = useState(flow.amount ?? 5000)
  const [gpayCurrency, setGpayCurrency] = useState(flow.currencyCode || 'VND')
  const [googlePayReady, setGooglePayReady] = useState(false)

  // Apple Pay Direct API (2C2P)
  const [applePayToken, setApplePayToken] = useState('')
  const [applePayCountryCode, setApplePayCountryCode] = useState(
    () => countryCodeForCurrency(flow.currencyCode || 'VND')
  )
  const [applePayDisplayName, setApplePayDisplayName] = useState('2C2P Test Merchant')
  const [applePayReady, setApplePayReady] = useState(false)

  const isIppChannel = channelCode.trim().toUpperCase() === 'IPP'
  const isTokenPay = tokenPayMode === 'token'
  const channelUpper = channelCode.trim().toUpperCase()
  const isWalletCh = isWalletChannel(channelUpper)
  const isCardCh = isCardChannel(channelUpper)
  const isGooglePayCh = isGooglePayChannel(channelUpper)
  const isApplePayCh = isApplePayChannel(channelUpper)
  const isDirectWalletCh = isDirectWalletChannel(channelUpper)

  const effectiveEnv = effectiveDoPaymentEnv(env, apiUrl)
  const tokenOriginEnv = inferPaymentTokenEnvFromFlow(flow)
  const envMismatch =
    Boolean(tokenOriginEnv && paymentToken.trim() && effectiveEnv !== tokenOriginEnv)
  const appleValidationUrl = useMemo(
    () => applePayMerchantValidationUrl(env, apiUrl),
    [env, apiUrl]
  )
  const applePayTokenChannelOk = paymentTokenSupportsApplePay(flow.paymentChannels)
  const applePayChannelKnown = Array.isArray(flow.paymentChannels) && flow.paymentChannels.length > 0
  const applePayPageDomain = getApplePayPageDomain()
  const applePayDomainRisk = isLikelyUnregisteredApplePayDomain(applePayPageDomain)

  const syncEnvFromPaymentToken = () => {
    const target = inferPaymentTokenEnvFromFlow(flow) || 'sandbox'
    setEnv(target)
    if (target !== 'custom') {
      setApiUrl(DO_PAYMENT_ENVIRONMENTS[target] || DO_PAYMENT_ENVIRONMENTS.sandbox)
    } else if (flow.paymentTokenApiUrl) {
      setApiUrl(flow.paymentTokenApiUrl)
    }
    toast.success(t('doPayment.syncPaymentTokenEnvDone'))
  }

  const handleGooglePayToken = useCallback(
    (token) => {
      setGooglePayToken(token)
      toast.success(t('doPayment.googlePayTokenCaptured'))
    },
    [toast, t]
  )

  const handleGooglePayError = useCallback(
    (err) => {
      const msg = err?.statusMessage || err?.message || String(err)
      toast.warning(msg)
    },
    [toast]
  )

  const handleApplePayToken = useCallback(
    (token) => {
      setApplePayToken(token)
      toast.success(t('doPayment.applePayTokenCaptured'))
    },
    [toast, t]
  )

  const handleApplePayError = useCallback(
    (err) => {
      if (err?.applePayErrorKind === 'domain') {
        toast.warning(
          t('doPayment.applePayError9112Domain').replace(
            '{domain}',
            err.applePayPageDomain || getApplePayPageDomain() || '—'
          )
        )
        return
      }
      if (err?.applePayErrorKind === 'channel') {
        toast.warning(t('doPayment.applePayError9112Channel'))
        return
      }
      const msg = err?.statusMessage || err?.message || String(err)
      toast.warning(msg)
    },
    [toast, t]
  )

  const applyTokenPayMode = (mode) => {
    setTokenPayMode(mode)
    if (mode === 'token') {
      if (!responseReturnUrl.trim() && paymentToken.trim()) {
        setResponseReturnUrl(buildResponseReturnUrl(paymentToken, env))
      }
      if (flow.channelCode && isWalletChannel(flow.channelCode)) {
        setChannelCode(flow.channelCode)
        setQrType((prev) => prev || 'URL')
      }
    }
  }

  useEffect(() => {
    setGooglePayEnv(googlePayEnvironmentForDoPaymentEnv(env))
  }, [env])

  useEffect(() => {
    if (flow.merchantId) setGatewayMerchantId(flow.merchantId)
    if (flow.amount != null) setGpayAmount(flow.amount)
    if (flow.currencyCode) {
      setGpayCurrency(flow.currencyCode)
      setApplePayCountryCode(countryCodeForCurrency(flow.currencyCode))
    }
  }, [flow.merchantId, flow.amount, flow.currencyCode])

  useEffect(() => {
    const channels = Array.isArray(flow.paymentChannels) ? flow.paymentChannels : []
    const direct = channels.find((c) => isDirectWalletChannel(String(c || '')))
    if (direct) {
      const upper = String(direct).toUpperCase()
      setChannelCode(upper)
    }
  }, [flow.paymentChannels])

  useEffect(() => {
    const code = channelCode.trim().toUpperCase()
    const isCc = code === 'CC'
    const isIpp = code === 'IPP'
    if (tokenPayMode === 'token') {
      setSendCardDetails(false)
      if (isWalletChannel(code)) {
        setQrType((prev) => prev || 'URL')
        setTokenSubChannelCode((prev) => prev || code)
      }
      if (isCardChannel(code)) {
        setSendSecurePayToken(true)
      }
      return
    }
    setSendSecurePayToken(false)
    if (flow.selectedChannelName) {
      setSendCardDetails(Boolean(flow.requiresCard))
    } else {
      setSendCardDetails(isCc)
    }
    if (isIpp) {
      setIsIppChosen(true)
      setSendSecurePayToken(true)
      setInstallmentPeriod((prev) => prev || '3')
      setInterestType((prev) => prev || 'M')
    } else if (!isCc) {
      setSendSecurePayToken(false)
    }
  }, [channelCode, flow.requiresCard, flow.selectedChannelName, tokenPayMode])

  useEffect(() => {
    if (flow.channelCode) setChannelCode(flow.channelCode)
    if (flow.agentCode != null) setAgentCode(flow.agentCode)
    if (flow.agentChannelCode != null) setAgentChannelCode(flow.agentChannelCode)
  }, [flow.channelCode, flow.agentCode, flow.agentChannelCode])

  useEffect(() => {
    if (flow.paymentToken) setPaymentToken(flow.paymentToken)
  }, [flow.paymentToken])

  useEffect(() => {
    if (flow.customerToken) setCustomerToken(flow.customerToken)
    if (flow.paymentCustomerName) {
      setCustomerName(flow.paymentCustomerName)
      setTokenCardName((prev) => prev || flow.paymentCustomerName)
    }
    if (flow.paymentCustomerEmail) {
      setCustomerEmail(flow.paymentCustomerEmail)
      setCardEmail(flow.paymentCustomerEmail)
    }
    if (flow.accountNo) setAccountNo(flow.accountNo)
    if (flow.webPaymentUrl) {
      setResponseReturnUrl(flow.webPaymentUrl)
    } else if (flow.paymentToken) {
      setResponseReturnUrl((prev) => prev || buildResponseReturnUrl(flow.paymentToken, env))
    }

    const code = String(flow.channelCode || '').toUpperCase()
    if (isWalletChannel(code)) {
      setTokenSubChannelCode((prev) => prev || code)
    }
  }, [
    flow.customerToken,
    flow.paymentCustomerName,
    flow.paymentCustomerEmail,
    flow.accountNo,
    flow.webPaymentUrl,
    flow.paymentToken,
    flow.channelCode,
    env,
  ])

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

  const handleChannelCodeChange = (value) => {
    setChannelCode(value)
    const upper = String(value || '').trim().toUpperCase()
    if (upper) updateFlow({ channelCode: upper })
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

  const hostedPaymentPageUrl =
    (flow.webPaymentUrl || responseReturnUrl || buildResponseReturnUrl(paymentToken, env)).trim() ||
    ''

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
    if (isGooglePayCh) {
      return omitEmptyFields({
        token: encodeGooglePayTokenFor2C2P(googlePayToken),
        name: customerName,
        email: customerEmail,
      })
    }

    if (isApplePayCh) {
      return omitEmptyFields({
        token: encodeApplePayTokenFor2C2P(applePayToken),
        name: customerName,
        email: customerEmail,
      })
    }

    const optional = {}
    if (isIppChannel && !isTokenPay) {
      optional.isIppChosen = isIppChosen
      if (interestType) optional.interestType = interestType
      const period = Number.parseInt(String(installmentPeriod).trim(), 10)
      if (Number.isInteger(period) && period > 0) optional.installmentPeriod = period
    }
    if (qrType && !isTokenPay) optional.qrType = qrType

    // Unified token pay (wallet Zalo/MoMo or card CC) — same core shape
    if (isTokenPay) {
      const token = customerToken.trim()
      const ch = channelUpper || 'CC'
      const wallet = isWalletChannel(ch)

      let cardDetails
      if (token) {
        cardDetails = omitEmptyFields({
          token,
          name: (tokenCardName || customerName).trim() || undefined,
          expiry: tokenCardExpiry.trim() || 'XX/XX',
          channelCode: ch,
          subChannelCode: tokenSubChannelCode.trim() || (wallet ? ch : ''),
          cardBrand: tokenCardBrand.trim() || undefined,
          status: tokenCardStatus.trim() || 'A',
          iconUrl: tokenIconUrl.trim() || undefined,
          logoUrl: tokenLogoUrl.trim() || undefined,
        })
      } else if (isCardCh && accountTokenization) {
        cardDetails = {}
      }

      const data = omitEmptyFields({
        name: customerName,
        loyaltyPoints: [],
        ...(wallet
          ? {
              email: customerEmail,
              mobileNo,
              mobileNoPrefix,
              accountNo: accountNo.trim() || undefined,
              ...(qrType ? { qrType } : {}),
            }
          : {}),
        ...(isCardCh
          ? {
              isIppChosen: false,
              ...(accountTokenization ? { accountTokenization: true } : {}),
            }
          : {}),
        ...(token ? { customerToken: token } : {}),
      })

      if (cardDetails !== undefined) data.cardDetails = cardDetails
      return data
    }

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

  const paymentDataPreview = (() => {
    const body = { ...paymentData }
    if (isTokenPay && isCardCh && sendSecurePayToken && securePayToken.trim()) {
      body.securePayToken = securePayToken.trim()
    } else if (!isTokenPay && sendSecurePayToken && securePayToken.trim()) {
      body.securePayToken = securePayToken.trim()
    }
    return body
  })()

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
    if (isTokenPay && isWalletCh && !customerToken.trim()) {
      setWarning(t('doPayment.customerTokenRequired'))
      toast.warning(t('doPayment.customerTokenRequired'))
      return
    }
    if (isTokenPay && isCardCh && !customerToken.trim() && !securePayToken.trim()) {
      setWarning(t('doPayment.tokenOrSecurePayRequired'))
      toast.warning(t('doPayment.tokenOrSecurePayRequired'))
      return
    }
    if (isGooglePayCh && !googlePayToken.trim()) {
      setWarning(t('doPayment.googlePayTokenRequired'))
      toast.warning(t('doPayment.googlePayTokenRequired'))
      return
    }
    if (isGooglePayCh && googlePayEnv === 'PRODUCTION' && !googleMerchantId.trim()) {
      setWarning(t('doPayment.googleMerchantIdRequired'))
      toast.warning(t('doPayment.googleMerchantIdRequired'))
      return
    }
    if (isApplePayCh && !applePayToken.trim()) {
      setWarning(t('doPayment.applePayTokenRequired'))
      toast.warning(t('doPayment.applePayTokenRequired'))
      return
    }

    const paymentBody = { ...paymentData }
    if (isTokenPay && isCardCh && sendSecurePayToken && securePayToken.trim()) {
      paymentBody.securePayToken = securePayToken.trim()
    } else if (!isTokenPay && sendSecurePayToken && securePayToken.trim()) {
      paymentBody.securePayToken = securePayToken.trim()
    }
    if (!isTokenPay && !isDirectWalletCh && sendCardDetails) {
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
      responseReturnUrl: responseReturnUrl.trim() || undefined,
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
        customerToken: customerToken.trim(),
        paymentCustomerName: customerName.trim(),
        paymentCustomerEmail: customerEmail.trim(),
        accountNo: accountNo.trim(),
        webPaymentUrl: responseReturnUrl.trim() || flow.webPaymentUrl || '',
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
        <h1 className="page-title">💳 {t('doPayment.title')}</h1>
      </div>

      <div className="split-panel">
        {/* ---------------- Configuration ---------------- */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">⚙️ {t('paymentToken.configuration')}</h2>

          {/* Environment */}
          <div className="card p-4">
            {envMismatch ? (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                <p>
                  {t('doPayment.envMismatchWarning')
                    .replace('{tokenEnv}', doPaymentEnvLabel(tokenOriginEnv))
                    .replace('{currentEnv}', doPaymentEnvLabel(effectiveEnv))}
                </p>
                <button
                  type="button"
                  className="mt-2 font-semibold text-brand-700 underline dark:text-brand-300"
                  onClick={syncEnvFromPaymentToken}
                >
                  {t('doPayment.syncPaymentTokenEnv')}
                </button>
              </div>
            ) : null}
            <div className="form-grid-3">
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
              <div className="sm:col-span-2">
                <label className="label">{t('doPayment.responseReturnUrl')}</label>
                <input
                  className="input font-mono text-xs"
                  value={responseReturnUrl}
                  onChange={(e) => setResponseReturnUrl(e.target.value)}
                  placeholder="https://sandbox-pgw-ui.2c2p.com/payment/4.3/#/info/…"
                />
                <p className="mt-1 text-[11px] text-slate-400">{t('doPayment.responseReturnUrlHint')}</p>
              </div>
            </div>
            {!isDirectWalletCh && (
            <div>
              <label className="label">{t('doPayment.tokenPayMode')}</label>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-sm font-semibold ${
                    !isTokenPay ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {t('doPayment.tokenPayNormalLabel')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isTokenPay}
                  aria-label={t('doPayment.tokenPayMode')}
                  onClick={() => applyTokenPayMode(isTokenPay ? 'none' : 'token')}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    isTokenPay ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      isTokenPay ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
                <span
                  className={`text-sm font-semibold ${
                    isTokenPay ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {t('doPayment.tokenPayTokenLabel')}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {isTokenPay ? t('doPayment.tokenPayUnifiedHint') : t('doPayment.tokenPayNoneHint')}
              </p>
            </div>
            )}
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
            <div className="form-grid-3">
              <div>
                <label className="label">Channel Code</label>
                <input
                  className="input font-mono"
                  value={channelCode}
                  onChange={(e) => handleChannelCodeChange(e.target.value)}
                />
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('doPayment.walletChannelQuickPick')}
              </span>
              {WALLET_CHANNEL_QUICK_PICKS.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleChannelCodeChange(code)}
                  className={`rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition ${
                    channelUpper === code
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-950/50 dark:text-brand-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            {isDirectWalletCh && (
              <div className="rounded-lg border-2 border-brand-400 bg-brand-50/90 px-3 py-2 text-xs font-semibold text-brand-900 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-100">
                {isApplePayCh ? t('doPayment.applePayPanelActive') : t('doPayment.googlePayPanelActive')}
              </div>
            )}
            <CodeBlock maxHeight="max-h-60">{JSON.stringify(codeJson, null, 2)}</CodeBlock>

            {isGooglePayCh && (
              <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/30 p-4 dark:border-violet-800 dark:bg-violet-950/20">
                <h4 className="font-semibold text-slate-800 dark:text-slate-100">{t('doPayment.googlePaySection')}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('doPayment.googlePayHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">{t('doPayment.googlePayEnvironment')}</label>
                    <select
                      className="input font-mono text-xs"
                      value={googlePayEnv}
                      onChange={(e) => setGooglePayEnv(e.target.value)}
                    >
                      {GOOGLE_PAY_ENV_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('doPayment.gatewayMerchantId')}</label>
                    <input
                      className="input font-mono text-xs"
                      value={gatewayMerchantId}
                      onChange={(e) => setGatewayMerchantId(e.target.value)}
                      placeholder={DEFAULT_MERCHANT_ID}
                    />
                  </div>
                  <div>
                    <label className="label">{t('doPayment.gpayAmount')}</label>
                    <input
                      className="input font-mono text-xs"
                      type="number"
                      value={gpayAmount}
                      onChange={(e) => setGpayAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">{t('doPayment.gpayCurrency')}</label>
                    <input
                      className="input font-mono text-xs"
                      value={gpayCurrency}
                      onChange={(e) => setGpayCurrency(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
                <GooglePayButton
                  environment={googlePayEnv}
                  gatewayMerchantId={gatewayMerchantId}
                  googleMerchantId={googleMerchantId}
                  googleMerchantName={googleMerchantName}
                  amount={gpayAmount}
                  currencyCode={gpayCurrency}
                  disabled={!gatewayMerchantId.trim()}
                  loadingMessage={t('doPayment.googlePayLoading')}
                  notReadyMessage={googlePayReady ? '' : t('doPayment.googlePayNotReady')}
                  onReadyChange={setGooglePayReady}
                  onToken={handleGooglePayToken}
                  onError={handleGooglePayError}
                />
                <div>
                  <label className="label">{t('doPayment.googlePayToken')}</label>
                  <textarea
                    className="input min-h-[80px] font-mono text-xs"
                    value={googlePayToken}
                    onChange={(e) => setGooglePayToken(e.target.value)}
                    placeholder={t('doPayment.googlePayTokenPlaceholder')}
                  />
                </div>
              </div>
            )}

            {isApplePayCh && (
              <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/30 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                <h4 className="font-semibold text-slate-800 dark:text-slate-100">{t('doPayment.applePaySection')}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('doPayment.applePayHint')}</p>
                {applePayChannelKnown && !applePayTokenChannelOk ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
                    <p className="font-semibold">{t('doPayment.applePayWrongChannelTitle')}</p>
                    <p className="mt-1">{t('doPayment.applePayWrongChannelBody')}</p>
                    <p className="mt-1 font-mono text-[10px] opacity-90">
                      {t('doPayment.applePayWrongChannelChannels').replace(
                        '{channels}',
                        flow.paymentChannels.join(', ')
                      )}
                    </p>
                  </div>
                ) : null}
                {!applePayChannelKnown && paymentToken.trim() ? (
                  <p className="text-xs text-amber-800 dark:text-amber-200">{t('doPayment.applePayUnknownChannel')}</p>
                ) : null}
                {applePayPageDomain ? (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      applePayDomainRisk
                        ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
                        : 'border-slate-200 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
                    }`}
                  >
                    <p className="font-semibold">{t('doPayment.applePayPageDomain')}</p>
                    <p className="mt-1 font-mono text-[11px]">{applePayPageDomain}</p>
                    {applePayDomainRisk ? (
                      <p className="mt-2 text-[11px] leading-relaxed">{t('doPayment.applePayDomainRisk')}</p>
                    ) : null}
                  </div>
                ) : null}
                {hostedPaymentPageUrl ? (
                  <div className="rounded-lg border border-sky-300/80 bg-white/70 px-3 py-2 text-xs dark:border-sky-700 dark:bg-slate-900/50">
                    <p className="font-semibold">{t('doPayment.applePayHostedPageTitle')}</p>
                    <p className="mt-1 text-[11px] opacity-90">{t('doPayment.applePayHostedPageHint')}</p>
                    <a
                      href={hostedPaymentPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block font-semibold text-brand-700 underline dark:text-brand-300"
                    >
                      {t('doPayment.openHostedPaymentPage')}
                    </a>
                  </div>
                ) : null}
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Direct API — {t('doPayment.applePayDirectApiLabel')}
                </p>
                <div className="rounded border border-slate-200 bg-white/80 px-2 py-1.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                  {t('doPayment.applePayValidationEnv')
                    .replace('{env}', doPaymentEnvLabel(effectiveEnv))
                    .replace('{url}', appleValidationUrl)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">{t('doPayment.gpayAmount')}</label>
                    <input
                      className="input font-mono text-xs"
                      type="number"
                      value={gpayAmount}
                      onChange={(e) => setGpayAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">{t('doPayment.gpayCurrency')}</label>
                    <input
                      className="input font-mono text-xs"
                      value={gpayCurrency}
                      onChange={(e) => {
                        const next = e.target.value.toUpperCase()
                        setGpayCurrency(next)
                        setApplePayCountryCode(countryCodeForCurrency(next))
                      }}
                    />
                  </div>
                  <div>
                    <label className="label">{t('doPayment.applePayCountryCode')}</label>
                    <input
                      className="input font-mono text-xs"
                      value={applePayCountryCode}
                      onChange={(e) => setApplePayCountryCode(e.target.value.toUpperCase())}
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label className="label">{t('doPayment.applePayDisplayName')}</label>
                    <input
                      className="input"
                      value={applePayDisplayName}
                      onChange={(e) => setApplePayDisplayName(e.target.value)}
                    />
                  </div>
                </div>
                <ApplePayButton
                  env={effectiveEnv}
                  apiUrl={apiUrl}
                  paymentToken={paymentToken}
                  paymentChannels={flow.paymentChannels}
                  clientId={clientId}
                  locale={locale}
                  countryCode={applePayCountryCode}
                  currencyCode={gpayCurrency}
                  amount={gpayAmount}
                  displayName={applePayDisplayName}
                  lineItemLabel={t('doPayment.applePayLineItem')}
                  disabled={
                    !paymentToken.trim() ||
                    !clientId.trim() ||
                    (applePayChannelKnown && !applePayTokenChannelOk)
                  }
                  disabledMessage={t('doPayment.applePayNeedPaymentToken')}
                  wrongChannelMessage={t('doPayment.applePayWrongChannelBody')}
                  loadingMessage={t('doPayment.applePayLoading')}
                  notReadyMessage={applePayReady ? '' : t('doPayment.applePayNotReady')}
                  onReadyChange={setApplePayReady}
                  onToken={handleApplePayToken}
                  onError={handleApplePayError}
                />
                <div>
                  <label className="label">{t('doPayment.applePayToken')}</label>
                  <textarea
                    className="input min-h-[80px] font-mono text-xs"
                    value={applePayToken}
                    onChange={(e) => setApplePayToken(e.target.value)}
                    placeholder={t('doPayment.applePayTokenPlaceholder')}
                  />
                </div>
              </div>
            )}

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
              <CopyButton text={JSON.stringify(paymentDataPreview, null, 2)} />
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
              {!isDirectWalletCh && (
              <>
              <div>
                <label className="label">Mobile No</label>
                <input className="input" value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} />
              </div>
              <div>
                <label className="label">Mobile No Prefix</label>
                <input className="input" value={mobileNoPrefix} onChange={(e) => setMobileNoPrefix(e.target.value)} />
              </div>
              {!isTokenPay && (
                <div>
                  <label className="label">Card Email</label>
                  <input className="input" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} />
                </div>
              )}
              {(isTokenPay ? isWalletCh : true) && (
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
              )}
              </>
              )}
            </div>
            {isIppChannel && !isTokenPay && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t('doPayment.ippPayment')}
                  </h4>
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    channelCode=IPP
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('doPayment.ippHint')}</p>
                <div className="mt-3 form-grid-3">
                  <div>
                    <label className="label">isIppChosen</label>
                    <select
                      className="input font-mono text-xs"
                      value={isIppChosen ? 'true' : 'false'}
                      onChange={(e) => setIsIppChosen(e.target.value === 'true')}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('doPayment.installmentPeriod')}</label>
                    <select
                      className="input font-mono text-xs"
                      value={installmentPeriod}
                      onChange={(e) => setInstallmentPeriod(e.target.value)}
                    >
                      {INSTALLMENT_PERIOD_OPTIONS.map((months) => (
                        <option key={months} value={String(months)}>
                          {t('doPayment.installmentPeriodOption').replace('{months}', String(months))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('doPayment.interestType')}</label>
                    <select
                      className="input font-mono text-xs"
                      value={interestType}
                      onChange={(e) => setInterestType(e.target.value)}
                    >
                      {INTEREST_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-400">{t('doPayment.interestTypeHint')}</p>
                  </div>
                </div>
              </div>
            )}

            {isTokenPay && !isDirectWalletCh && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t('doPayment.storedTokenPay')}
                  </h4>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900 dark:text-violet-200">
                    {isWalletCh ? 'Wallet' : isCardCh ? 'CC' : channelUpper || 'token'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('doPayment.storedTokenPayHint')}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label">{t('doPayment.customerToken')}</label>
                    <input
                      className="input font-mono text-xs"
                      value={customerToken}
                      onChange={(e) => setCustomerToken(e.target.value)}
                      placeholder={isWalletCh ? '07082614230839581994' : '02406261129412157250'}
                    />
                  </div>
                  {isWalletCh && (
                    <div>
                      <label className="label">{t('doPayment.accountNo')}</label>
                      <input
                        className="input font-mono text-xs"
                        value={accountNo}
                        onChange={(e) => setAccountNo(e.target.value)}
                        placeholder="XXXX0980"
                      />
                    </div>
                  )}
                  <div>
                    <label className="label">{t('doPayment.tokenCardName')}</label>
                    <input
                      className="input"
                      value={tokenCardName}
                      onChange={(e) => setTokenCardName(e.target.value)}
                      placeholder={customerName}
                    />
                  </div>
                  <div>
                    <label className="label">{t('doPayment.tokenCardExpiry')}</label>
                    <input
                      className="input font-mono text-xs"
                      value={tokenCardExpiry}
                      onChange={(e) => setTokenCardExpiry(e.target.value)}
                      placeholder="XX/XX"
                    />
                  </div>
                  <div>
                    <label className="label">subChannelCode</label>
                    <input
                      className="input font-mono text-xs"
                      value={tokenSubChannelCode}
                      onChange={(e) => setTokenSubChannelCode(e.target.value)}
                      placeholder={isWalletCh ? channelUpper || 'ZALOPAY' : ''}
                    />
                  </div>
                  <div>
                    <label className="label">cardBrand</label>
                    <input
                      className="input font-mono text-xs"
                      value={tokenCardBrand}
                      onChange={(e) => setTokenCardBrand(e.target.value)}
                      placeholder="VISA"
                    />
                  </div>
                  <div>
                    <label className="label">status</label>
                    <input
                      className="input font-mono text-xs"
                      value={tokenCardStatus}
                      onChange={(e) => setTokenCardStatus(e.target.value)}
                      placeholder="A"
                    />
                  </div>
                  {isCardCh && (
                    <>
                      <div className="sm:col-span-2">
                        <label className="label">iconUrl</label>
                        <input
                          className="input font-mono text-xs"
                          value={tokenIconUrl}
                          onChange={(e) => setTokenIconUrl(e.target.value)}
                          placeholder="https://…/visa.png"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">logoUrl</label>
                        <input
                          className="input font-mono text-xs"
                          value={tokenLogoUrl}
                          onChange={(e) => setTokenLogoUrl(e.target.value)}
                          placeholder="https://…/visa.png"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600"
                            checked={accountTokenization}
                            onChange={(e) => setAccountTokenization(e.target.checked)}
                          />
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            accountTokenization
                          </span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            <CodeBlock maxHeight="max-h-60">{JSON.stringify(paymentDataPreview, null, 2)}</CodeBlock>
          </div>

          {/* Card details — raw PAN / expiry / CVV */}
          {!isTokenPay && !isDirectWalletCh && (
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
          )}

          {/* 2C2P encryption → securePayToken */}
          {(!isTokenPay || isCardCh) && !isDirectWalletCh && (
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
          )}

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

              <JsonResultCard
                title={`📨 ${t('paymentToken.requestPayload')}`}
                text={JSON.stringify(result.payload, null, 2)}
              />

              {result.response != null && (
                <JsonResultCard
                  title={`📬 ${t('paymentToken.rawResponse')}`}
                  text={
                    typeof result.response === 'string'
                      ? result.response
                      : JSON.stringify(result.response, null, 2)
                  }
                  maxHeight="max-h-96"
                />
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

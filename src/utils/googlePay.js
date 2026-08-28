export const GOOGLE_PAY_SCRIPT_URL = 'https://pay.google.com/gp/p/js/pay.js'

export const GOOGLE_PAY_CARD_NETWORKS = ['AMEX', 'DISCOVER', 'JCB', 'MASTERCARD', 'VISA']

export const GOOGLE_PAY_AUTH_METHODS = ['PAN_ONLY']

export const GOOGLE_PAY_ENV_OPTIONS = [
  { value: 'TEST', label: 'TEST' },
  { value: 'PRODUCTION', label: 'PRODUCTION' },
]

/** Map 2C2P Do Payment env → Google Pay PaymentsClient environment. */
export function googlePayEnvironmentForDoPaymentEnv(doPaymentEnv) {
  return doPaymentEnv === 'production' ? 'PRODUCTION' : 'TEST'
}

let scriptPromise = null

export function loadGooglePayScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Pay requires a browser environment'))
  }
  if (window.google?.payments?.api) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_PAY_SCRIPT_URL}"]`)
    if (existing) {
      if (window.google?.payments?.api) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Pay SDK')))
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_PAY_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Pay SDK'))
    document.body.appendChild(script)
  })

  return scriptPromise
}

/** Google Pay expects totalPrice as a string; zero-decimal currencies omit fractions. */
export function formatGooglePayPrice(amount, currencyCode) {
  const num = Number(amount)
  if (!Number.isFinite(num)) return '0.00'
  const zeroDecimal = ['VND', 'JPY', 'KRW'].includes(String(currencyCode || '').toUpperCase())
  if (zeroDecimal) return String(Math.round(num))
  return num.toFixed(2)
}

/**
 * Build Google Pay request objects per 2C2P docs:
 * https://developer.2c2p.com/docs/google-pay
 */
export function buildGooglePayConfig({
  environment = 'TEST',
  gateway = '2c2p',
  gatewayMerchantId,
  googleMerchantId = '',
  googleMerchantName = '2C2P Test Merchant',
  amount,
  currencyCode = 'SGD',
  allowedCardNetworks = GOOGLE_PAY_CARD_NETWORKS,
  allowedAuthMethods = GOOGLE_PAY_AUTH_METHODS,
}) {
  const baseRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
  }

  const tokenizationSpecification = {
    type: 'PAYMENT_GATEWAY',
    parameters: {
      gateway,
      gatewayMerchantId: String(gatewayMerchantId || '').trim(),
    },
  }

  const baseCardPaymentMethod = {
    type: 'CARD',
    parameters: {
      allowedAuthMethods,
      allowedCardNetworks,
      billingAddressRequired: true,
      billingAddressParameters: { phoneNumberRequired: true },
    },
  }

  const cardPaymentMethod = {
    ...baseCardPaymentMethod,
    tokenizationSpecification,
  }

  const isReadyToPayRequest = {
    ...baseRequest,
    allowedPaymentMethods: [baseCardPaymentMethod],
    existingPaymentMethodRequired: true,
  }

  const merchantInfo = {
    merchantName: String(googleMerchantName || 'Merchant').trim(),
  }
  const googleMid = String(googleMerchantId || '').trim()
  if (googleMid) merchantInfo.merchantId = googleMid

  const transactionInfo = {
    currencyCode: String(currencyCode || 'SGD').toUpperCase(),
    totalPriceStatus: 'FINAL',
    totalPrice: formatGooglePayPrice(amount, currencyCode),
  }

  const paymentDataRequest = {
    ...baseRequest,
    allowedPaymentMethods: [cardPaymentMethod],
    transactionInfo,
    merchantInfo,
  }

  return {
    isReadyToPayRequest,
    paymentDataRequest,
    transactionInfo,
    environment,
  }
}

export function getGooglePaymentsClient(environment = 'TEST') {
  return new window.google.payments.api.PaymentsClient({ environment })
}

export async function checkGooglePayReady(config) {
  await loadGooglePayScript()
  const client = getGooglePaymentsClient(config.environment)
  const response = await client.isReadyToPay(config.isReadyToPayRequest)
  return Boolean(response?.result)
}

export async function requestGooglePayToken(config) {
  await loadGooglePayScript()
  const client = getGooglePaymentsClient(config.environment)
  const paymentDataRequest = {
    ...config.paymentDataRequest,
    transactionInfo: config.transactionInfo,
  }
  const paymentData = await client.loadPaymentData(paymentDataRequest)
  const token = paymentData?.paymentMethodData?.tokenizationData?.token
  if (!token) throw new Error('No token in Google Pay response')
  return token
}

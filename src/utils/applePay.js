export const APPLE_PAY_SESSION_VERSION = 3

export const APPLE_PAY_SUPPORTED_NETWORKS = ['visa', 'masterCard', 'amex', 'discover', 'jcb']

export const APPLE_PAY_MERCHANT_CAPABILITIES = ['supports3DS', 'supportsCredit', 'supportsDebit']

export const APPLE_PAY_MERCHANT_VALIDATION_URLS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/applepay/merchantvalidation',
  production: 'https://pgw.2c2p.com/payment/4.3/applepay/merchantvalidation',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/applepay/merchantvalidation',
}

const CURRENCY_COUNTRY = {
  SGD: 'SG',
  VND: 'VN',
  USD: 'US',
  THB: 'TH',
  MYR: 'MY',
  IDR: 'ID',
  PHP: 'PH',
  HKD: 'HK',
  JPY: 'JP',
  KRW: 'KR',
  AUD: 'AU',
  GBP: 'GB',
  EUR: 'DE',
}

export function countryCodeForCurrency(currencyCode) {
  return CURRENCY_COUNTRY[String(currencyCode || '').toUpperCase()] || 'SG'
}

export function applePayMerchantValidationUrl(env = 'sandbox') {
  if (env === 'production') return APPLE_PAY_MERCHANT_VALIDATION_URLS.production
  if (env === 'mpay') return APPLE_PAY_MERCHANT_VALIDATION_URLS.mpay
  return APPLE_PAY_MERCHANT_VALIDATION_URLS.sandbox
}

/** Apple Pay expects amount strings; zero-decimal currencies omit fractions. */
export function formatApplePayAmount(amount, currencyCode) {
  const num = Number(amount)
  if (!Number.isFinite(num)) return '0.00'
  const zeroDecimal = ['VND', 'JPY', 'KRW'].includes(String(currencyCode || '').toUpperCase())
  if (zeroDecimal) return String(Math.round(num))
  return num.toFixed(2)
}

export function canUseApplePay() {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.ApplePaySession?.canMakePayments?.())
  } catch {
    return false
  }
}

/**
 * Build ApplePayPaymentRequest per 2C2P docs:
 * https://developer.2c2p.com/docs/direct-api-apple-pay
 */
export function buildApplePayRequest({
  countryCode = 'SG',
  currencyCode = 'SGD',
  amount,
  label = 'Total',
  lineItemLabel = 'Payment',
  supportedNetworks = APPLE_PAY_SUPPORTED_NETWORKS,
  merchantCapabilities = APPLE_PAY_MERCHANT_CAPABILITIES,
}) {
  const amountStr = formatApplePayAmount(amount, currencyCode)
  return {
    countryCode: String(countryCode || 'SG').toUpperCase(),
    currencyCode: String(currencyCode || 'SGD').toUpperCase(),
    supportedNetworks,
    merchantCapabilities,
    lineItems: [{ label: lineItemLabel, amount: amountStr }],
    total: { label, amount: amountStr },
  }
}

/**
 * 2C2P Do Payment expects payment.data.token as base64(JSON.stringify(paymentData)).
 * @see https://developer.2c2p.com/docs/direct-api-apple-pay
 */
export function encodeApplePayTokenFor2C2P(rawToken) {
  const trimmed = String(rawToken || '').trim()
  if (!trimmed) return ''

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) return trimmed
  }

  let paymentData = trimmed
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && parsed.paymentData) {
      paymentData = JSON.stringify(parsed.paymentData)
    } else {
      paymentData = JSON.stringify(parsed)
    }
  } catch {
    // keep raw string
  }

  const bytes = new TextEncoder().encode(paymentData)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function extractApplePayPaymentDataJson(payment) {
  const paymentData = payment?.token?.paymentData
  if (!paymentData) throw new Error('No payment.token.paymentData in Apple Pay response')
  return JSON.stringify(paymentData)
}

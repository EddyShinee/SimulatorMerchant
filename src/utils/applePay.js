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

import { DEFAULT_BROWSER_DETAILS } from '../config/paymentOptionsConfig.js'
import { effectiveDoPaymentEnv } from '../config/doPaymentConfig.js'

export function applePayMerchantValidationUrl(env = 'sandbox', apiUrl = '') {
  const resolved = effectiveDoPaymentEnv(env, apiUrl)
  if (resolved === 'production') return APPLE_PAY_MERCHANT_VALIDATION_URLS.production
  if (resolved === 'mpay') return APPLE_PAY_MERCHANT_VALIDATION_URLS.mpay
  return APPLE_PAY_MERCHANT_VALIDATION_URLS.sandbox
}

/** browserDetails for 2C2P merchant validation (Safari when applicable). */
export function buildApplePayBrowserDetails() {
  if (typeof navigator === 'undefined') return { ...DEFAULT_BROWSER_DETAILS }

  const ua = navigator.userAgent || ''
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg/i.test(ua)
  const isMobile = /iPhone|iPad|iPod|Mobile/i.test(ua)

  return {
    deviceType: isMobile ? 'mobile' : 'desktop',
    name: isSafari ? 'Safari' : DEFAULT_BROWSER_DETAILS.name,
    os: /Mac/i.test(ua) ? 'macOS' : /Win/i.test(ua) ? 'Windows' : isMobile ? 'iOS' : DEFAULT_BROWSER_DETAILS.os,
    version: isSafari ? '17.0.0' : DEFAULT_BROWSER_DETAILS.version,
  }
}

export function buildApplePayMerchantValidationBody({
  validationUrl,
  paymentToken,
  clientId,
  locale = 'en',
  browserDetails = buildApplePayBrowserDetails(),
}) {
  return {
    validationUrl: String(validationUrl || '').trim(),
    paymentToken: String(paymentToken || '').trim(),
    clientID: String(clientId || '').trim(),
    locale: String(locale || 'en').trim() || 'en',
    browserDetails,
  }
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
  return getApplePayAvailability().available
}

/** Detailed Apple Pay availability for UI messaging. */
export function getApplePayAvailability() {
  if (typeof window === 'undefined') {
    return { available: false, reason: 'no_window' }
  }
  if (!window.isSecureContext) {
    return { available: false, reason: 'secure_context' }
  }
  if (!window.ApplePaySession) {
    return { available: false, reason: 'no_api' }
  }
  try {
    if (!window.ApplePaySession.canMakePayments()) {
      return { available: false, reason: 'no_cards' }
    }
    return { available: true, reason: '' }
  } catch (err) {
    return { available: false, reason: 'unknown', detail: err?.message || String(err) }
  }
}

export function parseApplePayMerchantSession(proxyData) {
  let session = proxyData?.body
  if (typeof session === 'string') {
    try {
      session = JSON.parse(session)
    } catch {
      throw new Error('Invalid merchant validation response')
    }
  }
  if (session?.data && typeof session.data === 'object' && !session.epochTimestamp) {
    session = session.data
  }
  if (session?.respCode && session.respCode !== '0000') {
    const desc = session.respDesc || 'Request failed'
    throw new Error(`${desc} (${session.respCode})`)
  }
  if (!session?.epochTimestamp && !session?.merchantSessionIdentifier) {
    throw new Error(session?.respDesc || 'Invalid merchant session from 2C2P')
  }
  return session
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

// Do Payment endpoints by environment.
export const DO_PAYMENT_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/payment',
  production: 'https://pgw.2c2p.com/payment/4.3/payment',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/payment',
}

export const DO_PAYMENT_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

export const QR_TYPE_OPTIONS = ['RAW', 'BASE64', 'URL']

/** IPP interestType: M = Merchant, C = Customer, A = Absolute */
export const INTEREST_TYPE_OPTIONS = ['M', 'C', 'A']

/** IPP installment periods (months) */
export const INSTALLMENT_PERIOD_OPTIONS = [3, 6, 9, 12]

/** CC / LCC channels — may use securePayToken + accountTokenization */
export function isCardChannel(code) {
  return ['CC', 'LCC'].includes(String(code || '').trim().toUpperCase())
}

/** Wallet / e-wallet channel codes that use customerToken + cardDetails.token */
export const WALLET_CHANNEL_CODES = [
  'ZALOPAY',
  'MOMO',
  'MOMOQR',
  'VNPAY',
  'SHOPEEPAY',
  'VIETTELPAY',
  'APPOTA',
  'FOX',
  'TRUEMONEY',
  'ZALO',
]

export function isWalletChannel(code) {
  return WALLET_CHANNEL_CODES.includes(String(code || '').trim().toUpperCase())
}

/** Google Pay Direct API channel (2C2P docs). */
export function isGooglePayChannel(code) {
  return String(code || '').trim().toUpperCase() === 'GOOGLEPAY'
}

/** Apple Pay Direct API channel (2C2P docs). */
export function isApplePayChannel(code) {
  return String(code || '').trim().toUpperCase() === 'APPLEPAY'
}

/** Google Pay or Apple Pay Direct API — hide card PAN / token-pay UI. */
export function isDirectWalletChannel(code) {
  return isGooglePayChannel(code) || isApplePayChannel(code)
}

export const WALLET_CHANNEL_QUICK_PICKS = ['CC', 'GOOGLEPAY', 'APPLEPAY']

/** Build PGW UI info URL when Payment Token response has no webPaymentUrl. */
export function buildResponseReturnUrl(paymentToken, env = 'sandbox') {
  const token = String(paymentToken || '').trim()
  if (!token) return ''
  const base =
    env === 'production'
      ? 'https://pgw-ui.2c2p.com/payment/4.3'
      : env === 'mpay'
        ? 'https://pgw-ui.m-pay.vn/payment/4.1'
        : 'https://sandbox-pgw-ui.2c2p.com/payment/4.3'
  return `${base}/#/info/${token}`
}

// 2C2P client-side card encryption SDK.
export const MY2C2P_SDK_URL =
  'https://demo2.2c2p.com/2C2PFrontEnd/SecurePayment/api/my2c2p.1.7.6.min.js'

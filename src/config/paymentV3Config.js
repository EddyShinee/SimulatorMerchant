// 2C2P Payment V3 / Dynamic QR (2C2PDynQR), version 9.9.
// Sandbox matches the GenerateQR log:
//   https://demo2.2c2p.com/2C2PFrontend/SecurePayment/Payment.aspx
export const PAYMENT_V3_ENVIRONMENTS = {
  sandbox: 'https://demo2.2c2p.com/2C2PFrontend/SecurePayment/Payment.aspx',
  production: 'https://t.2c2p.com/SecurePayment/Payment.aspx',
}

export const PAYMENT_V3_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'custom', label: 'Custom' },
]

/** How the signed PaymentRequest is placed in the paymentRequest form field. */
export const PAYMENT_V3_BODY_OPTIONS = [
  { value: 'base64', labelKey: 'paymentV3.bodyBase64' },
  { value: 'xml', labelKey: 'paymentV3.bodyXml' },
]

export const PAYMENT_V3_QR_OPTIONS = [
  { value: '1', labelKey: 'paymentV3.qrOption1' },
  { value: '2', labelKey: 'paymentV3.qrOption2' },
  { value: '3', labelKey: 'paymentV3.qrOption3' },
]

export const PAYMENT_V3_CHANNELS = ['VNQR', 'EMVQR', 'WCQR', 'ALIQR', 'VNPAY', 'MOMO', 'ZALOPAY', 'SHOPEEPAY']

export const PAYMENT_V3_DEFAULT_MERCHANT_ID = '344344000069000'

// ISO 4217 minor units. Currencies omitted here use 2 (2C2P default).
const MINOR_UNITS = {
  '108': 0,
  '152': 0,
  '132': 0,
  '174': 0,
  '262': 0,
  '324': 0,
  '352': 0,
  '392': 0,
  '360': 0,
  '410': 0,
  '418': 0,
  '548': 0,
  '600': 0,
  '646': 0,
  '690': 0,
  '704': 0,
  '800': 0,
  '940': 0,
  '950': 0,
  '952': 0,
  '953': 0,
  '972': 0,
}

export function minorUnitsFor(currencyCode) {
  const code = String(currencyCode ?? '').trim()
  if (Object.prototype.hasOwnProperty.call(MINOR_UNITS, code)) return MINOR_UNITS[code]
  return 2
}

/** ddMMyyHHmmss — same clock format as the GenerateQR sample (291026160851). */
export function generateTimestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    p(date.getDate()) +
    p(date.getMonth() + 1) +
    String(date.getFullYear()).slice(2) +
    p(date.getHours()) +
    p(date.getMinutes()) +
    p(date.getSeconds())
  )
}

/** yyyy-MM-dd HH:mm:ss */
export function formatPaymentExpiry(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

/** 12-digit numeric order code. */
export function generateUniqueTransactionCode(date = new Date()) {
  const tail = String(date.getTime()).slice(-10)
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0')
  return `${tail}${rand}`.slice(-12)
}

/**
 * 12-digit amount. A value that is already 12 digits is kept.
 * Otherwise ISO minor units are applied (VND 704 has 0, so 30 → 000000000030).
 */
export function formatAmount12(amount, currencyCode) {
  const raw = String(amount ?? '').trim().replace(/,/g, '')
  if (!raw) return { amt: '', error: 'empty' }
  if (/^\d{12}$/.test(raw)) return { amt: raw, error: null }
  if (!/^\d+(\.\d+)?$/.test(raw)) return { amt: '', error: 'invalid' }

  const minor = minorUnitsFor(currencyCode)
  const [whole, frac = ''] = raw.split('.')
  const significantFrac = frac.replace(/0+$/, '')
  if (significantFrac.length > minor) return { amt: '', error: 'scale' }

  const digits = `${whole}${frac.slice(0, minor).padEnd(minor, '0')}`.replace(/^0+(?=\d)/, '') || '0'
  if (digits.length > 12) return { amt: '', error: 'tooLarge' }
  return { amt: digits.padStart(12, '0'), error: null }
}

export function createPaymentV3Defaults(now = new Date(), expiryMinutes = 2) {
  const minutes = Number(expiryMinutes) || 2
  return {
    version: '9.9',
    timeStamp: generateTimestamp(now),
    merchantID: PAYMENT_V3_DEFAULT_MERCHANT_ID,
    uniqueTransactionCode: generateUniqueTransactionCode(now),
    desc: 'Group A',
    amount: '30',
    currencyCode: '704',
    paymentChannel: 'VNQR',
    paymentExpiry: formatPaymentExpiry(new Date(now.getTime() + minutes * 60 * 1000)),
    expiryMinutes: String(minutes),
    qrOption: '1',
    requestEncoding: 'base64',
    qrType: '',
    panCountry: '',
    cardholderName: '',
    cardholderEmail: '',
    mobileNo: '',
    userDefined1: '',
    userDefined2: '',
    userDefined3: '',
    userDefined4: '',
    userDefined5: '',
    returnUrl: '',
    backendUrl: '',
  }
}

export function refreshPaymentV3Timing(form, { rotateCode = false, now = new Date() } = {}) {
  const minutes = Math.min(1440, Math.max(1, Number(form.expiryMinutes) || 2))
  return {
    ...form,
    expiryMinutes: String(minutes),
    timeStamp: generateTimestamp(now),
    paymentExpiry: formatPaymentExpiry(new Date(now.getTime() + minutes * 60 * 1000)),
    uniqueTransactionCode: rotateCode
      ? generateUniqueTransactionCode(now)
      : form.uniqueTransactionCode,
  }
}

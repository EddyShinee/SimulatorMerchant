// SoftPOS Standalone API — paths from SoftPOS Specification v1.3
// https://developer.2c2p.com (Payment Terminal / SoftPOS)

export const POS_OPERATIONS = [
  { id: 'inquiry', label: 'Inquiry', method: 'GET' },
  { id: 'refund', label: 'Refund', method: 'POST' },
  { id: 'void', label: 'Void', method: 'POST' },
  { id: 'capture', label: 'Capture', method: 'POST' },
  { id: 'notification', label: 'Notification (Callback)', method: 'POST' },
]

export const POS_BASE_URL_PRESETS = {
  sandbox: '',
  production: '',
  custom: '',
}

export const POS_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'production', label: 'Production' },
  { value: 'custom', label: 'Custom Base URL' },
]

export const TRAN_TYPES = ['SALE', 'REFUND', 'AUTH', 'VOID', 'CAPTURE', 'AUTH_COMP']
export const TRAN_STATUSES = ['PROCESSING', 'APPROVED', 'DECLINED', 'VOIDED']
export const PAYMENT_METHODS = [
  'VISA',
  'MASTERCARD',
  'UNIONPAY',
  'AMEX',
  'JCB',
  'DISCOVER',
  'DINERS',
  'WECHAT',
  'ALIPAY_PLUS',
  'SHOPEE_PAY_QR',
  'GRAB_PAY_QR',
  'PROMPT_PAY_QR',
  'UNKNOWN',
]

export const CURRENCY_OPTIONS = ['SGD', 'THB', 'VND', 'USD', 'MYR', 'IDR', 'PHP', 'HKD', 'EUR', 'GBP']

export const CALLBACK_URL_PRESETS = [
  { id: 'simulator', label: 'Simulator Inbox (local test)' },
  { id: 'finviet', label: '2C2P Demo — finviet', url: 'https://softpos-demo.2c2p.com/callback/finviet' },
  { id: 'vtc-qa', label: '2C2P QA — VTC', url: 'https://softpos-qa.2c2p.com/callback/vtc' },
]

/** AES-128 key (Base64, 16 bytes) — Spec §5.1.1 shared secret between acquirer and 2C2P. */
export const DEFAULT_AES_KEY = 'Qq5sOyKvwNDdnwRqhEA8XQ=='

/** Default test Visa PAN (Spec / VTC demo). */
export const DEFAULT_PLAIN_PAN = '4111111111111111'

/** AES-128-GCM encrypted DEFAULT_PLAIN_PAN with DEFAULT_AES_KEY (IV random at generation time). */
export const DEFAULT_ENCRYPTED_CARD_PAN =
  'aT2FMJcJkJ4y+nWJUVoVlbxsgpRKIKLiRn1DTdD2/o8MXkWU6NN2r9s1zVk='

/** extraData.jwtSecret — same AES-128 key (Base64) VTC uses to decrypt cardPan. */
export const DEFAULT_JWT_SECRET = DEFAULT_AES_KEY

const DEFAULT_EXTRA_DATA = {
  merchantId: '70470400000TEST3',
  subMid: '70470400000TEST3',
  subTid: 'HDL001',
  jwtSecret: DEFAULT_JWT_SECRET,
}

export const NOTIFICATION_TEMPLATES = {
  sale: {
    tranId: 'M260811173920fa2f47',
    tranStatus: 'APPROVED',
    tranType: 'SALE',
    paymentMethod: 'VISA',
    posReference: '1781771250027',
    issCountryCode: '0704',
    linkedTranId: 'M260811173920fa2f47',
    deviceAlias: 'R0998430',
    amount: { currency: 'VND', value: 130000 },
    cardPan: DEFAULT_ENCRYPTED_CARD_PAN,
    extraData: { ...DEFAULT_EXTRA_DATA },
  },
  void: {
    tranId: 'M260811173920fa2f47',
    tranType: 'VOID',
    tranStatus: 'VOIDED',
    approvalCode: '838601',
    amount: { currency: 'VND', value: 130000 },
    posReference: '1781771250027',
    linkedTranId: 'M260811173920fa2f47',
    deviceAlias: 'R0998430',
    paymentMethod: 'VISA',
    issCountryCode: '0704',
    extraData: { ...DEFAULT_EXTRA_DATA },
  },
  refund: {
    tranId: 'M260811173920fa2f47',
    linkedTranId: 'M260811173920fa2f47',
    tranType: 'REFUND',
    tranStatus: 'APPROVED',
    approvalCode: 'R54321',
    amount: { currency: 'VND', value: 130000 },
    posReference: '1781771250027',
    deviceAlias: 'R0998430',
    paymentMethod: 'VISA',
    issCountryCode: '0704',
    extraData: { ...DEFAULT_EXTRA_DATA },
  },
  capture: {
    tranId: 'M260811173920fa2f47',
    linkedTranId: 'M260811173920fa2f47',
    tranType: 'AUTH_COMP',
    tranStatus: 'APPROVED',
    approvalCode: '838601',
    amount: { currency: 'VND', value: 130000 },
    posReference: '1781771250027',
    deviceAlias: 'R0998430',
    paymentMethod: 'VISA',
    issCountryCode: '0704',
    extraData: { ...DEFAULT_EXTRA_DATA },
  },
}

export function buildOperationUrl(operation, baseUrl, transactionId) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const id = encodeURIComponent(transactionId || '')
  switch (operation) {
    case 'inquiry':
      return `${base}/order/reference/${id}`
    case 'refund':
      return `${base}/api/v2/order/refund/${id}`
    case 'void':
      return `${base}/order/void/${id}`
    case 'capture':
      return `${base}/api/v2/order/capture/${id}`
    default:
      return base
  }
}

export function defaultRequestBody(operation) {
  switch (operation) {
    case 'refund':
      return { refundAmount: '1.30', refundReason: '2C2P REFUND', adminPwd: 'MDAwMDAw' }
    case 'void':
      return { adminPwd: '000000' }
    case 'capture':
      return { amount: '1.30' }
    default:
      return null
  }
}

/** M + yyMMddHHmmss + random suffix — same pattern as Payment Token invoiceNo. */
export function generateTranId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts =
    String(d.getFullYear()).slice(2) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  const rand = Math.random().toString(16).slice(2, 6)
  const tail = String(Math.floor(Math.random() * 100)).padStart(2, '0')
  return `M${ts}${rand}${tail}`
}

export function isVtcCallbackUrl(url) {
  return String(url || '').toLowerCase().includes('/vtc')
}

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

/** AES-128 key (hex) shared with 2C2P for cardPan encrypt/decrypt. */
export const DEFAULT_AES_KEY = '42AE6C3B22AFC0D0DD9F046A84403C5D'

const DEFAULT_EXTRA_DATA = {
  merchantId: '7047040000TEST3',
  subMid: '7047040000TEST3',
  subTid: 'R0998430',
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
    deviceAlias: 'HDL001',
    amount: { currency: 'VND', value: 130000 },
    cardPan: 'idwkVGYhsHycaagFjqdOGEjH5TGjbE/NbgXwMqPxzk1OpqACZZG7qBy+hw==',
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
    deviceAlias: 'HDL001',
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
    deviceAlias: 'HDL001',
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
    deviceAlias: 'HDL001',
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

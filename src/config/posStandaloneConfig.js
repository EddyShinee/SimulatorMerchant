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
]

export const NOTIFICATION_TEMPLATES = {
  sale: {
    tranId: 'M2067524593572634625',
    tranStatus: 'APPROVED',
    tranType: 'SALE',
    paymentMethod: 'MASTERCARD',
    posReference: '1781771250027',
    issCountryCode: '0702',
    linkedTranId: 'M2067524593572634625',
    deviceAlias: 'UNKNOWN',
    amount: { currency: 'SGD', value: 130 },
    cardPan: 'BZYUrnkdJASATL5pJPYiGJrhFrs5SOZy5+cQN2/lMNpT7p7nMuUIUXUFO1w=',
    extraData: {
      merchantId: '702702000004178',
      subMid: '702702000004178',
      subTid: 'DCSSP003',
    },
  },
  void: {
    tranId: 'M2067524593572634625',
    tranType: 'VOID',
    tranStatus: 'VOIDED',
    approvalCode: '838601',
    amount: { currency: 'SGD', value: 130 },
    posReference: '1781771250027',
    linkedTranId: 'M2067524593572634625',
    deviceAlias: 'UNKNOWN',
    paymentMethod: 'MASTERCARD',
    extraData: {
      subMid: '702702000004178',
      subTid: 'DCSSP003',
    },
  },
  refund: {
    tranId: 'M2067524593572634999',
    linkedTranId: 'M2067524593572634625',
    tranType: 'REFUND',
    tranStatus: 'APPROVED',
    approvalCode: 'R54321',
    amount: { currency: 'SGD', value: 130 },
    posReference: '1781771260027',
    deviceAlias: 'UNKNOWN',
    paymentMethod: 'MASTERCARD',
    extraData: {
      subMid: '702702000004178',
      subTid: 'DCSSP003',
    },
  },
  capture: {
    tranId: 'M2067524593572634999',
    linkedTranId: 'M2067524593572634625',
    tranType: 'AUTH_COMP',
    tranStatus: 'APPROVED',
    approvalCode: '838601',
    amount: { currency: 'SGD', value: 130 },
    posReference: '1781771260027',
    deviceAlias: 'UNKNOWN',
    paymentMethod: 'MASTERCARD',
    extraData: {
      subMid: '702702000004178',
      subTid: 'DCSSP003',
    },
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

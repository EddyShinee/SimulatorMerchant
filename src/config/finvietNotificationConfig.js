/** FinViet partner callback payload (POST JSON, not SoftPOS webhook-jwt). */

/** Secret key provided by SmartPOS / 2C2P for HMAC-SHA256 (§3.1). */
export const FINVIET_DEFAULT_SECRET_KEY = '2C2P_SECRET_KEY'

export const FINVIET_STATUS_OPTIONS = ['success', 'failed', 'pending']
export const FINVIET_PAYMENT_STATUS_OPTIONS = ['success', 'failed', 'pending']
export const FINVIET_PAYMENT_CHANNEL_OPTIONS = ['card', 'qr', 'wallet']
export const FINVIET_CARD_TYPE_OPTIONS = ['OTHER', 'VISA', 'MASTERCARD', 'JCB', 'AMEX', 'UNIONPAY']
export const FINVIET_CARD_ORIGIN_OPTIONS = ['OTHER', 'DOMESTIC', 'INTERNATIONAL']

function nowMs() {
  return Date.now()
}

/** INV_DDMMYYYY_NNNNNN — invoice-style merchant bill id */
export function generateFinvietMerchantBillId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const date = `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`
  const seq = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  return `INV_${date}_${seq}`
}

export function generateFinvietPaymentTransId() {
  return String(Date.now()).slice(-16) + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export function generateFinvietRefCode() {
  return String(Math.floor(100000000000 + Math.random() * 900000000000))
}

export function buildFinvietNotificationTemplate() {
  const ts = nowMs()
  const created = ts - 50000
  const success = ts - 10000
  return {
    amount: 27000,
    status: 'success',
    currency: 'VND',
    signature: '',
    timestamp: ts,
    store_code: '2C2P1',
    retail_app_id: '2C2P_RETAIL_1',
    transaction: {
      ref_code: generateFinvietRefCode(),
      error_msg: '',
      is_global: false,
      created_at: created,
      error_code: '',
      is_timeout: false,
      success_at: success,
      updated_at: success,
      approve_code: '069302',
      payment_status: 'success',
      payment_channel: 'card',
      payment_transid: generateFinvietPaymentTransId(),
    },
    customer_info: {
      card_info: {
        card_type: 'OTHER',
        card_holder: null,
        card_number: '545909****0362',
        card_origin: 'OTHER',
      },
      customer_name: null,
    },
    merchant_code: '2C2P',
    merchant_bill_id: generateFinvietMerchantBillId(),
    store_code_partner: 'FV003',
    merchant_code_partner: '70470400000TEST',
  }
}

export const FINVIET_NOTIFICATION_TEMPLATE = buildFinvietNotificationTemplate()

export function isFinvietCallbackUrl(url) {
  return String(url || '').toLowerCase().includes('finviet')
}

import {
  buildFinvietNotificationTemplate,
  generateFinvietMerchantBillId,
  generateFinvietPaymentTransId,
  generateFinvietRefCode,
  generateFinvietApproveCode,
  FINVIET_DEFAULT_SECRET_KEY,
} from '../config/finvietNotificationConfig.js'
import { loadStoredFinvietSecret } from './posStandaloneKeyStore.js'

function nullIfEmpty(value) {
  const s = String(value ?? '').trim()
  return s ? s : null
}

/** Millisecond timestamps for FinViet notify body (auto-generated). */
export function freshFinvietTimestamps(now = Date.now()) {
  return {
    timestamp: now,
    createdAt: now - 50_000,
    successAt: now,
    updatedAt: now,
  }
}

export function withFreshFinvietTimestamps(form, now = Date.now()) {
  return { ...form, ...freshFinvietTimestamps(now) }
}

export function ensureFinvietMerchantBillId(form) {
  return form.merchantBillId?.trim() ? form : { ...form, merchantBillId: generateFinvietMerchantBillId() }
}

export function ensureFinvietApproveCode(form) {
  return form.approveCode?.trim() ? form : { ...form, approveCode: generateFinvietApproveCode() }
}

export function formatFinvietTimestamp(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return new Date(n).toLocaleString('vi-VN')
}

export const DEFAULT_FINVIET_FORM = {
  ...templateToFinvietForm(buildFinvietNotificationTemplate()),
  secretKey: loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
}

export function withFreshFinvietIds(form) {
  const times = freshFinvietTimestamps()
  return {
    ...form,
    secretKey: form.secretKey?.trim() || loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
    ...times,
    merchantBillId: generateFinvietMerchantBillId(),
    refCode: generateFinvietRefCode(),
    paymentTransid: generateFinvietPaymentTransId(),
    approveCode: generateFinvietApproveCode(),
  }
}

export function templateToFinvietForm(template = {}) {
  const tx = template.transaction || {}
  const card = template.customer_info?.card_info || {}
  return {
    amount: template.amount ?? 0,
    status: template.status ?? 'success',
    currency: template.currency ?? 'VND',
    signature: template.signature ?? '',
    timestamp: template.timestamp ?? Date.now(),
    storeCode: template.store_code ?? '',
    retailAppId: template.retail_app_id ?? '',
    merchantCode: template.merchant_code ?? '',
    merchantBillId: template.merchant_bill_id ?? '',
    storeCodePartner: template.store_code_partner ?? '',
    merchantCodePartner: template.merchant_code_partner ?? '',
    refCode: tx.ref_code ?? '',
    errorMsg: tx.error_msg ?? '',
    isGlobal: Boolean(tx.is_global),
    createdAt: tx.created_at ?? Date.now(),
    errorCode: tx.error_code ?? '',
    isTimeout: Boolean(tx.is_timeout),
    successAt: tx.success_at ?? Date.now(),
    updatedAt: tx.updated_at ?? Date.now(),
    approveCode: tx.approve_code ?? '',
    paymentStatus: tx.payment_status ?? 'success',
    paymentChannel: tx.payment_channel ?? 'card',
    paymentTransid: tx.payment_transid ?? '',
    cardType: card.card_type ?? 'OTHER',
    cardHolder: card.card_holder ?? '',
    cardNumber: card.card_number ?? '',
    cardOrigin: card.card_origin ?? 'OTHER',
    customerName: template.customer_info?.customer_name ?? '',
  }
}

export function finvietFormToBody(form, { refreshTimes = true } = {}) {
  const f = refreshTimes ? withFreshFinvietTimestamps(form) : form
  const body = {
    amount: Number(f.amount),
    status: f.status,
    currency: f.currency.trim(),
    timestamp: Number(f.timestamp),
    store_code: f.storeCode.trim(),
    transaction: {
      ref_code: f.refCode.trim(),
      error_msg: f.errorMsg.trim(),
      is_global: Boolean(f.isGlobal),
      created_at: Number(f.createdAt),
      error_code: f.errorCode.trim(),
      is_timeout: Boolean(f.isTimeout),
      success_at: Number(f.successAt),
      updated_at: Number(f.updatedAt),
      approve_code: f.approveCode?.trim() || generateFinvietApproveCode(),
      payment_status: f.paymentStatus,
      payment_channel: f.paymentChannel,
      payment_transid: f.paymentTransid.trim(),
    },
    customer_info: {
      card_info: {
        card_type: f.cardType,
        card_holder: nullIfEmpty(f.cardHolder),
        card_number: f.cardNumber.trim(),
        card_origin: f.cardOrigin,
      },
      customer_name: nullIfEmpty(f.customerName),
    },
    merchant_code: f.merchantCode.trim(),
    merchant_bill_id: f.merchantBillId?.trim() || generateFinvietMerchantBillId(),
    store_code_partner: f.storeCodePartner.trim(),
    merchant_code_partner: f.merchantCodePartner.trim(),
  }

  if (f.retailAppId?.trim()) body.retail_app_id = f.retailAppId.trim()
  if (f.signature?.trim()) body.signature = f.signature.trim()

  return body
}

/** Fields that affect the HMAC signature (excludes signature + secretKey). */
export function finvietSignFingerprint(form) {
  const body = finvietFormToBody(ensureFinvietApproveCode(ensureFinvietMerchantBillId(form)), {
    refreshTimes: false,
  })
  delete body.signature
  return JSON.stringify(body)
}

export function parseFinvietFormFromJson(jsonText) {
  const parsed = JSON.parse(jsonText)
  return templateToFinvietForm(parsed)
}

export function withFreshFinvietTimestampsBody(body) {
  const times = freshFinvietTimestamps()
  return {
    ...body,
    timestamp: times.timestamp,
    transaction: {
      ...body.transaction,
      created_at: times.createdAt,
      success_at: times.successAt,
      updated_at: times.updatedAt,
    },
  }
}

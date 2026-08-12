import {
  buildFinvietNotificationTemplate,
  generateFinvietMerchantBillId,
  generateFinvietPaymentTransId,
  generateFinvietRefCode,
  FINVIET_DEFAULT_SECRET_KEY,
} from '../config/finvietNotificationConfig.js'
import { loadStoredFinvietSecret } from './posStandaloneKeyStore.js'

function nullIfEmpty(value) {
  const s = String(value ?? '').trim()
  return s ? s : null
}

export const DEFAULT_FINVIET_FORM = {
  ...templateToFinvietForm(buildFinvietNotificationTemplate()),
  secretKey: loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
}

export function withFreshFinvietIds(form) {
  const ts = Date.now()
  const created = ts - 50000
  const success = ts - 10000
  return {
    ...form,
    secretKey: form.secretKey?.trim() || loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
    timestamp: ts,
    merchantBillId: generateFinvietMerchantBillId(),
    refCode: generateFinvietRefCode(),
    paymentTransid: generateFinvietPaymentTransId(),
    createdAt: created,
    successAt: success,
    updatedAt: success,
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

export function finvietFormToBody(form) {
  const body = {
    amount: Number(form.amount),
    status: form.status,
    currency: form.currency.trim(),
    timestamp: Number(form.timestamp),
    store_code: form.storeCode.trim(),
    transaction: {
      ref_code: form.refCode.trim(),
      error_msg: form.errorMsg.trim(),
      is_global: Boolean(form.isGlobal),
      created_at: Number(form.createdAt),
      error_code: form.errorCode.trim(),
      is_timeout: Boolean(form.isTimeout),
      success_at: Number(form.successAt),
      updated_at: Number(form.updatedAt),
      approve_code: form.approveCode.trim(),
      payment_status: form.paymentStatus,
      payment_channel: form.paymentChannel,
      payment_transid: form.paymentTransid.trim(),
    },
    customer_info: {
      card_info: {
        card_type: form.cardType,
        card_holder: nullIfEmpty(form.cardHolder),
        card_number: form.cardNumber.trim(),
        card_origin: form.cardOrigin,
      },
      customer_name: nullIfEmpty(form.customerName),
    },
    merchant_code: form.merchantCode.trim(),
    merchant_bill_id: form.merchantBillId.trim(),
    store_code_partner: form.storeCodePartner.trim(),
    merchant_code_partner: form.merchantCodePartner.trim(),
  }

  if (form.retailAppId?.trim()) body.retail_app_id = form.retailAppId.trim()
  if (form.signature?.trim()) body.signature = form.signature.trim()

  return body
}

export function parseFinvietFormFromJson(jsonText) {
  const parsed = JSON.parse(jsonText)
  return templateToFinvietForm(parsed)
}

export function withFreshFinvietIdsBody(body) {
  const ts = Date.now()
  const created = ts - 50000
  const success = ts - 10000
  return {
    ...body,
    timestamp: ts,
    merchant_bill_id: generateFinvietMerchantBillId(),
    transaction: {
      ...body.transaction,
      ref_code: generateFinvietRefCode(),
      payment_transid: generateFinvietPaymentTransId(),
      created_at: created,
      success_at: success,
      updated_at: success,
    },
  }
}

import { NOTIFICATION_TEMPLATES } from '../config/posStandaloneConfig.js'

export const DEFAULT_NOTIFICATION_FORM = templateToForm(NOTIFICATION_TEMPLATES.sale)

export function templateToForm(template = {}) {
  return {
    tranId: template.tranId ?? '',
    tranStatus: template.tranStatus ?? 'APPROVED',
    tranType: template.tranType ?? 'SALE',
    paymentMethod: template.paymentMethod ?? 'MASTERCARD',
    posReference: template.posReference ?? '',
    issCountryCode: template.issCountryCode ?? '',
    linkedTranId: template.linkedTranId ?? '',
    deviceAlias: template.deviceAlias ?? 'UNKNOWN',
    amountCurrency: template.amount?.currency ?? 'SGD',
    amountValue: template.amount?.value ?? 0,
    cardPan: template.cardPan ?? '',
    approvalCode: template.approvalCode ?? '',
    merchantId: template.extraData?.merchantId ?? '',
    subMid: template.extraData?.subMid ?? '',
    subTid: template.extraData?.subTid ?? '',
    jwtSecret: template.extraData?.jwtSecret ?? '',
  }
}

export function formToNotificationBody(form) {
  const body = {
    tranId: form.tranId.trim(),
    tranStatus: form.tranStatus,
    tranType: form.tranType,
    paymentMethod: form.paymentMethod,
    posReference: form.posReference.trim(),
    linkedTranId: form.linkedTranId.trim(),
    deviceAlias: form.deviceAlias.trim() || 'UNKNOWN',
    amount: {
      currency: form.amountCurrency.trim(),
      value: Number(form.amountValue),
    },
    extraData: {
      merchantId: form.merchantId.trim(),
      subMid: form.subMid.trim(),
      subTid: form.subTid.trim(),
    },
  }

  if (form.jwtSecret.trim()) body.extraData.jwtSecret = form.jwtSecret.trim()
  if (form.issCountryCode.trim()) body.issCountryCode = form.issCountryCode.trim()
  if (form.cardPan.trim()) body.cardPan = form.cardPan.trim()
  if (form.approvalCode.trim()) body.approvalCode = form.approvalCode.trim()

  return body
}

export function parseNotificationFormFromJson(jsonText) {
  const parsed = JSON.parse(jsonText)
  return templateToForm(parsed)
}

export function notificationBodyJson(body) {
  return JSON.stringify(body)
}

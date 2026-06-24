// Payment Action (PaymentProcessRequest / XML+JWE+JWS) endpoints by environment.
// Per 2C2P docs: https://developer.2c2p.com/docs/payment-action-api-spec
export const PAYMENT_ACTION_ENVIRONMENTS = {
  sandbox: 'https://demo2.2c2p.com/2C2PFrontend/PaymentAction/2.0/action',
  production: 'https://t.2c2p.com/PaymentAction/2.0/action',
  mpay: 'https://pgwcore.m-pay.vn/PaymentActionV2/2.0/action',
}

export const PAYMENT_ACTION_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

export const PROCESS_TYPE_OPTIONS = ['I', 'R', 'V']

// Timestamp format per 2C2P docs: ddMMyyHHmmss
export function generateTimestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    p(d.getDate()) +
    p(d.getMonth() + 1) +
    String(d.getFullYear()).slice(2) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  )
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const hasText = (v) => v != null && String(v).trim() !== ''

function loyaltyHasData(loyalty) {
  if (!loyalty) return false
  const rewards = (loyalty.rewards || []).filter(
    (r) => hasText(r.type) || hasText(r.quantity)
  )
  return (
    hasText(loyalty.loyaltyProvider) ||
    hasText(loyalty.externalMerchantId) ||
    hasText(loyalty.totalRefundRewardAmount) ||
    rewards.length > 0
  )
}

function buildLoyaltyXml(loyalty, indent) {
  if (!loyaltyHasData(loyalty)) return ''
  const pad = ' '.repeat(indent)
  const pad2 = ' '.repeat(indent + 2)
  const pad3 = ' '.repeat(indent + 4)
  const pad4 = ' '.repeat(indent + 6)
  let out = `${pad}<loyaltyPayments>\n${pad2}<loyaltyRefund>\n`
  if (hasText(loyalty.loyaltyProvider))
    out += `${pad3}<loyaltyProvider>${escapeXml(loyalty.loyaltyProvider.trim())}</loyaltyProvider>\n`
  if (hasText(loyalty.externalMerchantId))
    out += `${pad3}<externalMerchantId>${escapeXml(loyalty.externalMerchantId.trim())}</externalMerchantId>\n`
  if (hasText(loyalty.totalRefundRewardAmount))
    out += `${pad3}<totalRefundRewardAmount>${escapeXml(
      loyalty.totalRefundRewardAmount.trim()
    )}</totalRefundRewardAmount>\n`
  const rewards = (loyalty.rewards || []).filter((r) => hasText(r.type) || hasText(r.quantity))
  if (rewards.length) {
    out += `${pad3}<refundRewards>\n`
    for (const r of rewards) {
      out += `${pad4}<reward>\n`
      if (hasText(r.type)) out += `${pad4}  <type>${escapeXml(r.type.trim())}</type>\n`
      if (hasText(r.quantity)) out += `${pad4}  <quantity>${escapeXml(r.quantity.trim())}</quantity>\n`
      out += `${pad4}</reward>\n`
    }
    out += `${pad3}</refundRewards>\n`
  }
  out += `${pad2}</loyaltyRefund>\n${pad}</loyaltyPayments>\n`
  return out
}

// Build the PaymentProcessRequest XML, ordered/structured per 2C2P docs.
export function buildPaymentActionXml(f) {
  const el = (tag, value) => `  <${tag}>${escapeXml(value)}</${tag}>\n`
  let xml = '<PaymentProcessRequest>\n'
  xml += el('version', f.version)
  xml += el('timeStamp', f.timestamp)
  xml += el('merchantID', f.mid)
  xml += el('processType', f.processType)
  xml += el('invoiceNo', f.invoiceNo)
  xml += el('actionAmount', f.amount)

  if (hasText(f.recurringId)) xml += el('recurringUniqueID', f.recurringId.trim())
  if (hasText(f.bankCode)) xml += el('bankCode', f.bankCode.trim())
  if (hasText(f.accountName)) xml += el('accountName', f.accountName.trim())
  if (hasText(f.accountNumber)) xml += el('accountNumber', f.accountNumber.trim())

  const validSubs = (f.subMerchants || []).filter(
    (s) => hasText(s.subMID) || hasText(s.subAmount) || loyaltyHasData(s.loyalty)
  )
  if (validSubs.length) {
    xml += '  <subMerchantList>\n'
    for (const s of validSubs) {
      const attrs = []
      if (hasText(s.subMID)) attrs.push(`subMID="${escapeXml(s.subMID.trim())}"`)
      if (hasText(s.subAmount)) attrs.push(`subAmount="${escapeXml(s.subAmount.trim())}"`)
      const attrStr = attrs.length ? ' ' + attrs.join(' ') : ''
      if (loyaltyHasData(s.loyalty)) {
        xml += `    <subMerchant${attrStr}>\n`
        xml += buildLoyaltyXml(s.loyalty, 6)
        xml += '    </subMerchant>\n'
      } else {
        xml += `    <subMerchant${attrStr} />\n`
      }
    }
    xml += '  </subMerchantList>\n'
  }

  if (hasText(f.notifyURL)) xml += el('notifyURL', f.notifyURL.trim())
  if (hasText(f.idempotencyId)) xml += el('idempotencyID', f.idempotencyId.trim())

  xml += buildLoyaltyXml(f.topLoyalty, 2)

  ;(f.userDefined || []).forEach((v, i) => {
    if (hasText(v)) xml += el(`userDefined${i + 1}`, v.trim())
  })

  xml += '</PaymentProcessRequest>'
  return xml
}

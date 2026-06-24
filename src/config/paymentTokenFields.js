// Payment Token request parameters, grouped by category.
// Mirrors the Python `_param_categories()` definition.

export const PAYMENT_CHANNEL_OPTIONS = [
  'ALL',
  'CC',
  'IPP',
  'APM',
  'QR',
  'VNPAY',
  'MOMO',
  'ZALOPAY',
]

export const DEFAULT_MERCHANT_ID = '704704000000000'

export const DEFAULT_SECRET_KEY =
  '0A85F7ED911FD69D3316ECDF20FCA4E138E590E7EF5D93009FEF1BEC5B2FF13F'

const SCA_OPTIONS = [
  'authentication_outage',
  'delegated_authentication',
  'low_value',
  'low_risk',
  'secure_corporate_payment',
  'trusted_merchant',
  'recurring_payment',
  'out_of_sca_scope',
  'transaction_risk_assessment',
  'other',
  'none',
]

// kind: text | select | bool | int | float | list_csv | list_int_csv | json | submerchants
export const PARAM_CATEGORIES = [
  {
    id: 'urls',
    title: '🔗 URLs',
    fields: [
      {
        name: 'frontendReturnUrl',
        label: 'Frontend Return URL',
        kind: 'text',
      },
      {
        name: 'backendReturnUrl',
        label: 'Backend Return URL',
        kind: 'text',
      },
      { name: 'schemeReturnUrl', label: 'Scheme Return URL', kind: 'text' },
      { name: 'appBundleID', label: 'App Bundle ID', kind: 'text' },
      { name: 'nonceStr', label: 'Nonce Str', kind: 'text' },
    ],
  },
  {
    id: 'payment',
    title: '💳 Payment',
    fields: [
      { name: 'locale', label: 'Locale', kind: 'select', options: ['vi', 'en'] },
      { name: 'request3DS', label: 'Request 3DS', kind: 'select', options: ['Y', 'F', 'N'] },
      {
        name: 'paymentExpiry',
        label: 'Payment Expiry (yyyy-MM-dd HH:mm:ss)',
        kind: 'text',
      },
      { name: 'immediatePayment', label: 'Immediate Payment', kind: 'bool' },
      { name: 'iframeMode', label: 'Iframe Mode', kind: 'bool' },
      { name: 'paymentRouteID', label: 'Payment Route ID', kind: 'text' },
      { name: 'promotionCode', label: 'Promotion Code', kind: 'text' },
      {
        name: 'transactionInitiator',
        label: 'Transaction Initiator',
        kind: 'select',
        options: ['C', 'M'],
      },
      { name: 'transactionMode', label: 'Transaction Mode', kind: 'text' },
      { name: 'agentChannel', label: 'Agent Channel (CSV)', kind: 'list_csv' },
      { name: 'allowCustomerNote', label: 'Allow Customer Note', kind: 'bool' },
    ],
  },
  {
    id: 'tokenization',
    title: '🎫 Tokenization',
    fields: [
      { name: 'tokenize', label: 'Tokenize', kind: 'bool' },
      { name: 'tokenizeOnly', label: 'Tokenize Only', kind: 'bool' },
      { name: 'customerTokenOnly', label: 'Customer Token Only', kind: 'bool' },
      { name: 'customerToken', label: 'Customer Token (CSV)', kind: 'list_csv' },
      {
        name: 'storeCredentials',
        label: 'Store Credentials',
        kind: 'select',
        options: ['F', 'S', 'N'],
      },
      { name: 'externalToken', label: 'External Token', kind: 'text' },
    ],
  },
  {
    id: 'installment',
    title: '💰 Installment',
    fields: [
      { name: 'interestType', label: 'Interest Type', kind: 'select', options: ['A', 'C', 'M'] },
      {
        name: 'installmentPeriodFilter',
        label: 'Installment Period Filter (CSV int)',
        kind: 'list_int_csv',
      },
      { name: 'installmentBankFilter', label: 'Installment Bank Filter (CSV)', kind: 'list_csv' },
      { name: 'productCode', label: 'Product Code', kind: 'text' },
    ],
  },
  {
    id: 'recurring',
    title: '🔁 Recurring',
    fields: [
      { name: 'recurring', label: 'Recurring', kind: 'bool' },
      { name: 'invoicePrefix', label: 'Invoice Prefix', kind: 'text' },
      { name: 'recurringAmount', label: 'Recurring Amount', kind: 'float' },
      { name: 'allowAccumulate', label: 'Allow Accumulate', kind: 'bool' },
      { name: 'maxAccumulateAmount', label: 'Max Accumulate Amount', kind: 'float' },
      { name: 'recurringInterval', label: 'Recurring Interval (days)', kind: 'int' },
      { name: 'recurringCount', label: 'Recurring Count', kind: 'int' },
      { name: 'chargeNextDate', label: 'Charge Next Date (ddMMyyyy)', kind: 'text' },
      { name: 'chargeOnDate', label: 'Charge On Date (ddMM)', kind: 'text' },
    ],
  },
  {
    id: '3ds',
    title: '🔐 3DS / Auth',
    fields: [
      { name: 'protocolVersion', label: 'Protocol Version', kind: 'text', help: 'Default: 2.1.0' },
      {
        name: 'eci',
        label: 'ECI',
        kind: 'select',
        options: ['00', '01', '02', '05', '06', '07', '80', '81', '82', '83'],
      },
      { name: 'cavv', label: 'CAVV', kind: 'text' },
      { name: 'dsTransactionId', label: 'DS Transaction ID', kind: 'text' },
      {
        name: 'scaExemptionIndicator',
        label: 'SCA Exemption Indicator',
        kind: 'select',
        options: SCA_OPTIONS,
      },
      { name: 'previousPaymentID', label: 'Previous Payment ID', kind: 'text' },
      { name: 'allow3DSUpgrade', label: 'Allow 3DS Upgrade', kind: 'select', options: ['Y', 'N'] },
      { name: 'requestReauthentication', label: 'Request Reauthentication', kind: 'bool' },
    ],
  },
  {
    id: 'forex',
    title: '💱 Forex',
    fields: [
      { name: 'fxProviderCode', label: 'FX Provider Code', kind: 'text' },
      { name: 'fxRateId', label: 'FX Rate ID', kind: 'text' },
      { name: 'originalAmount', label: 'Original Amount', kind: 'float' },
    ],
  },
  {
    id: 'merchant',
    title: '🏬 Merchant',
    fields: [
      { name: 'externalSubMerchantID', label: 'External Sub Merchant ID', kind: 'text' },
      { name: 'childMerchantID', label: 'Child Merchant ID', kind: 'text' },
      {
        name: 'defaultSettlementCurrencyMerchantID',
        label: 'Default Settlement Currency Merchant ID',
        kind: 'text',
      },
      {
        name: 'settlementCurrencyMerchantID',
        label: 'Settlement Currency Merchant ID',
        kind: 'text',
      },
      { name: 'statementDescriptor', label: 'Statement Descriptor', kind: 'text' },
      {
        name: 'newRedisCacheOptimizationSwitchTag',
        label: 'Redis Cache Optimization',
        kind: 'bool',
      },
      { name: 'subMerchants', label: 'Sub Merchants', kind: 'submerchants' },
    ],
  },
  {
    id: 'userDefined',
    title: '📝 User Defined',
    fields: [
      { name: 'userDefined1', label: 'User Defined 1', kind: 'text' },
      { name: 'userDefined2', label: 'User Defined 2', kind: 'text' },
      { name: 'userDefined3', label: 'User Defined 3', kind: 'text' },
      { name: 'userDefined4', label: 'User Defined 4', kind: 'text' },
      { name: 'userDefined5', label: 'User Defined 5', kind: 'text' },
    ],
  },
  {
    id: 'client',
    title: '🧾 Client',
    fields: [
      { name: 'clientIP', label: 'Client IP', kind: 'text' },
      { name: 'clientAppID', label: 'Client App ID', kind: 'text' },
      { name: 'userAgent', label: 'User Agent', kind: 'text' },
    ],
  },
  {
    id: 'complex',
    title: '📦 Complex (JSON)',
    fields: [
      { name: 'paymentItems', label: 'Payment Items', kind: 'json' },
      {
        name: 'uiParams',
        label: 'UI Params',
        kind: 'json',
        default: JSON.stringify(
          { userInfo: { name: 'Eddy Vu', email: 'eddy.vu@2c2p.com' } },
          null,
          2
        ),
      },
      { name: 'customerAddress', label: 'Customer Address', kind: 'json' },
      { name: 'airlinePassengers', label: 'Airline Passengers', kind: 'json' },
      { name: '3DSecure2Params', label: '3DSecure2 Params', kind: 'json' },
      { name: 'loyaltyPoints', label: 'Loyalty Points', kind: 'json' },
      { name: 'browserDetails', label: 'Browser Details', kind: 'json' },
      { name: 'accountFunding', label: 'Account Funding', kind: 'json' },
    ],
  },
]

// Payment token endpoints by environment.
export const ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/paymentToken',
  production: 'https://pgw.2c2p.com/payment/4.3/paymentToken',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/paymentToken',
}

// Labels for the environment dropdown (order preserved).
export const ENVIRONMENT_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

// Helpers --------------------------------------------------------------

export function generateInvoiceNo() {
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
  return `INV${ts}${rand}`
}

export function generateIdempotencyId() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts =
    String(d.getFullYear()).slice(2) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  return `idem-${ts}`
}

// Remove null/undefined/empty-string/empty-array/empty-object values.
export function omitEmptyFields(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue
    out[k] = v
  }
  return out
}

// Payout Request API (JWT HS256, body: { payload }).
// https://developer.2c2p.com/docs/create-payout
import { omitEmptyFields } from './paymentTokenFields.js'

export const PAYOUT_CREATE_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payouts/api/v1.2/payout/create',
  production: 'https://pgw.2c2p.com/payouts/api/v1.2/payout/create',
}

export const PAYOUT_CREATE_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'custom', label: 'Custom' },
]

/** Per 2C2P Payout Request Parameter spec. */
export const BENEFICIARY_TYPE_OPTIONS = [
  'DEFAULT',
  'BANKACC',
  'MOBILE',
  'IDN',
  'CIDN',
  'PPN',
  'APN',
]

export const DEFAULT_PAYOUT_MERCHANT_ID = '704704000000423'

export const DEFAULT_PAYOUT_SECRET_KEY =
  'DB073121D8191443F5AF828A7EF05A470E13972C690543317FF6A2C22D4F8C21'

/** dd/MM/yyyy */
export function formatPayoutDateToday() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

export const DEFAULT_PAYOUT_PAYLOAD = {
  merchantID: DEFAULT_PAYOUT_MERCHANT_ID,
  beneficiaryName: 'NGUYEN VAN A',
  amount: 1000,
  beneficiaryBankCode: 'MB',
  requestID: '',
  UTR: '',
  preferredSofProfile: 'GIP',
  beneficiaryId: '',
  beneficiaryType: 'MOBILE',
  beneficiaryTypeValue: '1622789857942',
  preferredProvider: '',
  notificationUrl: '',
  userDefined1: '',
  userDefined2: '',
  userDefined3: '',
  userDefined4: '',
  userDefined5: '',
}

/**
 * Field metadata for Create Payout form (mirrors API parameter table).
 * mandatory: M | C | O
 */
export const PAYOUT_CREATE_FIELD_META = {
  merchantID: { mandatory: 'M', type: 'AN', maxLength: 25 },
  beneficiaryName: { mandatory: 'M', type: 'A', maxLength: 150 },
  amount: { mandatory: 'M', type: 'D', maxLength: 16, decimals: 2 },
  beneficiaryBankCode: { mandatory: 'M', type: 'AN', maxLength: 20 },
  requestID: { mandatory: 'M', type: 'AN', maxLength: 40, uuid: true },
  UTR: { mandatory: 'O', type: 'AN', maxLength: 22, invoiceLike: true },
  payoutDate: { mandatory: 'O', type: 'C', maxLength: 10, autoToday: true },
  userDefined1: { mandatory: 'O', type: 'C', maxLength: 150, group: 'userDefined' },
  userDefined2: { mandatory: 'O', type: 'C', maxLength: 150, group: 'userDefined' },
  userDefined3: { mandatory: 'O', type: 'C', maxLength: 150, group: 'userDefined' },
  userDefined4: { mandatory: 'O', type: 'C', maxLength: 150, group: 'userDefined' },
  userDefined5: { mandatory: 'O', type: 'C', maxLength: 150, group: 'userDefined' },
  preferredSofProfile: { mandatory: 'O', type: 'AN', maxLength: 10 },
  beneficiaryId: { mandatory: 'C', type: 'AN', maxLength: 50 },
  beneficiaryType: { mandatory: 'C', type: 'C', maxLength: 50 },
  beneficiaryTypeValue: { mandatory: 'C', type: 'C', maxLength: 50 },
  preferredProvider: { mandatory: 'C', type: 'C', maxLength: 50 },
  notificationUrl: { mandatory: 'O', type: 'C', maxLength: 255 },
}

export function buildPayoutCreatePayload(values) {
  const amount = Number.parseFloat(values.amount)
  const payload = {
    merchantID: values.merchantID?.trim(),
    beneficiaryName: values.beneficiaryName?.trim(),
    amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : values.amount,
    beneficiaryBankCode: values.beneficiaryBankCode?.trim(),
    requestID: values.requestID?.trim(),
    payoutDate: values.payoutDate?.trim() || formatPayoutDateToday(),
    beneficiaryType: values.beneficiaryType?.trim(),
    beneficiaryTypeValue: values.beneficiaryTypeValue?.trim(),
  }

  const utr = values.UTR?.trim()
  if (utr) payload.UTR = utr.slice(0, PAYOUT_CREATE_FIELD_META.UTR.maxLength)

  const optionalKeys = [
    'userDefined1',
    'userDefined2',
    'userDefined3',
    'userDefined4',
    'userDefined5',
    'preferredSofProfile',
    'beneficiaryId',
    'preferredProvider',
    'notificationUrl',
  ]

  for (const key of optionalKeys) {
    const v = values[key]
    if (typeof v === 'string' && v.trim()) {
      const max = PAYOUT_CREATE_FIELD_META[key]?.maxLength
      payload[key] = max ? v.trim().slice(0, max) : v.trim()
    }
  }

  return omitEmptyFields(payload)
}

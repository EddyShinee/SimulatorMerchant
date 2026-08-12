/** App feature keys — admin toggles these; members only see enabled ones. */

export const ROLES = {
  admin: 'admin',
  member: 'member',
}

export const FEATURE_GROUPS = [
  {
    id: 'main',
    labelKey: 'access.groupMain',
    features: [
      { key: 'dashboard', labelKey: 'nav.dashboard', locked: true },
      { key: 'registration', labelKey: 'access.registration', global: true },
      { key: 'payment-flow', labelKey: 'nav.paymentFlow' },
      { key: 'inbox', labelKey: 'nav.requestInbox' },
    ],
  },
  {
    id: 'api',
    labelKey: 'access.groupApi',
    features: [
      { key: 'payment-token', labelKey: 'apis.paymentToken' },
      { key: 'merchant-vault', labelKey: 'access.merchantVault', global: true },
      { key: 'payment-options', labelKey: 'apis.paymentOptions' },
      { key: 'payment-option-details', labelKey: 'apis.paymentOptionDetails' },
      { key: 'do-payment', labelKey: 'apis.doPayment' },
      { key: 'payment-action', labelKey: 'apis.paymentAction' },
      { key: 'transaction-status-inquiry', labelKey: 'apis.transactionStatusInquiry' },
      { key: 'payment-inquiry', labelKey: 'apis.paymentInquiry' },
      { key: 'payment-pos', labelKey: 'apis.paymentPos' },
      { key: 'analysis', labelKey: 'apis.analysis' },
    ],
  },
  {
    id: 'payout',
    labelKey: 'access.groupPayout',
    features: [
      { key: 'payout-create', labelKey: 'nav.payoutCreate' },
      { key: 'payout-inquiry', labelKey: 'nav.payoutInquiry' },
    ],
  },
  {
    id: 'pos',
    labelKey: 'access.groupPos',
    features: [{ key: 'pos-standalone', labelKey: 'nav.posStandalone' }],
  },
]

export const FEATURE_KEYS = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.key))

export const DEFAULT_FEATURE_MAP = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.features.map((f) => [f.key, true]))
)

export function isAdminRole(role) {
  return role === ROLES.admin
}

/** Feature required to open this app path. `null` = always allowed (e.g. /app). */
export function featureKeyForPath(pathname) {
  const p = String(pathname || '')
  if (p.startsWith('/app/access')) return '__admin__'
  if (p.startsWith('/app/payment-flow')) return 'payment-flow'
  if (p.startsWith('/app/payout/create')) return 'payout-create'
  if (p.startsWith('/app/payout/inquiry')) return 'payout-inquiry'
  if (p.startsWith('/app/pos-standalone')) return 'pos-standalone'
  if (p.startsWith('/app/inbox')) return 'inbox'
  const apiMatch = p.match(/\/app\/api\/([^/]+)/)
  if (apiMatch) return apiMatch[1]
  return null
}

const STORAGE_KEY = 'sim_payment_presets'

const DEFAULTS = {
  merchantId: '704704000000000',
  secretKey:
    '0A85F7ED911FD69D3316ECDF20FCA4E138E590E7EF5D93009FEF1BEC5B2FF13F',
  invoiceNo: '',
  paymentToken: '',
  posTimeoutSec: 300,
  analysisSessionId: '',
  analysisFullCookie: '',
  flowTimeline: [],
  categoryCode: '',
  groupCode: '',
  categoryName: '',
  groupName: '',
  channelCode: '',
  agentCode: '',
  agentChannelCode: '',
  selectedChannelName: '',
  requiresCard: false,
  channelGroups: [],
  optionCategories: [],
}

export function loadPaymentPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePaymentPresets(partial) {
  try {
    const next = { ...loadPaymentPresets(), ...partial }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  } catch {
    return loadPaymentPresets()
  }
}

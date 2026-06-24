export const ANALYSIS_API_OPTIONS = {
  '2C2P (Global)': 'https://my.2c2p.com/2.0/Transaction/PrintSearchTransactionV2',
  'M-Pay': 'https://my.m-pay.vn/2.0/Transaction/PrintSearchTransactionV2',
}

export const ANALYSIS_API_SELECT = Object.entries(ANALYSIS_API_OPTIONS).map(([label, url]) => ({
  label,
  url,
}))

export const TIME_FILTERS = ['Day', 'Hour', 'Minute']
export const CHART_TYPES = ['Bar', 'Line', 'Area']

export const STATUS_COLORS = {
  Approved: '#22c55e',
  Settled: '#3b82f6',
  Rejected: '#ef4444',
  'Payment Expired': '#f97316',
  Pending: '#eab308',
}

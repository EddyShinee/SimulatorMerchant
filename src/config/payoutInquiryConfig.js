// Payout Inquiry API (JWT HS256, body: { payload }).
// https://developer.2c2p.com/docs/payout-inquiry
export const PAYOUT_INQUIRY_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payouts/api/v1.2/payout/inquiry',
  production: 'https://pgw.2c2p.com/payouts/api/v1.2/payout/inquiry',
}

export const PAYOUT_INQUIRY_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'custom', label: 'Custom' },
]

export const DEFAULT_PAYOUT_INQUIRY_PAYLOAD = {
  requestID: '',
  UTR: '0000001',
}

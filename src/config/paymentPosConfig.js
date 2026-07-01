// Payment POS (order create) endpoints by environment.
export const PAYMENT_POS_ENVIRONMENTS = {
  sandbox: 'https://sandbox-posgw.2c2p.com/pos/4.4/order/create',
  production: 'https://posgw.2c2p.com/pos/4.4/order/create',
  mpay: 'https://posgw.m-pay.vn/pos/4.4/order/create',
}

export const PAYMENT_POS_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

export const DEFAULT_REQUEST_TIMEOUT_SEC = 300
export const MIN_REQUEST_TIMEOUT_SEC = 5
export const MAX_REQUEST_TIMEOUT_SEC = 300

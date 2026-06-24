// Payment Options — plain JSON POST.
// https://developer.2c2p.com/reference/post_payment-4-3-paymentoption
export const PAYMENT_OPTIONS_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/paymentoption',
  production: 'https://pgw.2c2p.com/payment/4.3/paymentoption',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/paymentOption',
}

export const PAYMENT_OPTIONS_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

export const DEFAULT_BROWSER_DETAILS = {
  deviceType: 'desktop',
  name: 'Chrome',
  os: 'macOS',
  version: '122.0.0',
}

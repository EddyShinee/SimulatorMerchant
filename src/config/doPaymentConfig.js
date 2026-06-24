// Do Payment endpoints by environment.
export const DO_PAYMENT_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/payment',
  production: 'https://pgw.2c2p.com/payment/4.3/payment',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/payment',
}

export const DO_PAYMENT_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

export const QR_TYPE_OPTIONS = ['RAW', 'BASE64', 'URL']

// 2C2P client-side card encryption SDK.
export const MY2C2P_SDK_URL =
  'https://demo2.2c2p.com/2C2PFrontEnd/SecurePayment/api/my2c2p.1.7.6.min.js'

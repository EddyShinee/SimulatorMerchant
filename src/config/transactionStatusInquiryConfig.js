// Transaction Status Inquiry — plain JSON POST (no JWT).
// https://developer.2c2p.com/reference/post_payment-4-3-transactionstatus
export const TXN_STATUS_INQUIRY_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/transactionstatus',
  production: 'https://pgw.2c2p.com/payment/4.3/transactionstatus',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/transactionStatus',
}

export const TXN_STATUS_INQUIRY_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

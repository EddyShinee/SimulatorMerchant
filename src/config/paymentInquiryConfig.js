// Payment Inquiry endpoints (JWT HS256, body: { payload }).
// https://developer.2c2p.com/reference/post_payment-4-3-paymentinquiry
export const PAYMENT_INQUIRY_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/paymentinquiry',
  production: 'https://pgw.2c2p.com/payment/4.3/paymentinquiry',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/paymentInquiry',
}

export const PAYMENT_INQUIRY_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

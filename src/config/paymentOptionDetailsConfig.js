// Payment Option Details — plain JSON POST.
// https://developer.2c2p.com/docs/api-payment-option-details
export const PAYMENT_OPTION_DETAILS_ENVIRONMENTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com/payment/4.3/paymentoptiondetails',
  production: 'https://pgw.2c2p.com/payment/4.3/paymentoptiondetails',
  mpay: 'https://pgw.m-pay.vn/payment/4.1/paymentOptionDetails',
}

export const PAYMENT_OPTION_DETAILS_ENV_OPTIONS = [
  { value: 'sandbox', label: 'Sandbox (2C2P)' },
  { value: 'production', label: 'Production (2C2P)' },
  { value: 'mpay', label: 'MPay' },
  { value: 'custom', label: 'Custom' },
]

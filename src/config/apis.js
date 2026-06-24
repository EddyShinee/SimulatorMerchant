// Catalog of payment APIs shown in the left "Choose API" menu.
// Each entry drives the API console: default HTTP method, the relative
// hook path used as a self-contained demo target, and a sample request body.
export const API_CATALOG = [
  {
    id: 'payment-token',
    nameKey: 'apis.paymentToken',
    method: 'POST',
    path: '/api/simulator/hook/payment-token',
    sampleBody: {
      merchantId: 'MERCHANT_001',
      amount: 100000,
      currency: 'VND',
    },
  },
  {
    id: 'payment-options',
    nameKey: 'apis.paymentOptions',
    method: 'GET',
    path: '/api/simulator/hook/payment-options',
    sampleBody: null,
  },
  {
    id: 'payment-option-details',
    nameKey: 'apis.paymentOptionDetails',
    method: 'GET',
    path: '/api/simulator/hook/payment-option-details',
    sampleBody: null,
  },
  {
    id: 'do-payment',
    nameKey: 'apis.doPayment',
    method: 'POST',
    path: '/api/simulator/hook/do-payment',
    sampleBody: {
      token: 'PAYMENT_TOKEN',
      optionId: 'OPTION_001',
      amount: 100000,
    },
  },
  {
    id: 'payment-action',
    nameKey: 'apis.paymentAction',
    method: 'POST',
    path: '/api/simulator/hook/payment-action',
    sampleBody: {
      transactionId: 'TXN_0001',
      action: 'CAPTURE',
    },
  },
  {
    id: 'transaction-status-inquiry',
    nameKey: 'apis.transactionStatusInquiry',
    method: 'GET',
    path: '/api/simulator/hook/transaction-status-inquiry',
    sampleBody: null,
  },
  {
    id: 'payment-inquiry',
    nameKey: 'apis.paymentInquiry',
    method: 'GET',
    path: '/api/simulator/hook/payment-inquiry',
    sampleBody: null,
  },
  {
    id: 'payment-pos',
    nameKey: 'apis.paymentPos',
    method: 'POST',
    path: '/api/simulator/hook/payment-pos',
    sampleBody: {
      terminalId: 'POS_001',
      amount: 100000,
      currency: 'VND',
    },
  },
  {
    id: 'analysis',
    nameKey: 'apis.analysis',
    method: 'GET',
    path: '/api/simulator/hook/analysis',
    sampleBody: null,
  },
]

export function getApiById(id) {
  return API_CATALOG.find((api) => api.id === id) || null
}

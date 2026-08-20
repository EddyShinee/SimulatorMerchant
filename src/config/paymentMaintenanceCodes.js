/** 2C2P Payment Maintenance Result Codes — developer.2c2p.com */
export const PAYMENT_MAINTENANCE_RESULT_CODES = {
  '00': 'Success',
  '01': 'Stored card ID cannot be found',
  '02': 'Invalid Request',
  '03': 'Invalid Merchant ID',
  '04': 'Invalid Stored Card Unique ID',
  '05': 'Invalid Customer Email',
  '10': 'Missing Compulsory Values',
  '11': 'Request validation failed.',
  '12': 'Transaction status is not valid to perform your action.',
  '13': 'Invalid hash value.',
  '14': 'Invalid merchant ID.',
  '15': 'Invalid invoice number.',
  '16': "Requested transaction doesn't exist.",
  '17': 'Request type is invalid.',
  '18': 'Invalid Action Amount.',
  '21': 'Void not allowed.',
  '22': 'Sub Transaction cannot be voided individually.',
  '25': 'Void failed.',
  '29': 'Transaction is already voided.',
  '30': 'Unable to refund/settle more than transaction amount.',
  '31': 'Settlement not allowed.',
  '32': 'Settlement is not required.',
  '33': 'Partial settlement not allowed.',
  '34':
    'Settlement rejected. PGW will respond if duplicate capture is detected. Please inquire the transaction’s capture status and only initiate a new capture if the previous attempt is not recorded.',
  '35': 'Settlement failed.',
  '36': 'Settlement not allowed beyond deadline.',
  '37': 'Sub Merchant settlement amount is more than transaction amount.',
  '38': 'Sub Transaction cannot be captured individually.',
  '39': 'Transaction is already settled.',
  '40': 'Refund amount is more than transaction amount.',
  '41': 'Refund not allowed.',
  '42': 'Refund pending.',
  '43': 'Partial refund not allowed.',
  '44': 'Refund rejected.',
  '45': 'Refund failed.',
  '46': 'Insufficient funds to perform refund.',
  '47': 'Sub Merchant refund amount is more than transaction amount.',
  '48': 'Sub merchant has insufficient funds to perform refund.',
  '49': 'Transaction is already fully refunded.',
  '50': 'Same Idempotent Key exists with different Type',
  '51': 'Same Idempotent Key exists with status Pending',
  '52': 'Cannot retrieve Main Txn. Refund failed.',
  '53': 'No transaction reference number.',
  '54': 'Refund exceeded allowable timeframe.',
  '61': 'Cancel not allowed.',
  '65': 'Cancel Failed.',
  '95': 'Request timed-out',
  '96': 'Unable to decrypt.',
  '97': 'Process is not supported.',
  '98': 'Request is not available',
  '99': 'Unable to complete the request.',
}

/** 2C2P Payment Maintenance Status Codes — developer.2c2p.com */
export const PAYMENT_MAINTENANCE_STATUS_CODES = {
  A: 'Approved.',
  AP: 'Approval Pending.',
  AE: 'Approved after Expired (APM).',
  AL: 'Approved with less amount (APM).',
  AM: 'Approved with more amount (APM).',
  PF: 'Payment Failed.',
  AR: 'Authentication Rejected (MPI Reject).',
  FF: 'Fraud Rule Rejected.',
  IP: 'Rejected (Invalid Promotion).',
  ROE: 'Rejected (Routing Rejected).',
  RP: 'Refund Pending.',
  RF: 'Refund confirmed.',
  RFF: 'Refund Failed.',
  RR: 'Refund Rejected.',
  RR1: 'Refund Rejected – insufficient balance.',
  RR2: 'Refund Rejected – invalid bank information.',
  RR3: 'Refund Rejected – bank account mismatch.',
  RS: 'Ready for Settlement.',
  S: 'Settled',
  T: 'Credit Adjustment',
  V: 'Voided / Canceled',
  VP: 'Void Pending',
  EX: 'Payment Expired',
  CTS: 'Tokenization Success',
  CTF: 'Tokenization Failed',
  PPC: 'Payment Partial Captured',
  PFC: 'Payment Fully Captured',
}

function normalizeResultCode(code) {
  const s = String(code ?? '').trim()
  if (!s) return ''
  if (/^\d+$/.test(s)) return s.padStart(2, '0')
  return s
}

export function lookupMaintenanceResultCode(code) {
  const key = normalizeResultCode(code)
  if (!key) return null
  return PAYMENT_MAINTENANCE_RESULT_CODES[key] ?? null
}

export function lookupMaintenanceStatusCode(code) {
  const key = String(code ?? '').trim().toUpperCase()
  if (!key) return null
  return PAYMENT_MAINTENANCE_STATUS_CODES[key] ?? null
}

export function isMaintenanceSuccess(code) {
  return normalizeResultCode(code) === '00'
}

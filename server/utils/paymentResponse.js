/** Parse 2C2P paymentResponse (base64 JSON, plain JSON, or JWT). */
export function parsePaymentResponse(raw) {
  if (raw == null || raw === '') return null
  const str = String(raw).trim()

  if (str.includes('.')) {
    try {
      const part = str.split('.')[1]
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
      return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    } catch {
      /* fall through */
    }
  }

  try {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8'))
  } catch {
    /* fall through */
  }

  try {
    return JSON.parse(str)
  } catch {
    return { raw: str }
  }
}

export function encodeCallbackDisplayToken({ raw, parsed, receivedAt, method, path }) {
  return Buffer.from(
    JSON.stringify({ raw, parsed, receivedAt, method, path }),
    'utf8'
  ).toString('base64url')
}

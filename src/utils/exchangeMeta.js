import { parsePaymentResponseClient } from './paymentResponse.js'

export function stampExchange(startedAt, method = 'POST') {
  const respondedAt = new Date()
  const requested = startedAt instanceof Date ? startedAt : new Date(startedAt || Date.now())
  return {
    method,
    requestedAt: requested.toISOString(),
    respondedAt: respondedAt.toISOString(),
    clientDurationMs: Math.max(0, respondedAt.getTime() - requested.getTime()),
  }
}

function objectFromText(text) {
  const s = String(text || '').trim()
  if (!s) return null
  const xmlCode = s.match(/<respCode[^>]*>([^<]+)<\/respCode>/i)
  if (xmlCode) {
    const desc = s.match(/<respDesc[^>]*>([^<]*)<\/respDesc>/i)
    return { respCode: xmlCode[1].trim(), respDesc: desc?.[1]?.trim() || '' }
  }
  const parsed = parsePaymentResponseClient(s)
  if (parsed && typeof parsed === 'object' && !parsed.raw) return parsed
  return null
}

function pickCode(value, depth = 0) {
  if (value == null || depth > 6) return null
  if (typeof value === 'string') return pickCode(objectFromText(value), depth + 1)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = pickCode(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof value !== 'object') return null

  const code = value.respCode ?? value.responseCode ?? value.RespCode
  if (code != null && String(code).trim()) {
    const desc = value.respDesc ?? value.respDescription ?? value.responseDesc ?? value.respMessage ?? ''
    return { respCode: String(code).trim(), respDesc: String(desc || '').trim() }
  }

  for (const key of ['decodedResponse', 'response', 'body', 'decryptedXml', 'rawResponse', 'data', 'payload']) {
    if (value[key] == null) continue
    const found = pickCode(value[key], depth + 1)
    if (found) return found
  }
  return null
}

const REQUEST_KEYS = new Set([
  'payload',
  'payloadData',
  'finalPayload',
  'jwtToken',
  'xml',
  'jwe',
  'jws',
  'requestHeaders',
])

/** Pull 2C2P respCode / respDesc from a stored exchange result. */
export function extractRespInfo(result) {
  if (!result || typeof result !== 'object') return null
  const preferred = ['decodedResponse', 'response', 'body', 'decryptedXml', 'rawResponse']
  for (const key of preferred) {
    const found = pickCode(result[key], 0)
    if (found) return found
  }
  const rest = {}
  for (const [key, value] of Object.entries(result)) {
    if (REQUEST_KEYS.has(key)) continue
    rest[key] = value
  }
  return pickCode(rest, 0)
}

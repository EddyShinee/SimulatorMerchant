import { decodeJwtPayload } from './jwt.js'

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

const JWT_FIELD_NAMES = ['payload', 'paymentToken', 'token', 'jwt', 'webhook-jwt', 'paymentResponse']

export function looksLikeJwt(value) {
  return typeof value === 'string' && JWT_RE.test(value.trim())
}

export function formatBodyRaw(body) {
  if (body == null) return ''
  if (typeof body === 'string') return body
  try {
    return JSON.stringify(body, null, 2)
  } catch {
    return String(body)
  }
}

function findJwtInValue(value, depth = 0) {
  if (depth > 3 || value == null) return null

  if (looksLikeJwt(value)) return value.trim()

  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const key of JWT_FIELD_NAMES) {
      if (key in value && looksLikeJwt(value[key])) return String(value[key]).trim()
    }
    for (const v of Object.values(value)) {
      const found = findJwtInValue(v, depth + 1)
      if (found) return found
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJwtInValue(item, depth + 1)
      if (found) return found
    }
  }

  return null
}

export function extractJwtFromBody(body) {
  if (body == null) return null

  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (looksLikeJwt(trimmed)) return trimmed
    try {
      return findJwtInValue(JSON.parse(trimmed))
    } catch {
      return null
    }
  }

  return findJwtInValue(body)
}

/** Raw text + optional JWT decode for inbox request body. */
export function analyzeInboxBody(body) {
  const rawText = formatBodyRaw(body)
  const jwtToken = extractJwtFromBody(body)
  if (!jwtToken) {
    return { rawText, jwtToken: null, decoded: null, decodedText: null }
  }

  const decoded = decodeJwtPayload(jwtToken)
  const decodedText = JSON.stringify(decoded, null, 2)
  return { rawText, jwtToken, decoded, decodedText }
}

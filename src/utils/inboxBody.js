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

const HEADER_JWT_KEYS = ['webhook-jwt', 'x-webhook-jwt', 'authorization']

export function extractJwtFromHeaders(headers) {
  if (!headers || typeof headers !== 'object') return null

  const lower = {}
  for (const [k, v] of Object.entries(headers)) {
    lower[String(k).toLowerCase()] = v
  }

  for (const key of HEADER_JWT_KEYS) {
    let val = lower[key]
    if (val == null || val === '') continue
    val = String(val)
    if (key === 'authorization') {
      if (/^bearer\s+/i.test(val)) val = val.replace(/^bearer\s+/i, '')
      else continue
    }
    if (looksLikeJwt(val)) return val.trim()
  }

  return null
}

export function extractInvoiceFromDecoded(decoded) {
  if (!decoded || typeof decoded !== 'object') return null
  const keys = ['invoiceNo', 'invoiceNumber', 'invoice', 'invoiceID', 'invoiceId']
  for (const k of keys) {
    const v = decoded[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

/** Full inbox analysis: body + headers JWT, invoice extraction. */
export function analyzeInboxRequest(request) {
  const bodyAnalysis = analyzeInboxBody(request?.body)
  const headerJwt = extractJwtFromHeaders(request?.headers)

  let headerDecoded = null
  let headerDecodedText = null
  if (headerJwt) {
    headerDecoded = decodeJwtPayload(headerJwt)
    headerDecodedText = JSON.stringify(headerDecoded, null, 2)
  }

  const invoiceNo =
    extractInvoiceFromDecoded(bodyAnalysis.decoded) ||
    extractInvoiceFromDecoded(headerDecoded)

  const hasJwt = !!(bodyAnalysis.jwtToken || headerJwt)

  return {
    ...bodyAnalysis,
    headerJwt,
    headerDecoded,
    headerDecodedText,
    invoiceNo,
    hasJwt,
  }
}

export function matchesInboxPathFilter(path, filter) {
  if (!filter || filter === 'all') return true
  const p = String(path || '').toLowerCase()
  if (filter === 'callback') return p.includes('callback')
  if (filter === 'pos') return p.includes('pos-standalone')
  if (filter === 'hook') return p.includes('/hook')
  return true
}

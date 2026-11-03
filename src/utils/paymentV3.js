/**
 * 2C2P Dynamic QR (Payment V3 / 2C2PDynQR), action GenerateQR.
 *
 * 1. Build the inner PaymentRequest XML (version 9.9 + transaction fields).
 * 2. payload = Base64(inner XML).
 * 3. signature = uppercase hex HMAC-SHA256(secretKey, payload).
 * 4. Wrap <PaymentRequest><version/><payload/><signature/></PaymentRequest>.
 * 5. POST application/x-www-form-urlencoded field paymentRequest to Payment.aspx.
 */

const INNER_FIELDS = [
  'version',
  'timeStamp',
  'merchantID',
  'uniqueTransactionCode',
  'desc',
  'amt',
  'currencyCode',
  'paymentChannel',
  'paymentExpiry',
  'qrOption',
  'qrType',
  'panCountry',
  'cardholderName',
  'cardholderEmail',
  'mobileNo',
  'userDefined1',
  'userDefined2',
  'userDefined3',
  'userDefined4',
  'userDefined5',
  'returnUrl',
  'backendUrl',
]

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(String(value))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToUtf8(value) {
  const clean = String(value || '').replace(/\s/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** Uppercase hex HMAC-SHA256 of `message` using the merchant secret key. */
export async function hmacSha256Upper(message, secretKey) {
  const secret = String(secretKey || '')
  if (!secret) throw new Error('SECRET_REQUIRED')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function buildPaymentV3InnerXml(fields) {
  const parts = ['<PaymentRequest>']
  for (const key of INNER_FIELDS) {
    const value = fields?.[key]
    if (value == null || String(value).trim() === '') continue
    parts.push(`<${key}>${escapeXml(String(value).trim())}</${key}>`)
  }
  parts.push('</PaymentRequest>')
  return parts.join('')
}

export function buildPaymentV3OuterXml({ version, payload, signature }) {
  return (
    `<PaymentRequest>` +
    `<version>${escapeXml(version || '9.9')}</version>` +
    `<payload>${payload}</payload>` +
    `<signature>${signature}</signature>` +
    `</PaymentRequest>`
  )
}

/**
 * Form body posted to Payment.aspx.
 * The gateway reads paymentRequest as Base64 of the signed XML.
 * Posting the XML itself returns HTTP 200 with an empty body.
 */
export function buildPaymentV3FormBody(outerXml, encoding = 'base64') {
  const paymentRequest = encoding === 'base64' ? utf8ToBase64(outerXml) : outerXml
  return new URLSearchParams({ paymentRequest }).toString()
}

export async function signPaymentV3Request(fields, secretKey, encoding = 'base64') {
  const innerXml = buildPaymentV3InnerXml(fields)
  const payload = utf8ToBase64(innerXml)
  const signature = await hmacSha256Upper(payload, secretKey)
  const outerXml = buildPaymentV3OuterXml({
    version: fields.version || '9.9',
    payload,
    signature,
  })
  return {
    innerXml,
    payload,
    signature,
    outerXml,
    formBody: buildPaymentV3FormBody(outerXml, encoding),
  }
}

function extractTag(xml, tag) {
  if (!xml) return ''
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? match[1].trim() : ''
}

function looksLikeBase64(value) {
  const compact = String(value || '').replace(/\s/g, '')
  return compact.length >= 16 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(compact)
}

/** Turn a gateway body (XML, base64 XML, or paymentResponse form field) into XML text. */
export function unwrapPaymentV3Xml(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  if (text.startsWith('<')) return text

  const form = text.match(/(?:^|&)(?:paymentResponse|paymentRequest)=([^&]+)/i)
  if (form) {
    try {
      return unwrapPaymentV3Xml(decodeURIComponent(form[1].replace(/\+/g, ' ')))
    } catch {
      /* keep going */
    }
  }

  if (looksLikeBase64(text)) {
    try {
      const decoded = base64ToUtf8(text).trim()
      if (decoded.startsWith('<') || /paymentResponse=/i.test(decoded)) return unwrapPaymentV3Xml(decoded)
    } catch {
      /* not an encoded XML body */
    }
  }

  const embedded = text.match(/<PaymentResponse[\s\S]*<\/PaymentResponse>/i)
  return embedded ? embedded[0] : text
}

export function parsePaymentV3Response(raw) {
  const text = raw == null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw)
  const outerXml = unwrapPaymentV3Xml(text)
  const payload = extractTag(outerXml, 'payload')
  const signature = extractTag(outerXml, 'signature')

  let decodedXml = ''
  let decodeError = ''
  if (payload) {
    try {
      decodedXml = base64ToUtf8(payload)
    } catch (err) {
      decodeError = err.message || 'Invalid payload'
    }
  } else if (/<(respCode|qrData|failReason)\b/i.test(outerXml)) {
    decodedXml = outerXml
  }

  const source = decodedXml || ''
  let failReason = extractTag(source, 'failReason')
  const plain = text.trim()
  if (!failReason && !decodedXml && plain && !plain.startsWith('<') && plain.length < 2000) {
    failReason = plain
  }
  return {
    raw: text,
    outerXml,
    payload,
    signature,
    decodedXml,
    decodeError,
    respCode: extractTag(source, 'respCode'),
    failReason,
    qrData: extractTag(source, 'qrData'),
    qrOption: extractTag(source, 'qrOption'),
    merchantID: extractTag(source, 'merchantID'),
    uniqueTransactionCode: extractTag(source, 'uniqueTransactionCode'),
    amt: extractTag(source, 'amt'),
    tranRef: extractTag(source, 'tranRef'),
  }
}

/** qrOption 1 = raw payload, 2 = PNG base64, 3 = image URL. */
export function classifyQrData(qrData, qrOption) {
  const value = String(qrData || '').trim()
  if (!value) return null
  if (value.startsWith('data:image/')) return { type: 'image', src: value }
  if (qrOption === '2' || value.startsWith('iVBOR')) {
    return { type: 'image', src: `data:image/png;base64,${value}` }
  }
  if (qrOption === '3' || /^https?:\/\//i.test(value)) return { type: 'image', src: value }
  return { type: 'qr', value }
}

// Browser-side JWT (HS256) signing & decoding using the Web Crypto API.
// The secret is used as raw UTF-8 bytes for the HMAC key, matching PyJWT's
// behaviour: jwt.encode(payload, secret, algorithm="HS256").

function base64UrlFromBytes(bytes) {
  const arr = new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlFromString(str) {
  return base64UrlFromBytes(new TextEncoder().encode(str))
}

export async function signJwtHS256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()
  const signingInput =
    base64UrlFromString(JSON.stringify(header)) + '.' + base64UrlFromString(JSON.stringify(payload))

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  return signingInput + '.' + base64UrlFromBytes(signature)
}

export function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1]
    if (!part) return { error: 'Invalid token' }
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json)
  } catch (e) {
    return { error: String(e) }
  }
}

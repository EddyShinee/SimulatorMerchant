/**
 * FinViet SmartPOS signature (Spec §2.1 Request signature):
 * 1. Sort object keys alphabetically at the TOP LEVEL only (nested objects keep insertion order —
 *    PDF example: request_data keeps description before amount, which is NOT alphabetical)
 * 2. JSON.stringify → pre-sign string (exclude signature field)
 * 3. HMAC-SHA256(secret, pre-sign) → hex
 */

/** Sort keys at one level only; nested plain objects keep their existing key order. */
export function sortObjectKeysTopLevel(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const sorted = {}
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key]
  }
  return sorted
}

/** @deprecated Use sortObjectKeysTopLevel — kept as alias for older imports. */
export function sortObjectKeysDeep(value) {
  return sortObjectKeysTopLevel(value)
}

/** Build pre-sign string from payload (signature field excluded). */
export function finvietPreSignString(payload) {
  const data = payload && typeof payload === 'object' ? { ...payload } : {}
  delete data.signature
  return JSON.stringify(sortObjectKeysTopLevel(data))
}

/** Browser / Web Crypto HMAC-SHA256 hex signature. */
export async function finvietSignAsync(payload, secretKey) {
  const secret = String(secretKey || '')
  if (!secret) throw new Error('FinViet secret key is required.')
  const canonical = finvietPreSignString(payload)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(canonical))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Attach signature to a copy of the payload. */
export async function finvietBodyWithSignature(payload, secretKey) {
  const body = sortObjectKeysTopLevel({ ...payload })
  delete body.signature
  const signature = await finvietSignAsync(body, secretKey)
  return { ...body, signature }
}

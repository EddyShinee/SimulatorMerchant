/**
 * FinViet SmartPOS signature (Spec §3.1):
 * 1. Sort object keys alphabetically (recursive)
 * 2. JSON.stringify → pre-sign string (exclude signature field)
 * 3. HMAC-SHA256(secret, pre-sign) → hex
 */

export function sortObjectKeysDeep(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const sorted = {}
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortObjectKeysDeep(value[key])
  }
  return sorted
}

/** Build pre-sign string from payload (signature field excluded). */
export function finvietPreSignString(payload) {
  const data = payload && typeof payload === 'object' ? { ...payload } : {}
  delete data.signature
  return JSON.stringify(sortObjectKeysDeep(data))
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
  const body = sortObjectKeysDeep({ ...payload })
  delete body.signature
  const signature = await finvietSignAsync(body, secretKey)
  return { ...body, signature }
}

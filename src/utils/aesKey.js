import { DEFAULT_AES_KEY } from '../config/posStandaloneConfig.js'

/** Normalize AES key to Base64 (Spec §5.1.1). Accepts Base64 (16 bytes) or 32-char hex. */
export function normalizeAesKeyBase64(value) {
  const s = String(value ?? '').trim()
  if (!s) return DEFAULT_AES_KEY

  if (/^[0-9a-fA-F]{32}$/.test(s)) {
    const bytes = s.match(/.{1,2}/g).map((hex) => Number.parseInt(hex, 16))
    if (typeof btoa === 'function') {
      return btoa(String.fromCharCode(...bytes))
    }
    return Buffer.from(bytes).toString('base64')
  }

  return s
}

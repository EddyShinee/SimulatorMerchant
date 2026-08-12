import crypto from 'crypto'

/** Parse 128-bit AES key: 32-char hex or Base64 (16 bytes). */
export function parseAes128Key(input) {
  const s = String(input || '').trim()
  if (!s) throw new Error('AES key is required.')

  if (/^[0-9a-fA-F]{32}$/.test(s)) {
    return Buffer.from(s, 'hex')
  }

  const fromB64 = Buffer.from(s, 'base64')
  if (fromB64.length === 16) return fromB64

  throw new Error('AES key must be 128-bit: 32 hex characters or Base64 encoding 16 bytes.')
}

/**
 * Spec §5.1.1:
 * 1. AES/GCM/NoPadding, 128-bit key
 * 2. Random 12-byte IV per encryption
 * 3. Ciphertext + GCM auth tag
 * 4. Base64(IV || ciphertext || tag) → cardPan field
 */
export function encryptCardPan(plainPan, keyInput) {
  const pan = String(plainPan || '').replace(/\s/g, '')
  if (!/^\d{12,19}$/.test(pan)) {
    throw new Error('Plain PAN must be 12–19 digits.')
  }

  const key = parseAes128Key(keyInput)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(pan, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, tag]).toString('base64')
}

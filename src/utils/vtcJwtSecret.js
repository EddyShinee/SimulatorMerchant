/** VTC extraData.jwtSecret — Base64 of 16-byte AES key (not hex string). */
export function toVtcJwtSecret(aesKeyInput) {
  const s = String(aesKeyInput || '').trim()
  if (!s) return ''

  if (/^[0-9a-fA-F]{32}$/.test(s)) {
    const bytes = s.match(/.{1,2}/g).map((hex) => Number.parseInt(hex, 16))
    return btoa(String.fromCharCode(...bytes))
  }

  try {
    const bin = atob(s)
    if (bin.length === 16) return s
  } catch {
    /* not base64 */
  }

  return s
}

/** Platform authenticator name for UI (Face ID, Touch ID, Windows Hello, …). */

export const BIOMETRIC_KINDS = {
  faceId: 'faceId',
  touchId: 'touchId',
  windowsHello: 'windowsHello',
  fingerprint: 'fingerprint',
  passkey: 'passkey',
}

const LABELS = {
  vi: {
    faceId: 'Face ID',
    touchId: 'Touch ID',
    windowsHello: 'Windows Hello',
    fingerprint: 'Vân tay',
    passkey: 'Passkey',
  },
  en: {
    faceId: 'Face ID',
    touchId: 'Touch ID',
    windowsHello: 'Windows Hello',
    fingerprint: 'Fingerprint',
    passkey: 'Passkey',
  },
}

export function detectBiometricKind(uaSource = typeof navigator !== 'undefined' ? navigator : null) {
  if (!uaSource) return BIOMETRIC_KINDS.passkey

  const ua = String(uaSource.userAgent || '')
  const platform = String(uaSource.platform || '')
  const maxTouch = Number(uaSource.maxTouchPoints) || 0

  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouch > 1)
  const isIPhone = /iPhone/i.test(ua)
  const isMac = /Mac OS X|Macintosh/i.test(ua) && !isIPad && !isIPhone
  const isWindows = /Win/i.test(platform) || /Windows/i.test(ua)
  const isAndroid = /Android/i.test(ua)

  if (isIPhone) {
    // Older Touch ID iPhones still appear in some UAs (SE / 8 / 7 / 6).
    if (/iPhone\s?(SE|[6-8])/i.test(ua)) return BIOMETRIC_KINDS.touchId
    return BIOMETRIC_KINDS.faceId
  }
  if (isIPad) return BIOMETRIC_KINDS.faceId
  if (isMac) return BIOMETRIC_KINDS.touchId
  if (isWindows) return BIOMETRIC_KINDS.windowsHello
  if (isAndroid) return BIOMETRIC_KINDS.fingerprint
  return BIOMETRIC_KINDS.passkey
}

export function biometricLabel(lang = 'en', kind = detectBiometricKind()) {
  const dict = LABELS[lang] || LABELS.en
  return dict[kind] || dict.passkey
}

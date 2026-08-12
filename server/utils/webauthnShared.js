import '../polyfills.js'
import jwt from 'jsonwebtoken'

/**
 * Shared WebAuthn RP config + challenge JWT (serverless-safe for Vercel).
 */

export function signWebAuthnChallenge(uid, challenge, type) {
  return jwt.sign(
    {
      sub: String(uid),
      chal: String(challenge),
      purpose: `webauthn-${type}`,
    },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  )
}

export function readWebAuthnChallenge(uid, challengeToken, type) {
  if (!challengeToken || typeof challengeToken !== 'string') {
    const err = new Error('Missing biometric challenge token. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  let payload
  try {
    payload = jwt.verify(challengeToken, process.env.JWT_SECRET)
  } catch {
    const err = new Error('Biometric challenge expired or invalid. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  if (payload.sub !== String(uid) || payload.purpose !== `webauthn-${type}` || !payload.chal) {
    const err = new Error('Biometric challenge mismatch. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  return String(payload.chal)
}

/** Challenge JWT that is not bound to a user id yet (login options before known user). */
export function signAnonWebAuthnChallenge(challenge, type, extra = {}) {
  return jwt.sign(
    {
      chal: String(challenge),
      purpose: `webauthn-${type}`,
      ...extra,
    },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  )
}

export function readAnonWebAuthnChallenge(challengeToken, type) {
  if (!challengeToken || typeof challengeToken !== 'string') {
    const err = new Error('Missing biometric challenge token. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  let payload
  try {
    payload = jwt.verify(challengeToken, process.env.JWT_SECRET)
  } catch {
    const err = new Error('Biometric challenge expired or invalid. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  if (payload.purpose !== `webauthn-${type}` || !payload.chal) {
    const err = new Error('Biometric challenge mismatch. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  return payload
}

/** True when rpID equals hostname or is a valid suffix (WebAuthn RP ID rules). */
export function isRpIdValidForHost(rpID, hostname) {
  const r = String(rpID || '').toLowerCase().replace(/\.$/, '')
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '')
  if (!r || !h) return false
  return h === r || h.endsWith(`.${r}`)
}

/**
 * RP ID for this page origin.
 * - www.eddy.io.vn → eddy.io.vn (share Touch ID with apex)
 * - simulator-merchant.vercel.app stays full host (vercel.app is a public suffix)
 */
export function rpIdFromHostname(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
  if (!host || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host || 'localhost'
  if (host.startsWith('www.') && host.split('.').length > 2) return host.slice(4)
  return host
}

export function getWebAuthnRpConfig(req) {
  const originHeader = String(req.headers.origin || '').trim()
  let hostname = 'localhost'
  try {
    if (originHeader) hostname = new URL(originHeader).hostname
  } catch {
    /* keep default */
  }

  const configuredRpId = String(process.env.WEBAUTHN_RP_ID || '').trim()
  const rpID =
    configuredRpId && isRpIdValidForHost(configuredRpId, hostname)
      ? configuredRpId
      : rpIdFromHostname(hostname)
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Simulator Merchant'

  const configured = (process.env.WEBAUTHN_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const expectedOrigin = Array.from(
    new Set(
      [
        originHeader,
        ...configured,
        'https://www.eddy.io.vn',
        'https://eddy.io.vn',
        'https://simulator-merchant.vercel.app',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:4173',
        'http://127.0.0.1:4173',
      ].filter(Boolean)
    )
  )

  return {
    rpID,
    rpName,
    expectedOrigin: expectedOrigin.length === 1 ? expectedOrigin[0] : expectedOrigin,
  }
}

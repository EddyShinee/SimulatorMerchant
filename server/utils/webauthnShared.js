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

export function getWebAuthnRpConfig(req) {
  const originHeader = String(req.headers.origin || '').trim()
  let hostname = 'localhost'
  try {
    if (originHeader) hostname = new URL(originHeader).hostname
  } catch {
    /* keep default */
  }

  const rpID = process.env.WEBAUTHN_RP_ID || hostname
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

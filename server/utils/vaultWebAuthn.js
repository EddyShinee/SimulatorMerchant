import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import crypto from 'crypto'
import {
  listWebAuthnCredentials,
  saveWebAuthnCredential,
  updateWebAuthnCounter,
  deleteWebAuthnCredentials,
} from './merchantStore.js'

/** Short-lived challenges (works for single-process Express / local + most deploys). */
const pendingChallenges = new Map()

function pruneChallenges() {
  const now = Date.now()
  for (const [id, row] of pendingChallenges) {
    if (row.exp < now) pendingChallenges.delete(id)
  }
}

function saveChallenge(uid, challenge, type) {
  pruneChallenges()
  const id = crypto.randomUUID()
  pendingChallenges.set(id, {
    uid: String(uid),
    challenge: String(challenge),
    type,
    exp: Date.now() + 5 * 60 * 1000,
  })
  return id
}

function takeChallenge(uid, challengeId, type) {
  pruneChallenges()
  const id = String(challengeId || '')
  const row = pendingChallenges.get(id)
  pendingChallenges.delete(id)
  if (!row || row.uid !== String(uid) || row.type !== type || row.exp < Date.now()) {
    const err = new Error('Biometric challenge expired or invalid. Please try again.')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  return row.challenge
}

function getRpConfig(req) {
  const originHeader = String(req.headers.origin || '').trim()
  let hostname = 'localhost'
  try {
    if (originHeader) hostname = new URL(originHeader).hostname
  } catch {
    /* keep localhost */
  }

  const rpID = process.env.WEBAUTHN_RP_ID || hostname
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Simulator Merchant'

  const configured = (process.env.WEBAUTHN_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Always trust the browser Origin when present (required for WebAuthn),
  // and also allow explicitly configured origins + localhost variants.
  const expectedOrigin = Array.from(
    new Set(
      [
        originHeader,
        ...configured,
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

export async function buildRegistrationOptions(req, uid, email) {
  const { rpID, rpName } = getRpConfig(req)
  const existing = await listWebAuthnCredentials(uid)
  const userIdBytes = new TextEncoder().encode(String(uid))
  // WebAuthn user.id max 64 bytes
  const userID = userIdBytes.length <= 64 ? userIdBytes : userIdBytes.slice(0, 64)

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID,
    userName: email || String(uid),
    userDisplayName: email || String(uid),
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports?.length ? c.transports : undefined,
    })),
  })

  const challengeId = saveChallenge(uid, options.challenge, 'reg')
  return { options, challengeId }
}

export async function verifyAndSaveRegistration(req, uid, { response, challengeId }) {
  if (!response || !challengeId) {
    const err = new Error('Missing WebAuthn response or challengeId.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const { rpID, expectedOrigin } = getRpConfig(req)
  const expectedChallenge = takeChallenge(uid, challengeId, 'reg')

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
  } catch (err) {
    const wrapped = new Error(err?.message || 'WebAuthn registration verification failed')
    wrapped.code = 'WEBAUTHN_FAILED'
    throw wrapped
  }

  if (!verification.verified || !verification.registrationInfo) {
    const err = new Error('WebAuthn registration failed')
    err.code = 'WEBAUTHN_FAILED'
    throw err
  }

  const info = verification.registrationInfo
  const idStr = info.credentialID
  const pkStr = isoBase64URL.fromBuffer(info.credentialPublicKey)
  const transports = response?.response?.transports || []
  await saveWebAuthnCredential(uid, {
    credentialId: idStr,
    publicKey: pkStr,
    counter: info.counter ?? 0,
    transports,
    deviceName: info.credentialDeviceType || 'Touch ID',
  })
  return true
}

export async function buildAuthenticationOptions(req, uid) {
  const { rpID } = getRpConfig(req)
  const existing = await listWebAuthnCredentials(uid)
  if (!existing.length) {
    const err = new Error('No biometric credential registered')
    err.code = 'NO_BIOMETRIC'
    throw err
  }
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports?.length ? c.transports : undefined,
    })),
  })
  const challengeId = saveChallenge(uid, options.challenge, 'auth')
  return { options, challengeId }
}

export async function verifyAuthentication(req, uid, { response, challengeId }) {
  if (!response || !challengeId) {
    const err = new Error('Missing WebAuthn response or challengeId.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const { rpID, expectedOrigin } = getRpConfig(req)
  const expectedChallenge = takeChallenge(uid, challengeId, 'auth')
  const existing = await listWebAuthnCredentials(uid)
  const credId = response?.id || response?.rawId
  const matched = existing.find((c) => c.credentialId === credId)
  if (!matched) {
    const err = new Error('Unknown biometric credential')
    err.code = 'UNKNOWN_CREDENTIAL'
    throw err
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(matched.credentialId),
        credentialPublicKey: isoBase64URL.toBuffer(matched.publicKey),
        counter: matched.counter,
        transports: matched.transports,
      },
    })
  } catch (err) {
    const wrapped = new Error(err?.message || 'Biometric verification failed')
    wrapped.code = 'WEBAUTHN_FAILED'
    throw wrapped
  }

  if (!verification.verified) {
    const err = new Error('Biometric verification failed')
    err.code = 'WEBAUTHN_FAILED'
    throw err
  }

  const newCounter = verification.authenticationInfo?.newCounter
  if (typeof newCounter === 'number') {
    await updateWebAuthnCounter(uid, matched.credentialId, newCounter)
  }
  return true
}

export { deleteWebAuthnCredentials }

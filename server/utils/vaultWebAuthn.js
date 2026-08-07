import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import jwt from 'jsonwebtoken'
import {
  listWebAuthnCredentials,
  saveWebAuthnCredential,
  updateWebAuthnCounter,
  deleteWebAuthnCredentials,
} from './merchantStore.js'

function getRpConfig(req) {
  const rpID = process.env.WEBAUTHN_RP_ID || 'localhost'
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Simulator Merchant'
  const configured = (process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const originHeader = req.headers.origin
  const expectedOrigin =
    originHeader && (configured.includes(originHeader) || configured.length === 0)
      ? originHeader
      : configured.length === 1
        ? configured[0]
        : configured
  return { rpID, rpName, expectedOrigin: expectedOrigin || originHeader || 'http://localhost:5173' }
}

function signChallenge(uid, challenge, type) {
  return jwt.sign({ sub: uid, challenge, type, webauthn: true }, process.env.JWT_SECRET, {
    expiresIn: '5m',
  })
}

function readChallenge(uid, challengeToken, type) {
  const payload = jwt.verify(challengeToken, process.env.JWT_SECRET)
  if (!payload.webauthn || payload.sub !== uid || payload.type !== type || !payload.challenge) {
    const err = new Error('Invalid WebAuthn challenge')
    err.code = 'INVALID_CHALLENGE'
    throw err
  }
  return payload.challenge
}

export async function buildRegistrationOptions(req, uid, email) {
  const { rpID, rpName } = getRpConfig(req)
  const existing = await listWebAuthnCredentials(uid)
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(uid),
    userName: email || uid,
    userDisplayName: email || uid,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports?.length ? c.transports : undefined,
    })),
  })
  const challengeToken = signChallenge(uid, options.challenge, 'reg')
  return { options, challengeToken }
}

export async function verifyAndSaveRegistration(req, uid, { response, challengeToken }) {
  const { rpID, expectedOrigin } = getRpConfig(req)
  const expectedChallenge = readChallenge(uid, challengeToken, 'reg')
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
  })
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
    userVerification: 'required',
    allowCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports?.length ? c.transports : undefined,
    })),
  })
  const challengeToken = signChallenge(uid, options.challenge, 'auth')
  return { options, challengeToken }
}

export async function verifyAuthentication(req, uid, { response, challengeToken }) {
  const { rpID, expectedOrigin } = getRpConfig(req)
  const expectedChallenge = readChallenge(uid, challengeToken, 'auth')
  const existing = await listWebAuthnCredentials(uid)
  const credId = response?.id || response?.rawId
  const matched = existing.find((c) => c.credentialId === credId)
  if (!matched) {
    const err = new Error('Unknown biometric credential')
    err.code = 'UNKNOWN_CREDENTIAL'
    throw err
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
    authenticator: {
      credentialID: isoBase64URL.toBuffer(matched.credentialId),
      credentialPublicKey: isoBase64URL.toBuffer(matched.publicKey),
      counter: matched.counter,
      transports: matched.transports,
    },
  })

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

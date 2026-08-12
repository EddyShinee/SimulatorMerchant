import '../polyfills.js'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import {
  getWebAuthnRpConfig,
  signWebAuthnChallenge,
  readWebAuthnChallenge,
  signAnonWebAuthnChallenge,
  readAnonWebAuthnChallenge,
} from './webauthnShared.js'
import {
  isMerchantStoreConfigured,
  listAuthPasskeysByEmail,
  listAuthPasskeysByUserId,
  findAuthPasskeyByCredentialId,
  saveAuthPasskey,
  updateAuthPasskeyCounter,
  deleteAuthPasskeys,
  deleteOtherAuthPasskeys,
  getSupabaseAdmin,
} from './merchantStore.js'
import { getSupabase, isSupabaseConfigured } from './supabaseClient.js'
import { createUser, findUserByEmail, initUsersDb } from './usersDb.js'

function randomPassword() {
  return `${crypto.randomBytes(24).toString('base64url')}Aa1!`
}

async function ensureAuthUser(email) {
  const normalized = String(email).trim().toLowerCase()

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (!listErr) {
        const existing = (listed?.users || []).find(
          (u) => String(u.email || '').toLowerCase() === normalized
        )
        if (existing) {
          const err = new Error('An account with this email already exists.')
          err.code = 'EMAIL_TAKEN'
          throw err
        }
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: normalized,
        password: randomPassword(),
        email_confirm: true,
      })
      if (error) {
        const taken = /already|registered|exists/i.test(error.message || '')
        const err = new Error(taken ? 'An account with this email already exists.' : error.message)
        err.code = taken ? 'EMAIL_TAKEN' : 'REGISTER_FAILED'
        throw err
      }
      return { id: data.user.id, email: data.user.email || normalized }
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.auth.signUp({
      email: normalized,
      password: randomPassword(),
    })
    if (error) {
      const taken = /already|registered|exists/i.test(error.message || '')
      const err = new Error(taken ? 'An account with this email already exists.' : error.message)
      err.code = taken ? 'EMAIL_TAKEN' : 'REGISTER_FAILED'
      throw err
    }
    if (!data.user) {
      const err = new Error('Registration did not return a user.')
      err.code = 'REGISTER_FAILED'
      throw err
    }
    return { id: data.user.id, email: data.user.email || normalized }
  }

  await initUsersDb()
  if (await findUserByEmail(normalized)) {
    const err = new Error('An account with this email already exists.')
    err.code = 'EMAIL_TAKEN'
    throw err
  }
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
  const passwordHash = await bcrypt.hash(randomPassword(), saltRounds)
  const user = await createUser({
    id: crypto.randomUUID(),
    email: normalized,
    passwordHash,
    createdAt: new Date().toISOString(),
  })
  return { id: user.id, email: user.email }
}

async function findAuthUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase()

  // Prefer passkey table (works even if Auth admin list is paginated).
  const passkeys = await listAuthPasskeysByEmail(normalized)
  if (passkeys.length) {
    return { id: passkeys[0].userId, email: passkeys[0].email || normalized }
  }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      // listUsers is paginated; also try getUserByEmail if available in SDK
      if (typeof admin.auth.admin.getUserByEmail === 'function') {
        const { data, error } = await admin.auth.admin.getUserByEmail(normalized)
        if (!error && data?.user) {
          return { id: data.user.id, email: data.user.email || normalized }
        }
      }
      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existing = (listed?.users || []).find(
        (u) => String(u.email || '').toLowerCase() === normalized
      )
      if (existing) return { id: existing.id, email: existing.email || normalized }
    }
    return null
  }

  await initUsersDb()
  const user = await findUserByEmail(normalized)
  return user ? { id: user.id, email: user.email } : null
}

export function assertPasskeyStoreReady() {
  if (!isMerchantStoreConfigured()) {
    const err = new Error(
      'Passkey storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL.'
    )
    err.code = 'STORE_UNAVAILABLE'
    throw err
  }
}

/** Step 1 — create user + return WebAuthn registration options */
export async function buildAuthRegisterOptions(req, email) {
  assertPasskeyStoreReady()
  const user = await ensureAuthUser(email)
  const { rpID, rpName } = getWebAuthnRpConfig(req)
  const existing = await listAuthPasskeysByUserId(user.id)
  const userIdBytes = new TextEncoder().encode(String(user.id))
  const userID = userIdBytes.length <= 64 ? userIdBytes : userIdBytes.slice(0, 64)

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID,
    userName: user.email,
    userDisplayName: user.email,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'required',
      requireResidentKey: true,
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports?.length ? c.transports : undefined,
    })),
  })

  const challengeToken = signWebAuthnChallenge(user.id, options.challenge, 'auth-reg')
  return {
    options,
    challengeToken,
    challengeId: challengeToken,
    user: { id: user.id, email: user.email },
  }
}

/** Step 2 — verify attestation, save passkey */
export async function finishAuthRegister(req, { response, challengeToken, challengeId, userId, email }) {
  assertPasskeyStoreReady()
  const uid = String(userId || '')
  const token = challengeToken || challengeId
  if (!response || !token || !uid || !email) {
    const err = new Error('Missing WebAuthn registration data.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const { rpID, expectedOrigin } = getWebAuthnRpConfig(req)
  const expectedChallenge = readWebAuthnChallenge(uid, token, 'auth-reg')

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
    const wrapped = new Error(err?.message || 'Touch ID registration failed')
    wrapped.code = 'WEBAUTHN_FAILED'
    throw wrapped
  }

  if (!verification.verified || !verification.registrationInfo) {
    const err = new Error('Touch ID registration failed')
    err.code = 'WEBAUTHN_FAILED'
    throw err
  }

  const info = verification.registrationInfo
  await saveAuthPasskey({
    userId: uid,
    email: String(email).trim().toLowerCase(),
    credentialId: info.credentialID,
    publicKey: isoBase64URL.fromBuffer(info.credentialPublicKey),
    counter: info.counter ?? 0,
    transports: response?.response?.transports || [],
  })

  return { id: uid, email: String(email).trim().toLowerCase() }
}

/** Login options — by email (preferred) or discoverable credential */
export async function buildAuthLoginOptions(req, email) {
  assertPasskeyStoreReady()
  const { rpID } = getWebAuthnRpConfig(req)
  const normalized = String(email || '').trim().toLowerCase()

  if (normalized) {
    const passkeys = await listAuthPasskeysByEmail(normalized)
    if (!passkeys.length) {
      const err = new Error('No Touch ID registered for this email. Sign in with password or register Touch ID first.')
      err.code = 'NO_PASSKEY'
      throw err
    }
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: passkeys.map((c) => ({
        id: c.credentialId,
        transports: c.transports?.length ? c.transports : undefined,
      })),
    })
    const challengeToken = signAnonWebAuthnChallenge(options.challenge, 'auth-login', {
      email: normalized,
      userId: passkeys[0].userId,
    })
    return { options, challengeToken, challengeId: challengeToken }
  }

  // Usernameless / discoverable
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
  })
  const challengeToken = signAnonWebAuthnChallenge(options.challenge, 'auth-login', {})
  return { options, challengeToken, challengeId: challengeToken }
}

export async function finishAuthLogin(req, { response, challengeToken, challengeId }) {
  assertPasskeyStoreReady()
  const token = challengeToken || challengeId
  if (!response || !token) {
    const err = new Error('Missing WebAuthn login data.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const payload = readAnonWebAuthnChallenge(token, 'auth-login')
  const expectedChallenge = String(payload.chal)
  const { rpID, expectedOrigin } = getWebAuthnRpConfig(req)

  const credId = response?.id || response?.rawId
  const matched = await findAuthPasskeyByCredentialId(credId)
  if (!matched) {
    const err = new Error('Unknown Touch ID credential. Register Touch ID first.')
    err.code = 'UNKNOWN_CREDENTIAL'
    throw err
  }

  if (
    payload.email &&
    matched.email &&
    String(payload.email).toLowerCase() !== String(matched.email).toLowerCase()
  ) {
    const err = new Error('Touch ID does not match this email.')
    err.code = 'WEBAUTHN_FAILED'
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
    const wrapped = new Error(err?.message || 'Touch ID sign-in failed')
    wrapped.code = 'WEBAUTHN_FAILED'
    throw wrapped
  }

  if (!verification.verified) {
    const err = new Error('Touch ID sign-in failed')
    err.code = 'WEBAUTHN_FAILED'
    throw err
  }

  const newCounter = verification.authenticationInfo?.newCounter
  if (typeof newCounter === 'number') {
    await updateAuthPasskeyCounter(matched.credentialId, newCounter)
  }

  return { id: matched.userId, email: matched.email }
}

/** Logged-in user enables Touch ID on existing account */
export async function buildAuthEnrollOptions(req, userId, email, { replace = false } = {}) {
  assertPasskeyStoreReady()
  const uid = String(userId)
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) {
    const err = new Error('Email is required to enable Touch ID.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const { rpID, rpName } = getWebAuthnRpConfig(req)
  const existing = await listAuthPasskeysByUserId(uid)
  const userIdBytes = new TextEncoder().encode(uid)
  const userID = userIdBytes.length <= 64 ? userIdBytes : userIdBytes.slice(0, 64)

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID,
    userName: normalized,
    userDisplayName: normalized,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'required',
      requireResidentKey: true,
    },
    // replace=true → allow re-registering on the same device (update flow)
    excludeCredentials: replace
      ? []
      : existing.map((c) => ({
          id: c.credentialId,
          transports: c.transports?.length ? c.transports : undefined,
        })),
  })

  const challengeToken = signWebAuthnChallenge(uid, options.challenge, 'auth-enroll')
  return {
    options,
    challengeToken,
    challengeId: challengeToken,
    alreadyEnabled: existing.length > 0,
    replace: Boolean(replace),
  }
}

export async function finishAuthEnroll(
  req,
  { userId, email, response, challengeToken, challengeId, replace = false }
) {
  assertPasskeyStoreReady()
  const uid = String(userId || '')
  const token = challengeToken || challengeId
  const normalized = String(email || '').trim().toLowerCase()
  if (!response || !token || !uid || !normalized) {
    const err = new Error('Missing Touch ID enroll data.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const { rpID, expectedOrigin } = getWebAuthnRpConfig(req)
  const expectedChallenge = readWebAuthnChallenge(uid, token, 'auth-enroll')

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
    const wrapped = new Error(err?.message || 'Failed to enable Touch ID')
    wrapped.code = 'WEBAUTHN_FAILED'
    throw wrapped
  }

  if (!verification.verified || !verification.registrationInfo) {
    const err = new Error('Failed to enable Touch ID')
    err.code = 'WEBAUTHN_FAILED'
    throw err
  }

  const info = verification.registrationInfo
  const credentialId = info.credentialID

  await saveAuthPasskey({
    userId: uid,
    email: normalized,
    credentialId,
    publicKey: isoBase64URL.fromBuffer(info.credentialPublicKey),
    counter: info.counter ?? 0,
    transports: response?.response?.transports || [],
  })

  if (replace) {
    await deleteOtherAuthPasskeys(uid, credentialId)
  }

  return { id: uid, email: normalized }
}

export async function getAuthPasskeyStatus(userId) {
  assertPasskeyStoreReady()
  const list = await listAuthPasskeysByUserId(userId)
  return { enabled: list.length > 0, count: list.length }
}

/** Vault unlock — same passkey store as login. */
export async function buildVaultUnlockOptions(req, userId) {
  assertPasskeyStoreReady()
  const uid = String(userId)
  const { rpID } = getWebAuthnRpConfig(req)
  const existing = await listAuthPasskeysByUserId(uid)
  if (!existing.length) {
    const err = new Error(
      'No Touch ID registered. Unlock with password, then enable Touch ID (same as login).'
    )
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
  const challengeToken = signWebAuthnChallenge(uid, options.challenge, 'vault-auth')
  return { options, challengeToken, challengeId: challengeToken }
}

export async function finishVaultUnlock(req, userId, { response, challengeToken, challengeId }) {
  assertPasskeyStoreReady()
  const uid = String(userId)
  const token = challengeToken || challengeId
  if (!response || !token) {
    const err = new Error('Missing WebAuthn response or challenge token.')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const { rpID, expectedOrigin } = getWebAuthnRpConfig(req)
  const expectedChallenge = readWebAuthnChallenge(uid, token, 'vault-auth')
  const credId = response?.id || response?.rawId
  const matched = await findAuthPasskeyByCredentialId(credId)
  if (!matched || String(matched.userId) !== uid) {
    const err = new Error('Unknown Touch ID credential. Enable Touch ID first.')
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
    await updateAuthPasskeyCounter(matched.credentialId, newCounter)
  }
  return true
}

export async function deletePasskeys(userId) {
  assertPasskeyStoreReady()
  await deleteAuthPasskeys(userId)
}

export { findAuthUserByEmail }

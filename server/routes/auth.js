import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import {
  createUser,
  findUserByEmail,
  findUserById,
  initUsersDb,
  updateUserPasswordHash,
} from '../utils/usersDb.js'
import { getSupabase, isSupabaseConfigured } from '../utils/supabaseClient.js'
import { getSupabaseAdmin } from '../utils/merchantStore.js'
import {
  buildAuthRegisterOptions,
  finishAuthRegister,
  buildAuthLoginOptions,
  finishAuthLogin,
  buildAuthEnrollOptions,
  finishAuthEnroll,
  getAuthPasskeyStatus,
  deletePasskeys,
} from '../utils/authWebAuthn.js'
import { requireAuth } from '../middleware/auth.js'
import { assertFlagOn, ensureAppProfile, assertAccountActive, recordLastLogin, touchProfileUpdated } from '../utils/accessStore.js'

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  })
}

async function authUserPayload(user, { login = false } = {}) {
  const profile = await ensureAppProfile({ id: user.id, email: user.email })
  if (login) {
    await assertAccountActive(profile.id)
    await recordLastLogin(profile.id)
  }
  return { id: profile.id, email: profile.email, role: profile.role }
}

function webauthnError(res, err, fallback) {
  const code = err?.code || 'SERVER_ERROR'
  const status =
    code === 'EMAIL_TAKEN'
      ? 409
      : code === 'BAD_REQUEST' ||
          code === 'INVALID_CHALLENGE' ||
          code === 'WEBAUTHN_FAILED' ||
          code === 'NO_PASSKEY' ||
          code === 'UNKNOWN_CREDENTIAL' ||
          code === 'REGISTER_FAILED'
        ? 400
          : code === 'FEATURE_DISABLED'
          ? 403
          : code === 'ACCOUNT_BLOCKED'
            ? 403
          : code === 'STORE_UNAVAILABLE'
            ? 503
            : 500
  console.error('[auth:webauthn]', code, err?.message)
  return res.status(status).json({
    error: code,
    message: err?.message || fallback,
  })
}

// Warm local DB only when Supabase is not configured.
if (!isSupabaseConfigured()) {
  initUsersDb().catch((err) => {
    console.error('[users-db] init failed', err)
  })
} else {
  console.log('[auth] using Supabase Auth at', process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    await assertFlagOn('registration')
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL', message: 'A valid email is required.' })
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters.' })
    }

    const supabase = getSupabase()
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        const msg = error.message || 'Registration failed.'
        const taken = /already|registered|exists/i.test(msg)
        return res.status(taken ? 409 : 400).json({
          error: taken ? 'EMAIL_TAKEN' : 'REGISTER_FAILED',
          message: taken ? 'An account with this email already exists.' : msg,
        })
      }
      if (!data.user) {
        return res.status(400).json({
          error: 'REGISTER_FAILED',
          message: 'Registration did not return a user. Check Supabase Auth settings.',
        })
      }

      const user = { id: data.user.id, email: data.user.email || email }
      const token = signToken(user)
      return res.status(201).json({
        token,
        user: await authUserPayload(user, { login: true }),
        emailConfirmationRequired: !data.session,
      })
    }

    await initUsersDb()
    if (await findUserByEmail(email)) {
      return res
        .status(409)
        .json({ error: 'EMAIL_TAKEN', message: 'An account with this email already exists.' })
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    const passwordHash = await bcrypt.hash(password, saltRounds)
    const user = await createUser({
      id: crypto.randomUUID(),
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    })

    const token = signToken(user)
    return res.status(201).json({ token, user: await authUserPayload(user, { login: true }) })
  } catch (err) {
    if (err?.code === 'FEATURE_DISABLED') {
      return res.status(403).json({ error: 'FEATURE_DISABLED', message: err.message })
    }
    console.error('register error', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')

    const supabase = getSupabase()
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) {
        const msg = error?.message || 'Email or password is incorrect.'
        const unconfirmed = /confirm|not confirmed/i.test(msg)
        return res.status(401).json({
          error: unconfirmed ? 'EMAIL_NOT_CONFIRMED' : 'INVALID_CREDENTIALS',
          message: unconfirmed
            ? 'Email not confirmed. In Supabase Dashboard → Authentication → Providers → Email, turn OFF “Confirm email”.'
            : msg,
        })
      }

      const user = { id: data.user.id, email: data.user.email || email }
      const token = signToken(user)
      return res.json({ token, user: await authUserPayload(user, { login: true }) })
    }

    await initUsersDb()
    const user = await findUserByEmail(email)
    if (!user) {
      return res
        .status(401)
        .json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return res
        .status(401)
        .json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
    }

    const token = signToken(user)
    return res.json({ token, user: await authUserPayload(user, { login: true }) })
  } catch (err) {
    if (err?.code === 'ACCOUNT_BLOCKED') {
      return res.status(403).json({ error: 'ACCOUNT_BLOCKED', message: err.message })
    }
    console.error('login error', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' })
  }
})

// PATCH /api/auth/password — logged-in user changes their own password
router.patch('/password', requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')

    if (!currentPassword) {
      return res.status(400).json({
        error: 'CURRENT_PASSWORD_REQUIRED',
        message: 'Current password is required.',
      })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters.',
      })
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: 'PASSWORD_UNCHANGED',
        message: 'New password must be different from the current password.',
      })
    }

    const email = String(req.user.email || '').trim().toLowerCase()
    const userId = String(req.user.sub || '')

    const supabase = getSupabase()
    if (supabase) {
      const { data: sessionData, error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (verifyError || !sessionData?.user) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Current password is incorrect.',
        })
      }

      const admin = getSupabaseAdmin()
      if (admin) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
        if (error) {
          return res.status(400).json({
            error: 'UPDATE_FAILED',
            message: error.message || 'Failed to update password.',
          })
        }
      } else {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) {
          return res.status(400).json({
            error: 'UPDATE_FAILED',
            message: error.message || 'Failed to update password.',
          })
        }
      }

      await touchProfileUpdated(userId)
      return res.json({ ok: true })
    }

    await initUsersDb()
    const user = (await findUserById(userId)) || (await findUserByEmail(email))
    if (!user) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' })
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Current password is incorrect.',
      })
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    const passwordHash = await bcrypt.hash(newPassword, saltRounds)
    await updateUserPasswordHash(user.id, passwordHash)
    await touchProfileUpdated(user.id)
    return res.json({ ok: true })
  } catch (err) {
    console.error('change password error', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' })
  }
})

// --- Touch ID / Passkey auth ---

router.post('/webauthn/register/options', async (req, res) => {
  try {
    await assertFlagOn('registration')
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL', message: 'A valid email is required.' })
    }
    const result = await buildAuthRegisterOptions(req, email)
    return res.json(result)
  } catch (err) {
    return webauthnError(res, err, 'Failed to start Touch ID registration.')
  }
})

router.post('/webauthn/register', async (req, res) => {
  try {
    await assertFlagOn('registration')
    const user = await finishAuthRegister(req, {
      response: req.body?.response,
      challengeToken: req.body?.challengeToken,
      challengeId: req.body?.challengeId,
      userId: req.body?.userId,
      email: req.body?.email,
    })
    const token = signToken(user)
    return res.status(201).json({ token, user: await authUserPayload(user, { login: true }) })
  } catch (err) {
    return webauthnError(res, err, 'Failed to register with Touch ID.')
  }
})

router.post('/webauthn/login/options', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const result = await buildAuthLoginOptions(req, email)
    return res.json(result)
  } catch (err) {
    return webauthnError(res, err, 'Failed to start Touch ID sign-in.')
  }
})

router.post('/webauthn/login', async (req, res) => {
  try {
    const user = await finishAuthLogin(req, {
      response: req.body?.response,
      challengeToken: req.body?.challengeToken,
      challengeId: req.body?.challengeId,
    })
    const token = signToken(user)
    return res.json({ token, user: await authUserPayload(user, { login: true }) })
  } catch (err) {
    return webauthnError(res, err, 'Failed to sign in with Touch ID.')
  }
})

// Enable Touch ID on an existing logged-in account
router.get('/webauthn/status', requireAuth, async (req, res) => {
  try {
    const status = await getAuthPasskeyStatus(req.user.sub)
    return res.json(status)
  } catch (err) {
    return webauthnError(res, err, 'Failed to read Touch ID status.')
  }
})

router.post('/webauthn/enroll/options', requireAuth, async (req, res) => {
  try {
    const replace = Boolean(req.body?.replace)
    const result = await buildAuthEnrollOptions(req, req.user.sub, req.user.email, { replace })
    return res.json(result)
  } catch (err) {
    return webauthnError(res, err, 'Failed to start Touch ID enrollment.')
  }
})

router.post('/webauthn/enroll', requireAuth, async (req, res) => {
  try {
    const user = await finishAuthEnroll(req, {
      userId: req.user.sub,
      email: req.user.email,
      response: req.body?.response,
      challengeToken: req.body?.challengeToken,
      challengeId: req.body?.challengeId,
      replace: Boolean(req.body?.replace),
    })
    return res.json({ ok: true, user: await authUserPayload(user) })
  } catch (err) {
    return webauthnError(res, err, 'Failed to enable Touch ID.')
  }
})

router.delete('/webauthn', requireAuth, async (req, res) => {
  try {
    await deletePasskeys(req.user.sub)
    return res.json({ ok: true, enabled: false, count: 0 })
  } catch (err) {
    return webauthnError(res, err, 'Failed to remove Touch ID.')
  }
})

router.get('/me', async (req, res) => {
  try {
    const user = await authUserPayload({ id: req.user.sub, email: req.user.email })
    return res.json({ user })
  } catch (err) {
    console.error('[auth:me]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to load profile.' })
  }
})

export default router

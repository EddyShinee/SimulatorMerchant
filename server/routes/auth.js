import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { createUser, findUserByEmail, initUsersDb } from '../utils/usersDb.js'
import { getSupabase, isSupabaseConfigured } from '../utils/supabaseClient.js'
import {
  buildAuthRegisterOptions,
  finishAuthRegister,
  buildAuthLoginOptions,
  finishAuthLogin,
} from '../utils/authWebAuthn.js'

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  })
}

function authUserPayload(user) {
  return { id: user.id, email: user.email }
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
        user: authUserPayload(user),
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
    return res.status(201).json({ token, user: authUserPayload(user) })
  } catch (err) {
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
      return res.json({ token, user: authUserPayload(user) })
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
    return res.json({ token, user: authUserPayload(user) })
  } catch (err) {
    console.error('login error', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' })
  }
})

// --- Touch ID / Passkey auth ---

router.post('/webauthn/register/options', async (req, res) => {
  try {
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
    const user = await finishAuthRegister(req, {
      response: req.body?.response,
      challengeToken: req.body?.challengeToken,
      challengeId: req.body?.challengeId,
      userId: req.body?.userId,
      email: req.body?.email,
    })
    const token = signToken(user)
    return res.status(201).json({ token, user: authUserPayload(user) })
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
    return res.json({ token, user: authUserPayload(user) })
  } catch (err) {
    return webauthnError(res, err, 'Failed to sign in with Touch ID.')
  }
})

router.get('/me', (req, res) => {
  return res.json({ user: { id: req.user.sub, email: req.user.email } })
})

export default router

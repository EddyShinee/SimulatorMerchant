import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { appendUser, findUserByEmail } from '../utils/csv.js'

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  })
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
    if (findUserByEmail(email)) {
      return res
        .status(409)
        .json({ error: 'EMAIL_TAKEN', message: 'An account with this email already exists.' })
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    const passwordHash = await bcrypt.hash(password, saltRounds)

    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash,
      createdAt: new Date().toISOString(),
    }
    appendUser(user)

    const token = signToken(user)
    return res.status(201).json({ token, user: { id: user.id, email: user.email } })
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

    const user = findUserByEmail(email)
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
    return res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error('login error', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong.' })
  }
})

// GET /api/auth/me  (protected — see index.js wiring)
router.get('/me', (req, res) => {
  return res.json({ user: { id: req.user.sub, email: req.user.email } })
})

export default router

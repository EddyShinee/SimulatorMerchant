import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../middleware/auth.js'
import {
  isMerchantStoreConfigured,
  getVaultRow,
  createVault,
  updateVaultPassword,
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
} from '../utils/merchantStore.js'

const router = express.Router()

const VAULT_TOKEN_TTL = process.env.VAULT_TOKEN_EXPIRES_IN || '30m'
const MIN_VAULT_PASSWORD_LEN = 6

router.use(requireAuth)

function userId(req) {
  return req.user?.sub
}

function storeNotReady(res) {
  return res.status(503).json({
    error: 'STORE_UNAVAILABLE',
    message:
      'Merchant vault storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL on the server.',
  })
}

function signVaultToken(uid) {
  return jwt.sign({ sub: uid, vault: true }, process.env.JWT_SECRET, {
    expiresIn: VAULT_TOKEN_TTL,
  })
}

function requireVaultUnlock(req, res, next) {
  const token = req.headers['x-vault-token']
  if (!token || typeof token !== 'string') {
    return res.status(401).json({
      error: 'VAULT_LOCKED',
      message: 'Vault unlock required. Send X-Vault-Token after unlocking.',
    })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (!payload.vault || payload.sub !== userId(req)) {
      return res.status(401).json({
        error: 'VAULT_LOCKED',
        message: 'Invalid vault unlock token.',
      })
    }
    req.vaultUnlocked = true
    return next()
  } catch {
    return res.status(401).json({
      error: 'VAULT_LOCKED',
      message: 'Vault unlock token is invalid or expired.',
    })
  }
}

function handleStoreError(res, err, fallbackMessage) {
  if (err?.code === 'STORE_UNAVAILABLE') return storeNotReady(res)
  console.error('[merchants]', err)
  return res.status(500).json({ error: 'SERVER_ERROR', message: fallbackMessage })
}

// GET /api/merchants/vault
router.get('/vault', async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const row = await getVaultRow(userId(req))
    return res.json({ configured: Boolean(row) })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to read vault status.')
  }
})

// POST /api/merchants/vault — set password first time
router.post('/vault', async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const password = String(req.body?.password || '')
    if (password.length < MIN_VAULT_PASSWORD_LEN) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: `Vault password must be at least ${MIN_VAULT_PASSWORD_LEN} characters.`,
      })
    }

    const existing = await getVaultRow(userId(req))
    if (existing) {
      return res.status(409).json({
        error: 'VAULT_EXISTS',
        message: 'Vault password is already set. Use PUT to change it.',
      })
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    const passwordHash = await bcrypt.hash(password, saltRounds)
    await createVault(userId(req), passwordHash)
    const unlockToken = signVaultToken(userId(req))
    return res.status(201).json({ configured: true, unlockToken })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to create vault.')
  }
})

// PUT /api/merchants/vault — change password
router.put('/vault', async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    if (newPassword.length < MIN_VAULT_PASSWORD_LEN) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: `Vault password must be at least ${MIN_VAULT_PASSWORD_LEN} characters.`,
      })
    }

    const row = await getVaultRow(userId(req))
    if (!row) {
      return res.status(404).json({
        error: 'VAULT_NOT_FOUND',
        message: 'Vault is not configured yet.',
      })
    }

    const ok = await bcrypt.compare(currentPassword, row.password_hash)
    if (!ok) {
      return res.status(401).json({
        error: 'INVALID_PASSWORD',
        message: 'Current vault password is incorrect.',
      })
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    const passwordHash = await bcrypt.hash(newPassword, saltRounds)
    await updateVaultPassword(userId(req), passwordHash)
    const unlockToken = signVaultToken(userId(req))
    return res.json({ configured: true, unlockToken })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to update vault password.')
  }
})

// POST /api/merchants/vault/unlock
router.post('/vault/unlock', async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const password = String(req.body?.password || '')
    const row = await getVaultRow(userId(req))
    if (!row) {
      return res.status(404).json({
        error: 'VAULT_NOT_FOUND',
        message: 'Vault is not configured yet. Create a vault password first.',
      })
    }

    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) {
      return res.status(401).json({
        error: 'INVALID_PASSWORD',
        message: 'Incorrect vault password.',
      })
    }

    return res.json({ unlockToken: signVaultToken(userId(req)) })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to unlock vault.')
  }
})

// GET /api/merchants — list (requires unlock)
router.get('/', requireVaultUnlock, async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const items = await listCredentials(userId(req))
    return res.json({ items })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to list merchants.')
  }
})

// POST /api/merchants
router.post('/', requireVaultUnlock, async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const merchantName = String(req.body?.merchantName || '').trim()
    const mid = String(req.body?.mid || '').trim()
    const secretKey = String(req.body?.secretKey || '')
    const environment = String(req.body?.environment || 'uat')

    if (!merchantName) {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'Merchant name is required.' })
    }
    if (!mid) {
      return res.status(400).json({ error: 'INVALID_MID', message: 'Merchant ID (MID) is required.' })
    }
    if (environment !== 'uat' && environment !== 'production') {
      return res.status(400).json({
        error: 'INVALID_ENVIRONMENT',
        message: 'Environment must be uat or production.',
      })
    }

    const item = await createCredential(userId(req), { merchantName, mid, secretKey, environment })
    return res.status(201).json({ item })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to create merchant.')
  }
})

// PUT /api/merchants/:id
router.put('/:id', requireVaultUnlock, async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const id = String(req.params.id || '')
    const patch = {}
    if (req.body?.merchantName !== undefined) {
      patch.merchantName = String(req.body.merchantName).trim()
      if (!patch.merchantName) {
        return res.status(400).json({ error: 'INVALID_NAME', message: 'Merchant name is required.' })
      }
    }
    if (req.body?.mid !== undefined) {
      patch.mid = String(req.body.mid).trim()
      if (!patch.mid) {
        return res.status(400).json({ error: 'INVALID_MID', message: 'Merchant ID (MID) is required.' })
      }
    }
    if (req.body?.secretKey !== undefined) {
      patch.secretKey = String(req.body.secretKey)
    }
    if (req.body?.environment !== undefined) {
      const environment = String(req.body.environment)
      if (environment !== 'uat' && environment !== 'production') {
        return res.status(400).json({
          error: 'INVALID_ENVIRONMENT',
          message: 'Environment must be uat or production.',
        })
      }
      patch.environment = environment
    }

    const item = await updateCredential(userId(req), id, patch)
    if (!item) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Merchant not found.' })
    }
    return res.json({ item })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to update merchant.')
  }
})

// DELETE /api/merchants/:id
router.delete('/:id', requireVaultUnlock, async (req, res) => {
  if (!isMerchantStoreConfigured()) return storeNotReady(res)
  try {
    const deleted = await deleteCredential(userId(req), String(req.params.id || ''))
    if (!deleted) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Merchant not found.' })
    }
    return res.json({ ok: true })
  } catch (err) {
    return handleStoreError(res, err, 'Failed to delete merchant.')
  }
})

export default router

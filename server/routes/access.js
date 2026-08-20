import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { attachAccess, requireAdmin } from '../middleware/access.js'
import { FEATURE_GROUPS, ROLES } from '../../src/config/accessControl.js'
import { createAppUser, getFeatureMap, isFlagOn, listAppUsers, setFeatureEnabled, setUserPassword, setUserRole, setUserStatus } from '../utils/accessStore.js'

const router = express.Router()

/** Public flags for login/register (no auth). */
router.get('/public', async (req, res) => {
  try {
    const map = await getFeatureMap()
    return res.json({
      features: {
        registration: isFlagOn(map, 'registration'),
      },
    })
  } catch (err) {
    console.error('[access:public]', err)
    return res.json({ features: { registration: true } })
  }
})

router.use(requireAuth, attachAccess)

router.get('/session', async (req, res) => {
  try {
    const features = await getFeatureMap()
    return res.json({
      role: req.access.role,
      features,
      catalog: FEATURE_GROUPS,
    })
  } catch (err) {
    console.error('[access:session]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to load access session.' })
  }
})

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await listAppUsers()
    return res.json({ users })
  } catch (err) {
    console.error('[access:users]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Failed to list users.' })
  }
})

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const user = await createAppUser({
      email: req.body?.email,
      password: req.body?.password,
      role: req.body?.role,
    })
    return res.status(201).json({ user })
  } catch (err) {
    const status =
      err.code === 'EMAIL_TAKEN'
        ? 409
        : err.code === 'STORE_UNAVAILABLE'
          ? 503
          : err.code === 'INVALID_EMAIL' || err.code === 'WEAK_PASSWORD'
            ? 400
            : 400
    console.error('[access:create-user]', err.code || err.message)
    return res.status(status).json({ error: err.code || 'CREATE_FAILED', message: err.message })
  }
})

router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const user = await setUserRole(req.params.id, req.body?.role, req.user.sub)
    return res.json({ user })
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'LAST_ADMIN' ? 409 : 400
    return res.status(status).json({ error: err.code || 'UPDATE_FAILED', message: err.message })
  }
})

router.patch('/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const user = await setUserStatus(req.params.id, req.body?.status, req.user.sub)
    return res.json({ user })
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'LAST_ADMIN' || err.code === 'SELF_BLOCK'
          ? 409
          : 400
    return res.status(status).json({ error: err.code || 'UPDATE_FAILED', message: err.message })
  }
})

router.patch('/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const user = await setUserPassword(req.params.id, req.body?.password)
    return res.json({ user })
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'STORE_UNAVAILABLE' ? 503 : 400
    return res.status(status).json({ error: err.code || 'UPDATE_FAILED', message: err.message })
  }
})

router.patch('/features/:key?', requireAdmin, async (req, res) => {
  try {
    const key = String(req.body?.key || req.params.key || '').trim()
    const role = String(req.body?.role || '').trim()
    if (role !== ROLES.admin && role !== ROLES.member) {
      return res.status(400).json({
        error: 'INVALID_ROLE',
        message: 'role must be admin or member.',
      })
    }
    const feature = await setFeatureEnabled(key, role, req.body?.enabled, req.user.sub)
    const features = await getFeatureMap()
    return res.json({ feature, features })
  } catch (err) {
    const status = err.code === 'FEATURE_LOCKED' ? 400 : 500
    return res.status(status).json({ error: err.code || 'UPDATE_FAILED', message: err.message })
  }
})

export default router

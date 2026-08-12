import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { attachAccess, requireAdmin } from '../middleware/access.js'
import { FEATURE_GROUPS } from '../../src/config/accessControl.js'
import { getFeatureMap, isFlagOn, listAppUsers, setFeatureEnabled, setUserRole } from '../utils/accessStore.js'

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

router.patch('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const user = await setUserRole(req.params.id, req.body?.role, req.user.sub)
    return res.json({ user })
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'LAST_ADMIN' ? 409 : 400
    return res.status(status).json({ error: err.code || 'UPDATE_FAILED', message: err.message })
  }
})

router.patch('/features/:key?', requireAdmin, async (req, res) => {
  try {
    const key = String(req.body?.key || req.params.key || '').trim()
    const feature = await setFeatureEnabled(key, req.body?.enabled, req.user.sub)
    const features = await getFeatureMap()
    return res.json({ feature, features })
  } catch (err) {
    const status = err.code === 'FEATURE_LOCKED' ? 400 : 500
    return res.status(status).json({ error: err.code || 'UPDATE_FAILED', message: err.message })
  }
})

export default router

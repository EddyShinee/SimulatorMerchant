import { ROLES } from '../../src/config/accessControl.js'
import { ensureAppProfile, getFeatureMap, featureEnabled } from '../utils/accessStore.js'

export async function attachAccess(req, res, next) {
  try {
    if (!req.user?.sub) return next()
    const profile = await ensureAppProfile({ id: req.user.sub, email: req.user.email })
    req.access = {
      role: profile.role === ROLES.admin ? ROLES.admin : ROLES.member,
      profile,
    }
    return next()
  } catch (err) {
    console.error('[access:attach]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to load access profile.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.access?.role !== ROLES.admin) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Admin access required.',
    })
  }
  return next()
}

export function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const role = req.access?.role === ROLES.admin ? ROLES.admin : ROLES.member
      const map = await getFeatureMap()
      if (!featureEnabled(map, featureKey, role)) {
        return res.status(403).json({
          error: 'FEATURE_DISABLED',
          message: 'This feature is disabled for your role.',
          feature: featureKey,
        })
      }
      return next()
    } catch (err) {
      console.error('[access:feature]', err)
      return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to check feature access.' })
    }
  }
}

/** Same as requireFeature — kept for older route imports. */
export const requireFlag = requireFeature

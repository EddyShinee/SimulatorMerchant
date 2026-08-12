import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client.js'
import { useAuth } from './AuthContext.jsx'
import {
  DEFAULT_FEATURE_MAP,
  FEATURE_GROUPS,
  ROLES,
  featureKeyForPath,
  isAdminRole,
  isFeatureEnabledForRole,
  normalizeFeatureMap,
} from '../config/accessControl.js'

const AccessContext = createContext(null)

export function AccessProvider({ children }) {
  const { user, isAuthenticated, initializing: authInit } = useAuth()
  const [role, setRole] = useState(ROLES.member)
  const [features, setFeaturesState] = useState(DEFAULT_FEATURE_MAP)
  const [loading, setLoading] = useState(true)

  const setFeatures = useCallback((next) => {
    setFeaturesState(normalizeFeatureMap(next || {}))
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (!isAuthenticated) {
        setRole(ROLES.member)
        const { data } = await api.get('/api/access/public')
        const registrationOn = data.features?.registration !== false
        setFeaturesState(
          normalizeFeatureMap({
            ...DEFAULT_FEATURE_MAP,
            registration: { admin: registrationOn, member: registrationOn },
          })
        )
        return
      }
      const { data } = await api.get('/api/access/session')
      setRole(data.role === ROLES.admin ? ROLES.admin : ROLES.member)
      setFeaturesState(normalizeFeatureMap(data.features || {}))
    } catch {
      setRole(user?.role === ROLES.admin ? ROLES.admin : ROLES.member)
      setFeaturesState(DEFAULT_FEATURE_MAP)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user?.role])

  useEffect(() => {
    if (authInit) return
    void refresh()
  }, [authInit, refresh])

  const isAdmin = isAdminRole(role)

  const isFeatureOn = useCallback(
    (key) => isFeatureEnabledForRole(features, key, role),
    [features, role]
  )

  const canAccess = useCallback(
    (key) => {
      if (key === '__admin__') return isAdmin
      return isFeatureOn(key)
    },
    [isAdmin, isFeatureOn]
  )

  const canOpenPath = useCallback(
    (pathname) => {
      const key = featureKeyForPath(pathname)
      if (key === '__admin__') return isAdmin
      return canAccess(key)
    },
    [canAccess, isAdmin]
  )

  const value = useMemo(
    () => ({
      role,
      isAdmin,
      features,
      catalog: FEATURE_GROUPS,
      loading: authInit || loading,
      isFeatureOn,
      canAccess,
      canOpenPath,
      refresh,
      setFeatures,
    }),
    [role, isAdmin, features, authInit, loading, isFeatureOn, canAccess, canOpenPath, refresh, setFeatures]
  )

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function useAccess() {
  const ctx = useContext(AccessContext)
  if (!ctx) throw new Error('useAccess must be used within an AccessProvider')
  return ctx
}

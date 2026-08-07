import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import api, { getToken, setToken } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let active = true
    async function bootstrap() {
      const token = getToken()
      if (!token) {
        setInitializing(false)
        return
      }
      try {
        const { data } = await api.get('/api/auth/me')
        if (active) setUser(data.user)
      } catch {
        setToken(null)
        if (active) setUser(null)
      } finally {
        if (active) setInitializing(false)
      }
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (email, password) => {
    const { data } = await api.post('/api/auth/register', { email, password })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const loginWithTouchId = useCallback(async (email = '') => {
    if (!browserSupportsWebAuthn()) {
      const err = new Error('Touch ID / passkeys are not supported in this browser.')
      throw err
    }
    const { data: opt } = await api.post('/api/auth/webauthn/login/options', {
      email: String(email || '').trim().toLowerCase(),
    })
    const challengeToken = opt?.challengeToken || opt?.challengeId
    if (!opt?.options || !challengeToken) {
      throw new Error(opt?.message || 'Invalid Touch ID options from server.')
    }
    const assertion = await startAuthentication(opt.options)
    const { data } = await api.post('/api/auth/webauthn/login', {
      response: assertion,
      challengeToken,
      challengeId: challengeToken,
    })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const registerWithTouchId = useCallback(async (email) => {
    if (!browserSupportsWebAuthn()) {
      throw new Error('Touch ID / passkeys are not supported in this browser.')
    }
    const normalized = String(email || '').trim().toLowerCase()
    const { data: opt } = await api.post('/api/auth/webauthn/register/options', {
      email: normalized,
    })
    const challengeToken = opt?.challengeToken || opt?.challengeId
    if (!opt?.options || !challengeToken || !opt?.user?.id) {
      throw new Error(opt?.message || 'Invalid Touch ID options from server.')
    }
    const attestation = await startRegistration(opt.options)
    const { data } = await api.post('/api/auth/webauthn/register', {
      response: attestation,
      challengeToken,
      challengeId: challengeToken,
      userId: opt.user.id,
      email: opt.user.email || normalized,
    })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: !!user,
      login,
      register,
      loginWithTouchId,
      registerWithTouchId,
      logout,
    }),
    [user, initializing, login, register, loginWithTouchId, registerWithTouchId, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

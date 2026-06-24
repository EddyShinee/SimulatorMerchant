import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import api, { getToken, setToken } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  // On mount, if a token exists, validate it and load the current user.
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

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, initializing, isAuthenticated: !!user, login, register, logout }),
    [user, initializing, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

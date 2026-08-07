import axios from 'axios'

// In dev, leave VITE_API_BASE_URL empty to use the Vite proxy (/api -> backend).
// In production set it to the deployed backend origin.
const baseURL = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

const TOKEN_KEY = 'sim_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// Attach the bearer token to every request when present.
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// The absolute base used for display purposes (e.g. the webhook URL).
export function getApiOrigin() {
  if (baseURL) return baseURL.replace(/\/$/, '')
  return window.location.origin
}

// Webhook URLs must be reachable from the Node backend (not only the browser).
// In dev, prefer the proxy target (e.g. http://localhost:4000) over the Vite port.
export function getWebhookOrigin() {
  if (baseURL) return baseURL.replace(/\/$/, '')
  const devTarget = import.meta.env.VITE_DEV_PROXY_TARGET?.replace(/\/$/, '')
  if (devTarget) return devTarget
  return window.location.origin
}

/** User-scoped inbox URLs so callbacks land in that account's Request Inbox. */
export function getInboxUrls(userId) {
  const origin = getApiOrigin()
  const uid = userId ? String(userId).trim() : ''
  if (uid) {
    return {
      webhook: `${origin}/api/simulator/hook/u/${uid}`,
      backendCallback: `${origin}/api/simulator/hook/u/${uid}/callback-backend`,
      frontendCallback: `${origin}/api/simulator/callback/frontend/u/${uid}`,
      frontendReturn: `${origin}/callback/frontend`,
    }
  }
  return {
    webhook: `${origin}/api/simulator/hook`,
    backendCallback: `${origin}/api/simulator/hook/callback-backend`,
    frontendCallback: `${origin}/api/simulator/callback/frontend`,
    frontendReturn: `${origin}/callback/frontend`,
  }
}

export default api

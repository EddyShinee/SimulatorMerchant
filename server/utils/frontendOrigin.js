/** Frontend origin for payment callback redirects (SPA, not API). */
export function resolveFrontendOrigin(req) {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.FRONTEND_URL,
    process.env.DEV_FRONTEND_URL,
  ].filter((v) => v && v !== 'null' && v !== 'undefined')

  for (const raw of candidates) {
    try {
      const url = new URL(raw)
      return url.origin
    } catch {
      /* try next */
    }
  }

  const forwardedHost = req.get('x-forwarded-host')
  const host = (forwardedHost || req.get('host') || '').split(',')[0].trim()
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http'

  // Local dev: API on :4000, React on :5173
  if (host.includes('localhost:4000') || host.includes('127.0.0.1:4000')) {
    return 'http://localhost:5173'
  }

  // Use the host that received the callback (merchant app), not Origin (2C2P payment page).
  if (host) {
    return `${protocol}://${host}`
  }

  if (req.headers.origin) {
    try {
      return new URL(req.headers.origin).origin
    } catch {
      /* fall through */
    }
  }

  return `${protocol}://localhost`
}

export function callbackDisplayUrl(req, token) {
  return `${resolveFrontendOrigin(req)}/callback/frontend?d=${encodeURIComponent(token)}`
}

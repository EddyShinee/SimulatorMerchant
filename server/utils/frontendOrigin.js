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

  const host = req.get('host') || ''
  const protocol = req.protocol || 'http'

  // Local dev: API on :4000, React on :5173
  if (host.includes('localhost:4000') || host.includes('127.0.0.1:4000')) {
    return 'http://localhost:5173'
  }

  if (req.headers.origin) {
    try {
      return new URL(req.headers.origin).origin
    } catch {
      /* fall through */
    }
  }

  return `${protocol}://${host}`
}

export function callbackDisplayUrl(req, token) {
  return `${resolveFrontendOrigin(req)}/callback/frontend?d=${encodeURIComponent(token)}`
}

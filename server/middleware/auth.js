import jwt from 'jsonwebtoken'

// Verifies the Bearer token and attaches the decoded payload to req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'MISSING_TOKEN', message: 'Authentication required.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = payload
    return next()
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired token.' })
  }
}

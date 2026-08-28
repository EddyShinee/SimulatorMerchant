import './polyfills.js'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import simulatorRouter from './routes/simulator.js'
import paymentActionRouter from './routes/paymentAction.js'
import posStandaloneRouter from './routes/posStandalone.js'
import merchantsRouter from './routes/merchants.js'
import accessRouter from './routes/access.js'
import { requireAuth } from './middleware/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load backend env from server/.env when present (local dev). On hosts like
// Vercel the variables come from the dashboard, so a missing file is fine.
dotenv.config({ path: path.join(__dirname, '.env') })

// Ensure the app can boot even if JWT_SECRET wasn't configured. Set a real
// secret in your host's environment variables for production security.
if (!process.env.JWT_SECRET) {
  console.warn('[warn] JWT_SECRET is not set — using an insecure default. Set it in your env!')
  process.env.JWT_SECRET = 'insecure-default-change-me-please'
}

const app = express()

// CORS configuration from env (comma-separated origins, or * for all)
const corsOrigin = process.env.CORS_ORIGIN || '*'
const allowedOrigins =
  corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Apple Pay domain verification (optional — set APPLE_PAY_DOMAIN_ASSOCIATION in env)
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
  const content = process.env.APPLE_PAY_DOMAIN_ASSOCIATION
  if (!content || !String(content).trim()) {
    return res
      .status(404)
      .type('text/plain')
      .send(
        'Not configured. Set APPLE_PAY_DOMAIN_ASSOCIATION with the file content from 2C2P, then register this domain in 2C2P/Apple Pay.'
      )
  }
  res.type('text/plain').send(String(content).trim())
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'simulator-merchant-api', time: new Date().toISOString() })
})

// Protect /api/auth/me (runs before the router because it is more specific)
app.use('/api/auth/me', requireAuth)
// Auth routes (register/login are public; /me is guarded above)
app.use('/api/auth', authRouter)

// Simulator routes (mix of public hook + protected endpoints)
app.use('/api/simulator', simulatorRouter)
app.use('/api/simulator', paymentActionRouter)
app.use('/api/simulator', posStandaloneRouter)

// Saved merchant credentials (vault-locked)
app.use('/api/merchants', merchantsRouter)

// Roles + feature flags (admin / member)
app.use('/api/access', accessRouter)

// Serve the built frontend (used for local `npm start`; on Vercel the static
// files and SPA fallback are handled by the platform, not Express).
const distDir = path.resolve(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next()
  })
})

export default app

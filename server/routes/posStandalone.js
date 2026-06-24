import express from 'express'
import crypto from 'crypto'
import * as jose from 'jose'
import { requireAuth } from '../middleware/auth.js'
import {
  loadPrivateKeyFromInput,
  assertEs256PrivateKey,
} from '../utils/privateKey.js'
import { loadPublicKeyFromPem } from '../utils/publicKey.js'

const router = express.Router()
router.use(requireAuth)

function notificationClaims(payload) {
  return typeof payload === 'string' ? JSON.parse(payload) : payload
}

async function importEs256Key(input, password) {
  const keyObject = loadPrivateKeyFromInput({ ...input, password })
  assertEs256PrivateKey(keyObject)
  const pkcs8 = keyObject.export({ type: 'pkcs8', format: 'pem' })
  return jose.importPKCS8(pkcs8, 'ES256')
}

/** Spec §3.1.1: ES256 JWT; payload must match notification body exactly. */
async function signWebhookJwt(payload, input, password) {
  const key = await importEs256Key(input, password)
  const claims = notificationClaims(payload)
  const bodyString = JSON.stringify(claims)
  const jwt = await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .sign(key)
  return { jwt, bodyString, claims }
}

function generateTestEcKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    // SPKI PEM — verify-jwt accepts this; production uses X.509 .cer shared with 2C2P
    publicCertPem: publicKey.export({ type: 'spki', format: 'pem' }),
  }
}

// POST /api/simulator/pos-standalone/generate-test-key
router.post('/pos-standalone/generate-test-key', (req, res) => {
  try {
    const { privateKeyPem, publicCertPem } = generateTestEcKeyPair()
    res.json({
      privateKeyPem,
      publicCertPem,
      note: 'Test EC P-256 key pair. Production: share X.509 public cert (.cer/.pem) with 2C2P (Spec §3.1.1.2).',
    })
  } catch (e) {
    res.status(500).json({ error: 'KEYGEN_FAILED', message: e.message })
  }
})

// POST /api/simulator/pos-standalone/verify-jwt
router.post('/pos-standalone/verify-jwt', async (req, res) => {
  try {
    const { webhookJwt, publicCertPem } = req.body || {}
    if (!webhookJwt?.trim()) {
      return res.status(400).json({ error: 'MISSING_JWT', message: 'webhook-jwt is required.' })
    }
    if (!publicCertPem?.trim()) {
      return res.status(400).json({ error: 'MISSING_CERT', message: 'Public certificate (.cer/.pem) is required.' })
    }
    const publicKey = loadPublicKeyFromPem(publicCertPem)
    const spki = publicKey.export({ type: 'spki', format: 'pem' })
    const jwk = await jose.importSPKI(spki, 'ES256')
    const { payload } = await jose.jwtVerify(webhookJwt, jwk, { algorithms: ['ES256'] })
    res.json({ valid: true, payload })
  } catch (e) {
    res.status(400).json({ valid: false, message: e.message })
  }
})

// POST /api/simulator/pos-standalone/send
router.post('/pos-standalone/send', async (req, res) => {
  const started = Date.now()
  try {
    const {
      method = 'GET',
      url,
      bearerToken,
      body,
      signWebhookJwt: shouldSign,
      privateKeyPem,
      privateKeyFile,
      privateKeyPassword,
      notificationBody,
    } = req.body || {}

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'INVALID_URL', message: 'Target URL is required.' })
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return res.status(400).json({ error: 'INVALID_URL', message: 'The target URL is malformed.' })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'INVALID_PROTOCOL', message: 'Only http and https are allowed.' })
    }

    const upperMethod = String(method).toUpperCase()
    const headers = { Accept: 'application/json' }

    let requestBody = body
    if (shouldSign) {
      if (!privateKeyPem?.trim() && !privateKeyFile?.base64) {
        return res.status(400).json({ error: 'MISSING_KEY', message: 'EC private key (PEM) is required for webhook-jwt.' })
      }
      const payload = notificationBody ?? body
      if (!payload) {
        return res.status(400).json({ error: 'MISSING_BODY', message: 'Notification body is required.' })
      }
      try {
        const signed = await signWebhookJwt(
          payload,
          { privateKeyPem, privateKeyFile },
          privateKeyPassword
        )
        headers['webhook-jwt'] = signed.jwt
        requestBody = signed.bodyString
      } catch (e) {
        return res.status(400).json({ error: 'JWT_ERROR', message: `ES256 signing failed: ${e.message}` })
      }
      headers['Content-Type'] = 'application/json'
    } else if (bearerToken?.trim()) {
      headers.Authorization = `Bearer ${bearerToken.trim()}`
    }

    if (!shouldSign && upperMethod !== 'GET' && body != null) {
      headers['Content-Type'] = 'application/json'
      requestBody = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    const fetchOptions = {
      method: upperMethod,
      headers,
      signal: controller.signal,
    }
    if (!['GET', 'HEAD'].includes(upperMethod) && requestBody != null && requestBody !== '') {
      fetchOptions.body = requestBody
    }

    const response = await fetch(url, fetchOptions)
    clearTimeout(timeout)

    const text = await response.text()
    let parsedBody
    try {
      parsedBody = JSON.parse(text)
    } catch {
      parsedBody = text
    }

    const responseHeaders = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return res.json({
      ok: response.ok,
      durationMs: Date.now() - started,
      status: response.status,
      statusText: response.statusText,
      requestHeaders: headers,
      responseHeaders,
      body: parsedBody,
      rawBody: text,
      webhookJwt: headers['webhook-jwt'] || null,
    })
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted ? 'TIMEOUT' : 'REQUEST_FAILED',
      message: aborted ? 'The request timed out after 60s.' : err.message,
      durationMs: Date.now() - started,
    })
  }
})

export default router

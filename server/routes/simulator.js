import express from 'express'
import crypto from 'crypto'
import { requireAuth } from '../middleware/auth.js'

import { parsePaymentResponse, encodeCallbackDisplayToken } from '../utils/paymentResponse.js'
import { callbackDisplayUrl, resolveFrontendOrigin } from '../utils/frontendOrigin.js'

const router = express.Router()

// In-memory ring buffer of captured inbound requests.
const MAX_CAPTURED = 100
const capturedRequests = []

function captureRequest(req) {
  const entry = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    query: req.query,
    headers: req.headers,
    body: req.body,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
  }
  capturedRequests.unshift(entry)
  if (capturedRequests.length > MAX_CAPTURED) capturedRequests.length = MAX_CAPTURED
  return entry
}

function redirectToCallbackPage(req, res, token) {
  res.redirect(302, callbackDisplayUrl(req, token))
}

function frontendCallbackRedirect(req, res) {
  // Already has display token (e.g. user opened wrong API URL) → send to SPA
  if (req.query.d && typeof req.query.d === 'string') {
    return redirectToCallbackPage(req, res, req.query.d)
  }

  const entry = captureRequest(req)
  const raw =
    req.body?.paymentResponse ??
    req.query?.paymentResponse ??
    req.body?.payload ??
    req.query?.payload ??
    null
  const parsed =
    parsePaymentResponse(raw) ??
    (req.body && Object.keys(req.body).length > 0 ? req.body : null) ??
    (req.query && Object.keys(req.query).length > 0 ? req.query : null)

  const token = encodeCallbackDisplayToken({
    raw,
    parsed,
    receivedAt: entry.receivedAt,
    method: entry.method,
    path: entry.path,
  })

  redirectToCallbackPage(req, res, token)
}

// Frontend payment return — capture + redirect to React result page
router.all('/callback/frontend', frontendCallbackRedirect)
router.all('/hook/callback-frontend', frontendCallbackRedirect)
// Malformed paths (e.g. .../callback/null/callback/frontend?d=...) — still show result page
router.all(/^\/callback\/.*\/callback\/frontend\/?$/, frontendCallbackRedirect)

// ---------------------------------------------------------------------------
// PUBLIC: inbound request receiver ("đón request từ GET/POST")
// Any GET/POST/PUT/PATCH/DELETE to /api/simulator/hook (and sub-paths) is
// captured and echoed back. Useful as a webhook / request inspection target.
// ---------------------------------------------------------------------------
router.all(/^\/hook(\/.*)?$/, (req, res) => {
  const entry = captureRequest(req)
  res.json({
    ok: true,
    message: 'Request received and captured.',
    received: {
      id: entry.id,
      receivedAt: entry.receivedAt,
      method: entry.method,
      path: entry.path,
      query: entry.query,
      body: entry.body,
    },
  })
})

// ---------------------------------------------------------------------------
// PROTECTED endpoints (auth per-route — do NOT use router.use(requireAuth))
// ---------------------------------------------------------------------------

router.get('/requests', requireAuth, (req, res) => {
  res.json({ count: capturedRequests.length, requests: capturedRequests })
})

// Clear captured inbound requests
router.delete('/requests', requireAuth, (req, res) => {
  capturedRequests.length = 0
  res.json({ ok: true, count: 0 })
})

// Outbound API caller: server performs the request and returns the response.
router.post('/proxy', requireAuth, async (req, res) => {
  const started = Date.now()
  try {
    const { method = 'GET', url, headers = {}, body } = req.body || {}

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'INVALID_URL', message: 'A target URL is required.' })
    }
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return res.status(400).json({ error: 'INVALID_URL', message: 'The target URL is malformed.' })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res
        .status(400)
        .json({ error: 'INVALID_PROTOCOL', message: 'Only http and https are allowed.' })
    }

    const upperMethod = String(method).toUpperCase()
    const fetchOptions = {
      method: upperMethod,
      headers: { ...headers },
    }
    if (!['GET', 'HEAD'].includes(upperMethod) && body != null && body !== '') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
      if (!Object.keys(fetchOptions.headers).some((h) => h.toLowerCase() === 'content-type')) {
        fetchOptions.headers['Content-Type'] = 'application/json'
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    fetchOptions.signal = controller.signal

    const response = await fetch(url, fetchOptions)
    clearTimeout(timeout)

    const text = await response.text()
    let parsedBody
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        parsedBody = JSON.parse(text)
      } catch {
        parsedBody = text
      }
    } else {
      parsedBody = text
    }

    const responseHeaders = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return res.json({
      ok: true,
      durationMs: Date.now() - started,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: parsedBody,
    })
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted ? 'TIMEOUT' : 'REQUEST_FAILED',
      message: aborted ? 'The request timed out after 15s.' : err.message,
      durationMs: Date.now() - started,
    })
  }
})

// Transaction analysis: fetch HTML report from 2C2P / M-Pay merchant portal.
router.post('/transaction-analysis', requireAuth, async (req, res) => {
  const started = Date.now()
  try {
    const { url, sessionId } = req.body || {}

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'INVALID_URL', message: 'A target URL is required.' })
    }
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'INVALID_SESSION', message: 'Session ID is required.' })
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Cookie: `ASP.NET_SessionId=${sessionId.trim()}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const text = await response.text()

    return res.json({
      ok: response.ok,
      durationMs: Date.now() - started,
      status: response.status,
      statusText: response.statusText,
      body: text,
      error: response.ok ? null : `HTTP ${response.status}`,
    })
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted ? 'TIMEOUT' : 'REQUEST_FAILED',
      message: aborted ? 'The request timed out after 120s.' : err.message,
      durationMs: Date.now() - started,
    })
  }
})

export default router

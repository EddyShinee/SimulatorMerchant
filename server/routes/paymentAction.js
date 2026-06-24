import express from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as jose from 'jose'
import { requireAuth } from '../middleware/auth.js'
import { loadPrivateKey } from '../utils/privateKey.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_KEY_DIR =
  process.env.PAYMENT_ACTION_KEY_DIR || path.join(PROJECT_ROOT, 'src', 'KeyPaymentAction')
const DEFAULT_PRIVATE_FILE = '123.pfx'
const DEFAULT_PUBLIC_FILE = 'abc.cer'

const router = express.Router()
router.use(requireAuth)

function readDefaultKey(filename) {
  const filePath = path.join(DEFAULT_KEY_DIR, filename)
  if (!fs.existsSync(filePath)) return null
  return { base64: fs.readFileSync(filePath).toString('base64'), filename }
}

// GET /api/simulator/payment-action/default-keys  -> which default keys exist
router.get('/payment-action/default-keys', (req, res) => {
  res.json({
    privateKey: fs.existsSync(path.join(DEFAULT_KEY_DIR, DEFAULT_PRIVATE_FILE))
      ? DEFAULT_PRIVATE_FILE
      : null,
    publicCert: fs.existsSync(path.join(DEFAULT_KEY_DIR, DEFAULT_PUBLIC_FILE))
      ? DEFAULT_PUBLIC_FILE
      : null,
  })
})

// Load a public key (KeyObject) from a certificate or public key file (base64).
// Accepts: PEM public key (SPKI), PEM/DER X.509 certificate, or DER SPKI key.
function loadPublicKey(base64, filename) {
  const buffer = Buffer.from(base64, 'base64')
  const text = buffer.toString('utf8')

  if (text.includes('BEGIN PUBLIC KEY')) {
    return crypto.createPublicKey(text)
  }
  if (text.includes('BEGIN CERTIFICATE')) {
    return new crypto.X509Certificate(text).publicKey
  }
  // Binary (DER): try certificate first, then a raw SPKI public key.
  try {
    return new crypto.X509Certificate(buffer).publicKey
  } catch {
    return crypto.createPublicKey({ key: buffer, format: 'der', type: 'spki' })
  }
}

function jweCompactParts(text) {
  return text.trim().split('.').filter(Boolean).length
}

// POST /api/simulator/payment-action
router.post('/payment-action', async (req, res) => {
  const started = Date.now()
  try {
    const { apiUrl, xml, password, useDefaultKeys } = req.body || {}
    let { privateKey, publicCert } = req.body || {}

    if (!apiUrl || typeof apiUrl !== 'string') {
      return res.status(400).json({ error: 'INVALID_URL', message: 'API URL is required.' })
    }
    if (!xml || typeof xml !== 'string') {
      return res.status(400).json({ error: 'INVALID_XML', message: 'XML payload is required.' })
    }

    // Fall back to the bundled default keys when requested.
    if (useDefaultKeys) {
      privateKey = privateKey?.base64 ? privateKey : readDefaultKey(DEFAULT_PRIVATE_FILE)
      publicCert = publicCert?.base64 ? publicCert : readDefaultKey(DEFAULT_PUBLIC_FILE)
    }

    if (!privateKey?.base64 || !publicCert?.base64) {
      return res
        .status(400)
        .json({ error: 'MISSING_KEYS', message: 'Private key and public certificate are required.' })
    }

    let privKey
    let pubKey
    try {
      privKey = loadPrivateKey(privateKey.base64, privateKey.filename, password)
      pubKey = loadPublicKey(publicCert.base64, publicCert.filename)
    } catch (e) {
      return res.status(400).json({ error: 'KEY_ERROR', message: `Key error: ${e.message}` })
    }

    // 1) JWE: encrypt the XML with the recipient public key (RSA-OAEP / A256GCM)
    const jweToken = await new jose.CompactEncrypt(new TextEncoder().encode(xml))
      .setProtectedHeader({ alg: 'RSA-OAEP', enc: 'A256GCM', kid: '1' })
      .encrypt(pubKey)

    // 2) JWS: sign the JWE with our private key (PS256)
    const finalToken = await new jose.CompactSign(new TextEncoder().encode(jweToken))
      .setProtectedHeader({ alg: 'PS256', kid: '1' })
      .sign(privKey)

    // 3) Send the JWS-over-JWE as text/plain
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    let rawResponse = ''
    let status = null
    let statusText = ''
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: finalToken,
        signal: controller.signal,
      })
      status = resp.status
      statusText = resp.statusText
      rawResponse = await resp.text()
    } finally {
      clearTimeout(timeout)
    }

    // 4) Decrypt / verify the response
    let decryptedXml = null
    let decryptError = null
    try {
      const parts = jweCompactParts(rawResponse)
      if (parts === 3) {
        const { payload } = await jose.compactVerify(rawResponse.trim(), pubKey)
        const jwePayload = new TextDecoder().decode(payload)
        const { plaintext } = await jose.compactDecrypt(jwePayload.trim(), privKey)
        decryptedXml = new TextDecoder().decode(plaintext)
      } else if (parts === 5) {
        const { plaintext } = await jose.compactDecrypt(rawResponse.trim(), privKey)
        decryptedXml = new TextDecoder().decode(plaintext)
      } else {
        decryptedXml = rawResponse
      }
    } catch (e) {
      decryptError = e.message
    }

    return res.json({
      ok: true,
      status,
      statusText,
      durationMs: Date.now() - started,
      jwe: jweToken,
      jws: finalToken,
      rawResponse,
      decryptedXml,
      decryptError,
    })
  } catch (err) {
    console.error('payment-action error', err)
    return res.status(500).json({
      ok: false,
      error: 'SERVER_ERROR',
      message: err.message,
      durationMs: Date.now() - started,
    })
  }
})

export default router

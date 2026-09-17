import crypto from 'crypto'
import forge from 'node-forge'

function extractPemBlock(text, type) {
  const match = String(text).match(
    new RegExp(`-----BEGIN ${type}-----[\\s\\S]+?-----END ${type}-----`)
  )
  return match ? match[0] : null
}

function looksLikePrivateOnly(text) {
  const hasPrivate = /BEGIN (ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|PRIVATE KEY)/.test(
    text
  )
  const hasPublic = /BEGIN (CERTIFICATE|PUBLIC KEY|RSA PUBLIC KEY)/.test(text)
  return hasPrivate && !hasPublic
}

function loadPublicFromPem(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

  if (looksLikePrivateOnly(normalized)) {
    throw new Error('This file is a private key. Upload it in the Private Key field.')
  }

  const certPem = extractPemBlock(normalized, 'CERTIFICATE')
  if (certPem) {
    return new crypto.X509Certificate(certPem).publicKey
  }

  const spki = extractPemBlock(normalized, 'PUBLIC KEY')
  if (spki) return crypto.createPublicKey(spki)

  const rsaPub = extractPemBlock(normalized, 'RSA PUBLIC KEY')
  if (rsaPub) {
    try {
      return crypto.createPublicKey(rsaPub)
    } catch {
      return crypto.createPublicKey({ key: rsaPub, format: 'pem', type: 'pkcs1' })
    }
  }

  const pkcs7 = extractPemBlock(normalized, 'PKCS7') || extractPemBlock(normalized, 'CMS')
  if (pkcs7) {
    const msg = forge.pkcs7.messageFromPem(pkcs7)
    const cert = msg.certificates?.[0]
    if (!cert) throw new Error('PKCS#7 file has no certificate.')
    return crypto.createPublicKey(forge.pki.certificateToPem(cert))
  }

  throw new Error(
    'Public key must be X.509 (.cer/.crt/.pem), SPKI PEM (BEGIN PUBLIC KEY), or PKCS#7.'
  )
}

function loadPublicFromBinary(buffer, filename) {
  try {
    return new crypto.X509Certificate(buffer).publicKey
  } catch {
    /* not an X.509 cert */
  }
  try {
    return crypto.createPublicKey({ key: buffer, format: 'der', type: 'spki' })
  } catch {
    /* not SPKI */
  }
  try {
    return crypto.createPublicKey({ key: buffer, format: 'der', type: 'pkcs1' })
  } catch {
    /* not PKCS#1 */
  }

  throw new Error(
    `Unsupported public certificate format (${filename || 'cert'}). ` +
      'Upload a PEM/DER .cer/.crt or a BEGIN PUBLIC KEY .pem.'
  )
}

export function loadPublicKeyFromPem(pem) {
  return loadPublicFromPem(pem)
}

/** Load a recipient public key from any usual 2C2P file (PEM, CER, CRT, DER, PKCS#7). */
export function loadPublicKey(base64, filename) {
  const buffer = Buffer.from(base64, 'base64')
  const text = buffer.toString('utf8')
  try {
    if (text.includes('BEGIN')) return loadPublicFromPem(text)
    return loadPublicFromBinary(buffer, filename)
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.startsWith('This file is a private key') || msg.startsWith('Public key must')) {
      throw err
    }
    throw new Error(
      msg.includes('DECODER') || msg.includes('unsupported')
        ? `Unsupported public certificate format (${filename || 'cert'}). Upload a PEM/DER .cer/.crt.`
        : `Public certificate error: ${msg}`
    )
  }
}

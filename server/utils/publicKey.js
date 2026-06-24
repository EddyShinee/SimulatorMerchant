import crypto from 'crypto'

export function loadPublicKeyFromPem(pem) {
  const text = String(pem).trim().replace(/^\uFEFF/, '')

  if (text.includes('BEGIN CERTIFICATE')) {
    return new crypto.X509Certificate(text).publicKey
  }
  if (text.includes('BEGIN PUBLIC KEY')) {
    return crypto.createPublicKey(text)
  }

  throw new Error('Public key must be X.509 certificate (.cer/.pem) or SPKI public key PEM.')
}

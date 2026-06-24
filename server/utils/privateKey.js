import crypto from 'crypto'
import forge from 'node-forge'

// Load a private key (KeyObject) from an uploaded file (base64).
// Supports pfx/p12 (via node-forge), pem/key and der.
export function loadPrivateKey(base64, filename, password) {
  const lower = (filename || '').toLowerCase()
  const buffer = Buffer.from(base64, 'base64')

  if (lower.endsWith('.pfx') || lower.endsWith('.p12')) {
    const p12Der = forge.util.createBuffer(buffer.toString('binary'))
    const p12Asn1 = forge.asn1.fromDer(p12Der)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '')
    let bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    let bag = (bags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0]
    if (!bag) {
      bags = p12.getBags({ bagType: forge.pki.oids.keyBag })
      bag = (bags[forge.pki.oids.keyBag] || [])[0]
    }
    if (!bag || !bag.key) {
      throw new Error('No private key found in PFX/P12 (wrong password?).')
    }
    const pem = forge.pki.privateKeyToPem(bag.key)
    return crypto.createPrivateKey(pem)
  }

  if (lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.txt')) {
    const pem = buffer.toString('utf8')
    return crypto.createPrivateKey(
      password ? { key: pem, passphrase: password } : pem
    )
  }

  if (lower.endsWith('.der')) {
    return crypto.createPrivateKey({
      key: buffer,
      format: 'der',
      type: 'pkcs8',
      ...(password ? { passphrase: password } : {}),
    })
  }

  return crypto.createPrivateKey(
    password ? { key: buffer.toString('utf8'), passphrase: password } : buffer.toString('utf8')
  )
}

export function normalizePemText(pem) {
  const text = String(pem).trim().replace(/^\uFEFF/, '')

  if (!text.includes('BEGIN') && text.length > 200) {
    throw new Error(
      'Input looks like a binary key file. Upload .pfx/.p12 via "Choose file" instead of pasting into the textarea.'
    )
  }
  if (text.includes('BEGIN CERTIFICATE') && !text.includes('PRIVATE KEY')) {
    throw new Error(
      'This is a certificate (.cer), not a private key. webhook-jwt needs an EC private key PEM (BEGIN EC PRIVATE KEY or BEGIN PRIVATE KEY).'
    )
  }
  if (text.includes('BEGIN PUBLIC KEY')) {
    throw new Error('This is a public key, not a private key.')
  }

  return text
}

export function loadPrivateKeyFromInput({ privateKeyPem, privateKeyFile, password }) {
  if (privateKeyFile?.base64 && privateKeyFile?.filename) {
    return loadPrivateKey(privateKeyFile.base64, privateKeyFile.filename, password)
  }

  if (privateKeyPem?.trim()) {
    const pem = normalizePemText(privateKeyPem)
    try {
      return crypto.createPrivateKey(
        password ? { key: pem, passphrase: password } : pem
      )
    } catch (err) {
      const msg = String(err.message || err)
      if (msg.includes('bad decrypt') || err.code === 'ERR_OSSL_EVP_BAD_DECRYPT') {
        throw new Error('Private key is encrypted. Enter the key password.')
      }
      throw new Error(`Invalid private key PEM: ${msg}`)
    }
  }

  throw new Error('EC private key (PEM or PFX) is required for webhook-jwt.')
}

export function assertEs256PrivateKey(keyObject) {
  if (keyObject.asymmetricKeyType !== 'ec') {
    const kind = keyObject.asymmetricKeyType?.toUpperCase() || 'UNKNOWN'
    const hint =
      kind === 'RSA'
        ? ' Payment Action keys (e.g. 123.pfx) are RSA — they cannot sign ES256 webhook-jwt.'
        : ''
    throw new Error(`ES256 requires an EC P-256 private key, but this key is ${kind}.${hint}`)
  }
}

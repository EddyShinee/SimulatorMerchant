import crypto from 'crypto'
import forge from 'node-forge'

const DEFAULT_KEY_PASSWORD = '123'
const DEMO_KEY_PASSWORDS = ['2c2p', DEFAULT_KEY_PASSWORD, '']

function isDecoderUnsupported(err) {
  const msg = String(err?.message || err)
  return (
    msg.includes('DECODER routines') ||
    msg.includes('unsupported') ||
    err?.code === 'ERR_OSSL_UNSUPPORTED' ||
    err?.code === 'ERR_OSSL_EVP_UNSUPPORTED'
  )
}

function isInterruptedOrCancelled(err) {
  const msg = String(err?.message || err)
  return (
    msg.includes('07880109') ||
    msg.includes('interrupted or cancelled') ||
    err?.code === 'ERR_OSSL_CRYPTO_INTERRUPTED_OR_CANCELLED'
  )
}

function friendlyKeyError(err, context) {
  const msg = String(err?.message || err)
  if (msg.includes('PKCS#12 MAC') || msg.includes('Invalid password') || msg.includes('mac verify')) {
    return 'Invalid PFX/P12 password. Try 2c2p (demo2) or 123 (123.pfx), or leave blank to auto-try.'
  }
  if (isInterruptedOrCancelled(err) || msg.includes('unable to get passphrase')) {
    return 'Private key is encrypted. Leave blank to auto-try 2c2p / 123, or enter your key password.'
  }
  if (
    msg.includes('bad decrypt') ||
    msg.includes('bad password') ||
    err?.code === 'ERR_OSSL_EVP_BAD_DECRYPT' ||
    err?.code === 'ERR_OSSL_BAD_DECRYPT'
  ) {
    return 'Could not decrypt the private key. Leave blank to auto-try 2c2p / 123, or enter the correct password.'
  }
  if (isDecoderUnsupported(err)) {
    return (
      `Unsupported key format (${context}): OpenSSL could not decode the key. ` +
      'Use a valid .pfx/.p12 with the correct password, or a PEM private key ' +
      '(BEGIN PRIVATE KEY / BEGIN RSA PRIVATE KEY).'
    )
  }
  return msg
}

function extractPrivateKeyPem(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const types = [
    'ENCRYPTED PRIVATE KEY',
    'RSA PRIVATE KEY',
    'EC PRIVATE KEY',
    'PRIVATE KEY',
    'OPENSSH PRIVATE KEY',
  ]
  for (const type of types) {
    const match = normalized.match(
      new RegExp(`-----BEGIN ${type}-----[\\s\\S]+?-----END ${type}-----`)
    )
    if (match) return match[0]
  }
  return normalized.trim()
}

function isEncryptedPem(pem) {
  return pem.includes('BEGIN ENCRYPTED PRIVATE KEY') || /Proc-Type:\s*4,ENCRYPTED/i.test(pem)
}

function intToB64u(n) {
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return Buffer.from(hex, 'hex').toString('base64url')
}

/** Convert forge RSA key to a Node KeyObject via JWK (avoids OpenSSL PEM decoder issues). */
function forgeKeyToKeyObject(forgeKey) {
  if (forgeKey?.n && forgeKey?.d && forgeKey?.p && forgeKey?.q) {
    try {
      return crypto.createPrivateKey({
        format: 'jwk',
        key: {
          kty: 'RSA',
          n: intToB64u(forgeKey.n),
          e: intToB64u(forgeKey.e),
          d: intToB64u(forgeKey.d),
          p: intToB64u(forgeKey.p),
          q: intToB64u(forgeKey.q),
          dp: intToB64u(forgeKey.dP),
          dq: intToB64u(forgeKey.dQ),
          qi: intToB64u(forgeKey.qInv),
        },
      })
    } catch {
      /* fall through to PEM */
    }
  }
  return createPrivateKeyFromPem(forgeKeyToPem(forgeKey))
}

/** Convert forge RSA key to PKCS#8 PEM (more reliable on OpenSSL 3). */
function forgeKeyToPem(forgeKey) {
  try {
    const rsaAsn1 = forge.pki.privateKeyToAsn1(forgeKey)
    const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaAsn1)
    return forge.pki.privateKeyInfoToPem(privateKeyInfo)
  } catch {
    return forge.pki.privateKeyToPem(forgeKey)
  }
}

function tryCreatePrivateKeyFromPem(pem, password) {
  const options =
    password != null && password !== '' ? { key: pem, passphrase: password } : { key: pem }
  try {
    return crypto.createPrivateKey(options)
  } catch (err) {
    if (pem.includes('BEGIN RSA PRIVATE KEY')) {
      try {
        return crypto.createPrivateKey({
          ...options,
          format: 'pem',
          type: 'pkcs1',
        })
      } catch {
        /* fall through */
      }
      if (isEncryptedPem(pem)) {
        try {
          const forgeKey = forge.pki.decryptRsaPrivateKey(pem, password || '')
          if (forgeKey) return forgeKeyToKeyObject(forgeKey)
        } catch {
          /* fall through */
        }
      }
    }
    throw err
  }
}

function passphraseCandidates(password, encrypted) {
  const pass = typeof password === 'string' ? password : ''
  const candidates = []
  const add = (value) => {
    if (value == null) return
    if (!candidates.includes(value)) candidates.push(value)
  }
  if (pass) add(pass)
  if (encrypted) {
    for (const demo of DEMO_KEY_PASSWORDS) add(demo)
  } else {
    add('')
  }
  return candidates
}

function createPrivateKeyFromPem(pem, password) {
  const keyPem = extractPrivateKeyPem(pem)
  if (!keyPem.includes('BEGIN')) {
    throw new Error('No private key PEM block found.')
  }
  if (keyPem.includes('BEGIN OPENSSH PRIVATE KEY')) {
    throw new Error(
      'OpenSSH private keys are not supported. Convert to PKCS#8 PEM (BEGIN PRIVATE KEY).'
    )
  }
  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(keyPem)) {
    if (pem.includes('BEGIN PUBLIC KEY') || pem.includes('BEGIN CERTIFICATE')) {
      throw new Error('This is a public certificate/key. Upload it in the Public Certificate field.')
    }
  }

  const encrypted = isEncryptedPem(keyPem)
  const candidates = passphraseCandidates(password, encrypted)
  let lastErr
  for (const pass of candidates) {
    try {
      return tryCreatePrivateKeyFromPem(keyPem, pass)
    } catch (err) {
      lastErr = err
    }
  }

  if (encrypted && !(typeof password === 'string' && password)) {
    throw new Error(friendlyKeyError(lastErr || new Error('encrypted'), 'PEM'))
  }
  throw lastErr
}

function loadPfxPrivateKey(buffer, password) {
  let p12Asn1
  try {
    p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(buffer.toString('binary')), {
      parseAllBytes: false,
      strict: false,
    })
  } catch (err) {
    throw new Error(`Invalid PFX/P12 file: ${err.message}`)
  }

  const pass = typeof password === 'string' ? password : ''
  const attempts = []
  if (pass) attempts.push(pass)
  for (const demo of DEMO_KEY_PASSWORDS) {
    if (!attempts.includes(demo)) attempts.push(demo)
  }
  let lastErr
  let p12
  for (const candidate of attempts) {
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, candidate)
      lastErr = null
      break
    } catch (err) {
      lastErr = err
    }
  }
  if (!p12) {
    throw new Error(friendlyKeyError(lastErr, 'PFX'))
  }

  let bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  let bag = (bags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0]
  if (!bag) {
    bags = p12.getBags({ bagType: forge.pki.oids.keyBag })
    bag = (bags[forge.pki.oids.keyBag] || [])[0]
  }
  if (!bag?.key) {
    throw new Error('No private key found in PFX/P12 (wrong password?).')
  }

  try {
    return forgeKeyToKeyObject(bag.key)
  } catch (err) {
    throw new Error(friendlyKeyError(err, 'PFX→PEM'))
  }
}

// Load a private key (KeyObject) from an uploaded file (base64).
// Supports pfx/p12 (via node-forge), pem/key and der.
export function loadPrivateKey(base64, filename, password) {
  const lower = (filename || '').toLowerCase()
  const buffer = Buffer.from(base64, 'base64')
  const asText = buffer.toString('utf8')

  // PEM regardless of extension (openssl pkcs12 -out often keeps a .pfx name).
  if (asText.includes('BEGIN')) {
    try {
      return createPrivateKeyFromPem(asText, password)
    } catch (err) {
      throw new Error(friendlyKeyError(err, filename || 'PEM'))
    }
  }

  const looksPfx = lower.endsWith('.pfx') || lower.endsWith('.p12')
  const looksDerSeq = buffer.length > 4 && buffer[0] === 0x30

  if (looksPfx || looksDerSeq) {
    try {
      return loadPfxPrivateKey(buffer, password)
    } catch (pfxErr) {
      if (looksPfx) throw pfxErr
    }
  }

  if (lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.txt')) {
    try {
      return createPrivateKeyFromPem(asText, password)
    } catch (err) {
      throw new Error(friendlyKeyError(err, filename || 'PEM'))
    }
  }

  if (lower.endsWith('.der')) {
    try {
      return crypto.createPrivateKey({
        key: buffer,
        format: 'der',
        type: 'pkcs8',
        ...(password ? { passphrase: password } : {}),
      })
    } catch (err) {
      try {
        return crypto.createPrivateKey({
          key: buffer,
          format: 'der',
          type: 'pkcs1',
        })
      } catch {
        throw new Error(friendlyKeyError(err, 'DER'))
      }
    }
  }

  try {
    return loadPfxPrivateKey(buffer, password)
  } catch (err) {
    throw new Error(
      friendlyKeyError(err, filename || 'key') +
        ' Tip: upload .pfx/.p12/.pem and enter the key password if required.'
    )
  }
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
      return createPrivateKeyFromPem(pem, password)
    } catch (err) {
      throw new Error(`Invalid private key PEM: ${friendlyKeyError(err, 'PEM')}`)
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

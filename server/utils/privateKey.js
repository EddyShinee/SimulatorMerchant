import crypto from 'crypto'
import forge from 'node-forge'

function isDecoderUnsupported(err) {
  const msg = String(err?.message || err)
  return (
    msg.includes('DECODER routines') ||
    msg.includes('unsupported') ||
    err?.code === 'ERR_OSSL_UNSUPPORTED' ||
    err?.code === 'ERR_OSSL_EVP_UNSUPPORTED'
  )
}

function friendlyKeyError(err, context) {
  const msg = String(err?.message || err)
  if (msg.includes('PKCS#12 MAC') || msg.includes('Invalid password') || msg.includes('mac verify')) {
    return 'Invalid PFX/P12 password. Default key 123.pfx uses password "123".'
  }
  if (msg.includes('bad decrypt') || err?.code === 'ERR_OSSL_EVP_BAD_DECRYPT') {
    return 'Private key is encrypted. Enter the correct key password.'
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

function createPrivateKeyFromPem(pem, password) {
  const options = password ? { key: pem, passphrase: password } : { key: pem }
  try {
    return crypto.createPrivateKey(options)
  } catch (err) {
    // Retry PKCS#1 → let Node infer; some builds prefer explicit type.
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
    }
    throw err
  }
}

function loadPfxPrivateKey(buffer, password) {
  let p12Asn1
  try {
    p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(buffer.toString('binary')))
  } catch (err) {
    throw new Error(`Invalid PFX/P12 file: ${err.message}`)
  }

  let p12
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '')
  } catch (err) {
    throw new Error(friendlyKeyError(err, 'PFX'))
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

  const pem = forgeKeyToPem(bag.key)
  try {
    return createPrivateKeyFromPem(pem)
  } catch (err) {
    throw new Error(friendlyKeyError(err, 'PFX→PEM'))
  }
}

// Load a private key (KeyObject) from an uploaded file (base64).
// Supports pfx/p12 (via node-forge), pem/key and der.
export function loadPrivateKey(base64, filename, password) {
  const lower = (filename || '').toLowerCase()
  const buffer = Buffer.from(base64, 'base64')

  if (lower.endsWith('.pfx') || lower.endsWith('.p12')) {
    return loadPfxPrivateKey(buffer, password)
  }

  // Sniff PKCS#12 even if the extension is wrong (common upload mistake).
  if (buffer.length > 4 && buffer[0] === 0x30 && !buffer.toString('utf8', 0, 32).includes('BEGIN')) {
    try {
      return loadPfxPrivateKey(buffer, password)
    } catch (pfxErr) {
      // Not a PFX — continue with PEM/DER attempts below unless clearly PFX.
      if (String(pfxErr.message).includes('Invalid PFX') === false && lower.endsWith('.pfx')) {
        throw pfxErr
      }
    }
  }

  if (lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.txt')) {
    const pem = buffer.toString('utf8')
    try {
      return createPrivateKeyFromPem(pem, password)
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

  const asText = buffer.toString('utf8')
  if (asText.includes('BEGIN')) {
    try {
      return createPrivateKeyFromPem(asText, password)
    } catch (err) {
      throw new Error(friendlyKeyError(err, filename || 'key'))
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

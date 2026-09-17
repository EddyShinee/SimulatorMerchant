/** Browser-safe sniff of merchant key / certificate files by content, not extension. */

export const KEY_FILE_ACCEPT = '.pfx,.p12,.pem,.key,.der,.cer,.crt,.txt,.p7b,.p7c'

const PRIVATE_BEGIN = /BEGIN (ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|PRIVATE KEY|OPENSSH PRIVATE KEY)/
const PUBLIC_BEGIN = /BEGIN (CERTIFICATE|PUBLIC KEY|RSA PUBLIC KEY|PKCS7|CMS)/

function filenameKindHint(name) {
  const n = String(name || '').toLowerCase()
  if (/(^|[^a-z])(private|privkey|priv)([^a-z]|$)/.test(n) || n.includes('-private') || n.includes('_private')) {
    return 'private'
  }
  if (/(^|[^a-z])(public|cert)([^a-z]|$)/.test(n) || n.includes('-public') || n.includes('_public')) {
    return 'public'
  }
  return null
}

export function detectKeyMaterial(bytes, filename = '') {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const name = String(filename || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const text = new TextDecoder('utf-8').decode(buf)
  const nameHint = filenameKindHint(name)

  const hasPrivate = PRIVATE_BEGIN.test(text)
  const hasPublic = PUBLIC_BEGIN.test(text)
  const encrypted =
    text.includes('BEGIN ENCRYPTED PRIVATE KEY') || /Proc-Type:\s*4,ENCRYPTED/i.test(text)

  if (hasPrivate) {
    return {
      kind: 'private',
      format: encrypted ? 'encrypted-pem' : 'private-pem',
      needsPassword: encrypted,
      labelKey: encrypted ? 'typeEncryptedPem' : 'typePrivatePem',
      confident: true,
    }
  }

  if (hasPublic) {
    const format = text.includes('BEGIN PKCS7') || text.includes('BEGIN CMS')
      ? 'pkcs7'
      : text.includes('BEGIN CERTIFICATE')
        ? 'cert-pem'
        : 'public-pem'
    return {
      kind: 'public',
      format,
      needsPassword: false,
      labelKey:
        format === 'pkcs7' ? 'typePkcs7' : format === 'cert-pem' ? 'typeCertPem' : 'typePublicPem',
      confident: true,
    }
  }

  const binarySeq = buf.length > 4 && buf[0] === 0x30
  if (ext === 'pfx' || ext === 'p12') {
    return { kind: 'private', format: 'pkcs12', needsPassword: true, labelKey: 'typePkcs12', confident: true }
  }
  if (ext === 'cer' || ext === 'crt' || ext === 'p7b' || ext === 'p7c') {
    return {
      kind: 'public',
      format: binarySeq ? 'der-public' : 'cert-pem',
      needsPassword: false,
      labelKey: ext === 'p7b' || ext === 'p7c' ? 'typePkcs7' : 'typeDerPublic',
      confident: true,
    }
  }

  // .der / .key / raw binary: PKCS#8 key and X.509 cert both start with 0x30 — do not guess.
  if (ext === 'der' || ext === 'key' || binarySeq) {
    const kind = nameHint || (ext === 'key' ? 'private' : 'unknown')
    return {
      kind,
      format: 'der',
      needsPassword: false,
      labelKey: kind === 'private' ? 'typePrivateDer' : kind === 'public' ? 'typeDerPublic' : 'typeUnknown',
      confident: false,
    }
  }

  if (nameHint) {
    return {
      kind: nameHint,
      format: ext || 'unknown',
      needsPassword: false,
      labelKey: 'typeUnknown',
      confident: false,
    }
  }

  return { kind: 'unknown', format: ext || 'unknown', needsPassword: false, labelKey: 'typeUnknown', confident: false }
}

/** Prefer the slot the user clicked unless PEM/extension is unambiguous. */
export function resolveKeySlot(info, preferSlot) {
  if (preferSlot && !info?.confident) return preferSlot
  if (info?.kind && info.kind !== 'unknown') return info.kind
  return preferSlot || 'unknown'
}

export async function inspectKeyFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  return { file, name: file.name, ...detectKeyMaterial(buf, file.name) }
}

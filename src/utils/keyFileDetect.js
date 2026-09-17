/** Browser-safe sniff of merchant key / certificate files by content, not extension. */

export const KEY_FILE_ACCEPT = '.pfx,.p12,.pem,.key,.der,.cer,.crt,.txt,.p7b,.p7c'

const PRIVATE_BEGIN = /BEGIN (ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|PRIVATE KEY|OPENSSH PRIVATE KEY)/
const PUBLIC_BEGIN = /BEGIN (CERTIFICATE|PUBLIC KEY|RSA PUBLIC KEY|PKCS7|CMS)/

export function detectKeyMaterial(bytes, filename = '') {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const name = String(filename || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const text = new TextDecoder('utf-8').decode(buf)

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
    }
  }

  const binarySeq = buf.length > 4 && buf[0] === 0x30
  if (ext === 'pfx' || ext === 'p12' || (binarySeq && (ext === '' || ext === 'bin'))) {
    return { kind: 'private', format: 'pkcs12', needsPassword: true, labelKey: 'typePkcs12' }
  }
  if (ext === 'cer' || ext === 'crt' || ext === 'p7b' || ext === 'p7c') {
    return {
      kind: 'public',
      format: binarySeq ? 'der-public' : 'cert-pem',
      needsPassword: false,
      labelKey: ext === 'p7b' || ext === 'p7c' ? 'typePkcs7' : 'typeDerPublic',
    }
  }
  if (binarySeq && ext === 'der') {
    // Small DER is usually an X.509 cert; larger blobs are typically PKCS#12.
    if (buf.length < 3000) {
      return { kind: 'public', format: 'der-public', needsPassword: false, labelKey: 'typeDerPublic' }
    }
    return { kind: 'private', format: 'pkcs12', needsPassword: true, labelKey: 'typePkcs12' }
  }
  if (binarySeq) {
    return { kind: 'private', format: 'pkcs12', needsPassword: true, labelKey: 'typePkcs12' }
  }

  return { kind: 'unknown', format: ext || 'unknown', needsPassword: false, labelKey: 'typeUnknown' }
}

export async function inspectKeyFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer())
  return { file, name: file.name, ...detectKeyMaterial(buf, file.name) }
}

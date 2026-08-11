const PRIVATE_KEY = 'simulator.posStandalone.privateKeyPem'
const PUBLIC_CERT = 'simulator.posStandalone.publicCertPem'

function read(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function write(key, value) {
  try {
    if (value?.trim()) localStorage.setItem(key, value.trim())
    else localStorage.removeItem(key)
  } catch {
    /* quota / private mode */
  }
}

export function loadStoredPrivateKeyPem() {
  return read(PRIVATE_KEY)
}

export function loadStoredPublicCertPem() {
  return read(PUBLIC_CERT)
}

export function saveStoredPrivateKeyPem(pem) {
  write(PRIVATE_KEY, pem)
}

export function saveStoredPublicCertPem(pem) {
  write(PUBLIC_CERT, pem)
}

export function clearStoredKeyPair() {
  write(PRIVATE_KEY, '')
  write(PUBLIC_CERT, '')
}

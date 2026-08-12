import { DEFAULT_AES_KEY, DEFAULT_PLAIN_PAN } from '../config/posStandaloneConfig.js'
import { normalizeAesKeyBase64 } from './aesKey.js'

const PRIVATE_KEY = 'simulator.posStandalone.privateKeyPem'
const PUBLIC_CERT = 'simulator.posStandalone.publicCertPem'
const AES_KEY = 'simulator.posStandalone.aesKey'
const PLAIN_PAN = 'simulator.posStandalone.plainPan'
const FINVIET_SECRET = 'simulator.posStandalone.finvietSecret'

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

export function loadStoredAesKey() {
  const stored = read(AES_KEY)
  if (!stored) return DEFAULT_AES_KEY
  const normalized = normalizeAesKeyBase64(stored)
  if (normalized !== stored.trim()) saveStoredAesKey(normalized)
  return normalized
}

export function saveStoredAesKey(key) {
  write(AES_KEY, key)
}

export function loadStoredPlainPan() {
  return read(PLAIN_PAN) || DEFAULT_PLAIN_PAN
}

export function saveStoredPlainPan(pan) {
  write(PLAIN_PAN, pan)
}

export function loadStoredFinvietSecret() {
  return read(FINVIET_SECRET)
}

export function saveStoredFinvietSecret(secret) {
  write(FINVIET_SECRET, secret)
}

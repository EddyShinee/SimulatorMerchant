import { webcrypto } from 'crypto'

// Must run before @simplewebauthn/server (and jose) use Web Crypto.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

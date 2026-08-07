const STORAGE_KEY = 'sim_vault_unlock_token'

export function getVaultUnlockToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setVaultUnlockToken(token) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearVaultUnlockToken() {
  setVaultUnlockToken('')
}

/** Map vault env (uat|production) → page dropdown value (sandbox|production). */
export function vaultEnvToPageEnv(environment) {
  return environment === 'production' ? 'production' : 'sandbox'
}

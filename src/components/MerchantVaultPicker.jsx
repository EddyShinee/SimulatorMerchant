import { useCallback, useEffect, useMemo, useState } from 'react'
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import {
  clearVaultUnlockToken,
  getVaultUnlockToken,
  pageEnvToVaultEnv,
  setVaultUnlockToken,
} from '../utils/merchantVault.js'

function maskKey(key) {
  const s = String(key || '')
  if (!s) return '—'
  if (s.length <= 8) return '••••••••'
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function emptyForm() {
  return { merchantName: '', mid: '', secretKey: '', environment: 'uat' }
}

/**
 * Password-gated merchant credentials picker next to Merchant ID.
 *
 * Props:
 * - onSelect({ merchantName, mid, secretKey, environment })
 * - currentMid / currentSecretKey / currentPageEnv — dùng để đề xuất lưu MID mới
 * - fillSecretKey — false trên Payment Action (không có SHA key)
 */
export default function MerchantVaultPicker({
  onSelect,
  fillSecretKey = true,
  currentMid = '',
  currentSecretKey = '',
  currentPageEnv = 'sandbox',
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState(null)
  const [unlocked, setUnlocked] = useState(Boolean(getVaultUnlockToken()))
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showKeys, setShowKeys] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')
  const [envFilter, setEnvFilter] = useState(() => pageEnvToVaultEnv(currentPageEnv))
  const [copiedKey, setCopiedKey] = useState('')
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [platformAuth, setPlatformAuth] = useState(false)

  useEffect(() => {
    let active = true
    async function checkPlatform() {
      if (!browserSupportsWebAuthn()) {
        if (active) setPlatformAuth(false)
        return
      }
      try {
        const ok = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        if (active) setPlatformAuth(Boolean(ok))
      } catch {
        if (active) setPlatformAuth(false)
      }
    }
    checkPlatform()
    return () => {
      active = false
    }
  }, [])

  const vaultHeaders = useCallback(() => {
    const token = getVaultUnlockToken()
    return token ? { 'X-Vault-Token': token } : {}
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/api/merchants/vault')
      setConfigured(Boolean(data.configured))
      setBiometricEnabled(Boolean(data.biometricEnabled))
      return data
    } catch (err) {
      setConfigured(false)
      setBiometricEnabled(false)
      setError(err.response?.data?.message || t('merchantVault.loadError'))
      return null
    }
  }, [t])

  const loadItems = useCallback(async () => {
    if (!getVaultUnlockToken()) {
      setUnlocked(false)
      setItems([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/api/merchants', { headers: vaultHeaders() })
      setItems(data.items || [])
      setUnlocked(true)
    } catch (err) {
      if (err.response?.data?.error === 'VAULT_LOCKED') {
        clearVaultUnlockToken()
        setUnlocked(false)
        setItems([])
      } else {
        setError(err.response?.data?.message || t('merchantVault.loadError'))
      }
    } finally {
      setLoading(false)
    }
  }, [t, vaultHeaders])

  useEffect(() => {
    if (!open) return
    setError('')
    setPassword('')
    setConfirmPassword('')
    refreshStatus().then(() => {
      if (getVaultUnlockToken()) loadItems()
    })
  }, [open, refreshStatus, loadItems])

  // Keep items fresh while unlocked even when panel is closed (for suggest badge).
  useEffect(() => {
    if (!getVaultUnlockToken()) return undefined
    loadItems()
    return undefined
  }, [loadItems])

  const trimmedMid = String(currentMid || '').trim()
  const midKnown = useMemo(() => {
    if (!trimmedMid || !items.length) return false
    return items.some((item) => String(item.mid || '').trim() === trimmedMid)
  }, [items, trimmedMid])

  const suggestNew =
    unlocked && configured && trimmedMid.length > 0 && !midKnown && !loading

  useEffect(() => {
    setEnvFilter(pageEnvToVaultEnv(currentPageEnv))
  }, [currentPageEnv])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const tabEnv = envFilter === 'production' ? 'production' : 'uat'
    return items.filter((item) => {
      const env = item.environment === 'production' ? 'production' : 'uat'
      if (env !== tabEnv) return false
      if (!q) return true
      const name = String(item.merchantName || '').toLowerCase()
      const mid = String(item.mid || '').toLowerCase()
      return name.includes(q) || mid.includes(q)
    })
  }, [items, query, envFilter])

  const handleCreateVault = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError(t('merchantVault.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/api/merchants/vault', { password })
      setVaultUnlockToken(data.unlockToken)
      setConfigured(true)
      setUnlocked(true)
      setPassword('')
      setConfirmPassword('')
      await loadItems()
    } catch (err) {
      setError(err.response?.data?.message || t('merchantVault.createError'))
    } finally {
      setLoading(false)
    }
  }

  const handleUnlock = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/merchants/vault/unlock', { password })
      setVaultUnlockToken(data.unlockToken)
      setUnlocked(true)
      setPassword('')
      await loadItems()
      await refreshStatus()
    } catch (err) {
      setError(err.response?.data?.message || t('merchantVault.unlockError'))
    } finally {
      setLoading(false)
    }
  }

  const handleUnlockBiometric = async () => {
    setError('')
    setLoading(true)
    try {
      const { data: opt } = await api.post('/api/merchants/vault/webauthn/auth/options', {})
      const challengeToken = opt?.challengeToken || opt?.challengeId
      if (!opt?.options || !challengeToken) {
        throw new Error('Invalid biometric options from server')
      }
      const assertion = await startAuthentication(opt.options)
      const { data } = await api.post('/api/merchants/vault/webauthn/unlock', {
        response: assertion,
        challengeToken,
        challengeId: challengeToken,
      })
      setVaultUnlockToken(data.unlockToken)
      setUnlocked(true)
      await loadItems()
      await refreshStatus()
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError(t('merchantVault.biometricCancelled'))
      } else {
        setError(err.response?.data?.message || err.message || t('merchantVault.biometricError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleEnableBiometric = async () => {
    setError('')
    setLoading(true)
    try {
      const { data: opt } = await api.post(
        '/api/merchants/vault/webauthn/register/options',
        {},
        { headers: vaultHeaders() }
      )
      const challengeToken = opt?.challengeToken || opt?.challengeId
      if (!opt?.options || !challengeToken) {
        throw new Error(opt?.message || 'Invalid biometric options from server')
      }
      const attestation = await startRegistration(opt.options)
      await api.post(
        '/api/merchants/vault/webauthn/register',
        { response: attestation, challengeToken, challengeId: challengeToken },
        { headers: vaultHeaders() }
      )
      setBiometricEnabled(true)
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError(t('merchantVault.biometricCancelled'))
      } else {
        setError(err.response?.data?.message || err.message || t('merchantVault.biometricRegisterError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveBiometric = async () => {
    if (!window.confirm(t('merchantVault.confirmRemoveBiometric'))) return
    setLoading(true)
    setError('')
    try {
      await api.delete('/api/merchants/vault/webauthn', { headers: vaultHeaders() })
      setBiometricEnabled(false)
    } catch (err) {
      setError(err.response?.data?.message || t('merchantVault.biometricRemoveError'))
    } finally {
      setLoading(false)
    }
  }

  const handleLock = () => {
    clearVaultUnlockToken()
    setUnlocked(false)
    setItems([])
    setShowForm(false)
    setEditingId(null)
    setQuery('')
    setEnvFilter(pageEnvToVaultEnv(currentPageEnv))
  }

  const startAdd = (prefill = null) => {
    setEditingId(null)
    if (prefill) {
      setForm({
        merchantName: prefill.merchantName || '',
        mid: prefill.mid || '',
        secretKey: prefill.secretKey || '',
        environment: prefill.environment === 'production' ? 'production' : 'uat',
      })
    } else {
      setForm({ ...emptyForm(), environment: envFilter === 'production' ? 'production' : 'uat' })
    }
    setShowForm(true)
    setOpen(true)
  }

  const startSuggestSave = () => {
    startAdd({
      merchantName: '',
      mid: trimmedMid,
      secretKey: fillSecretKey ? currentSecretKey || '' : '',
      environment: pageEnvToVaultEnv(currentPageEnv),
    })
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setForm({
      merchantName: item.merchantName || '',
      mid: item.mid || '',
      secretKey: item.secretKey || '',
      environment: item.environment === 'production' ? 'production' : 'uat',
    })
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = {
        merchantName: form.merchantName.trim(),
        mid: form.mid.trim(),
        secretKey: form.secretKey,
        environment: form.environment === 'production' ? 'production' : 'uat',
      }
      if (editingId) {
        await api.put(`/api/merchants/${editingId}`, body, { headers: vaultHeaders() })
      } else {
        await api.post('/api/merchants', body, { headers: vaultHeaders() })
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await loadItems()
    } catch (err) {
      setError(err.response?.data?.message || t('merchantVault.saveError'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('merchantVault.confirmDelete'))) return
    setLoading(true)
    setError('')
    try {
      await api.delete(`/api/merchants/${id}`, { headers: vaultHeaders() })
      await loadItems()
    } catch (err) {
      setError(err.response?.data?.message || t('merchantVault.deleteError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (item) => {
    onSelect?.({
      merchantName: item.merchantName,
      mid: item.mid,
      secretKey: fillSecretKey ? item.secretKey : undefined,
      environment: item.environment === 'production' ? 'production' : 'uat',
    })
    setOpen(false)
  }

  const copyText = async (text, key) => {
    const value = String(text || '')
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const el = document.createElement('textarea')
      el.value = value
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 1200)
  }

  const envBadge = (environment) =>
    environment === 'production' ? (
      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        {t('merchantVault.envProduction')}
      </span>
    ) : (
      <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
        {t('merchantVault.envUat')}
      </span>
    )

  return (
    <div className="relative flex h-full shrink-0 items-stretch gap-1.5 self-stretch">
      <button
        type="button"
        className="btn-secondary relative h-full min-h-[2.625rem] whitespace-nowrap px-3 text-sm"
        onClick={() => setOpen((v) => !v)}
        title={t('merchantVault.open')}
      >
        {t('merchantVault.open')}
        {suggestNew && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
        )}
      </button>
      {suggestNew && (
        <button
          type="button"
          className="hidden h-full min-h-[2.625rem] whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-2 text-xs font-medium text-amber-900 hover:bg-amber-100 sm:inline-flex sm:items-center dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          onClick={startSuggestSave}
        >
          {t('merchantVault.suggestSaveShort')}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-slate-900/40"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex max-h-[min(85vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t('merchantVault.title')}
              </h4>
              <div className="flex items-center gap-2">
                {configured && unlocked && (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    onClick={handleLock}
                  >
                    {t('merchantVault.lock')}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  onClick={() => setOpen(false)}
                  aria-label={t('common.cancel')}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {error && (
                <p className="rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {error}
                </p>
              )}

              {configured === null && (
                <p className="text-xs text-slate-500">{t('common.loading')}</p>
              )}

              {configured === false && (
                <form onSubmit={handleCreateVault} className="space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">{t('merchantVault.createHint')}</p>
                  <div>
                    <label className="label">{t('merchantVault.password')}</label>
                    <input
                      type="password"
                      className="input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label">{t('merchantVault.confirmPassword')}</label>
                    <input
                      type="password"
                      className="input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full text-sm" disabled={loading}>
                    {t('merchantVault.create')}
                  </button>
                </form>
              )}

              {configured && !unlocked && (
                <div className="space-y-3">
                  {platformAuth && biometricEnabled && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className="btn-primary w-full text-sm"
                        disabled={loading}
                        onClick={handleUnlockBiometric}
                      >
                        {t('merchantVault.unlockTouchId')}
                      </button>
                      <p className="text-center text-[11px] text-slate-400">{t('merchantVault.orPassword')}</p>
                    </div>
                  )}
                  <form onSubmit={handleUnlock} className="space-y-2">
                    {!(platformAuth && biometricEnabled) && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">{t('merchantVault.unlockHint')}</p>
                    )}
                    <div>
                      <label className="label">{t('merchantVault.password')}</label>
                      <input
                        type="password"
                        className="input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus={!(platformAuth && biometricEnabled)}
                      />
                    </div>
                    <button type="submit" className="btn-secondary w-full text-sm" disabled={loading}>
                      {t('merchantVault.unlock')}
                    </button>
                  </form>
                  {platformAuth && !biometricEnabled && (
                    <p className="text-[11px] text-slate-500">{t('merchantVault.biometricSetupHint')}</p>
                  )}
                </div>
              )}

              {configured && unlocked && (
                <div className="space-y-3">
                  {platformAuth && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                      {biometricEnabled ? (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">
                            {t('merchantVault.biometricOn')}
                          </p>
                          <button
                            type="button"
                            className="text-[11px] text-rose-600 hover:underline"
                            onClick={handleRemoveBiometric}
                            disabled={loading}
                          >
                            {t('merchantVault.removeTouchId')}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {t('merchantVault.enableTouchIdHint')}
                          </p>
                          <button
                            type="button"
                            className="btn-secondary w-full text-sm"
                            onClick={handleEnableBiometric}
                            disabled={loading}
                          >
                            {t('merchantVault.enableTouchId')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {suggestNew && !showForm && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                      <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                        {t('merchantVault.suggestTitle')}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-amber-800/90 dark:text-amber-200/90">
                        {trimmedMid}
                      </p>
                      <button
                        type="button"
                        className="btn-primary mt-2 w-full text-sm"
                        onClick={startSuggestSave}
                      >
                        {t('merchantVault.suggestSave')}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      className="input min-w-0 flex-1 text-sm"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('merchantVault.searchPlaceholder')}
                    />
                    <button type="button" className="btn-primary shrink-0 px-3 text-sm" onClick={() => startAdd()}>
                      {t('merchantVault.add')}
                    </button>
                  </div>

                  <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                    {[
                      { value: 'uat', label: t('merchantVault.envUat') },
                      { value: 'production', label: t('merchantVault.envProductionShort') },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                          envFilter === opt.value
                            ? opt.value === 'production'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                        onClick={() => setEnvFilter(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {showForm && (
                    <form
                      onSubmit={handleSave}
                      className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 dark:border-indigo-900 dark:bg-indigo-950/20"
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {editingId ? t('merchantVault.edit') : t('merchantVault.add')}
                      </p>
                      <div>
                        <label className="label">{t('merchantVault.merchantName')}</label>
                        <input
                          className="input"
                          value={form.merchantName}
                          onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))}
                          required
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="label">{t('merchantVault.mid')}</label>
                        <input
                          className="input font-mono text-xs"
                          value={form.mid}
                          onChange={(e) => setForm((f) => ({ ...f, mid: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="label">{t('merchantVault.environment')}</label>
                        <select
                          className="input"
                          value={form.environment}
                          onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
                        >
                          <option value="uat">{t('merchantVault.envUat')}</option>
                          <option value="production">{t('merchantVault.envProduction')}</option>
                        </select>
                      </div>
                      {fillSecretKey && (
                        <div>
                          <label className="label">{t('merchantVault.secretKey')}</label>
                          <input
                            className="input font-mono text-xs"
                            value={form.secretKey}
                            onChange={(e) => setForm((f) => ({ ...f, secretKey: e.target.value }))}
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary flex-1 text-sm" disabled={loading}>
                          {t('common.save')}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => {
                            setShowForm(false)
                            setEditingId(null)
                          }}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </form>
                  )}

                  {loading && !items.length ? (
                    <p className="text-xs text-slate-500">{t('common.loading')}</p>
                  ) : items.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('merchantVault.empty')}</p>
                  ) : filteredItems.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('merchantVault.noResults')}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {filteredItems.map((item) => {
                        const midCopyId = `mid-${item.id}`
                        const keyCopyId = `key-${item.id}`
                        const keyVisible = Boolean(showKeys[item.id])
                        return (
                          <li
                            key={item.id}
                            className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/50"
                          >
                            <button
                              type="button"
                              className="w-full min-w-0 text-left"
                              onClick={() => handleSelect(item)}
                            >
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {item.merchantName}
                                </span>
                                {envBadge(item.environment)}
                              </div>
                            </button>

                            <button
                              type="button"
                              className="mt-1 block w-full min-w-0 truncate text-left font-mono text-[11px] text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-300"
                              title={t('merchantVault.clickToCopy')}
                              onClick={(e) => {
                                e.stopPropagation()
                                copyText(item.mid, midCopyId)
                              }}
                            >
                              {copiedKey === midCopyId ? t('common.copied') : item.mid}
                            </button>

                            {fillSecretKey && (
                              <button
                                type="button"
                                className="mt-0.5 block w-full min-w-0 overflow-hidden text-left font-mono text-[11px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-300"
                                title={t('merchantVault.clickToCopy')}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyText(item.secretKey, keyCopyId)
                                }}
                              >
                                <span className="text-slate-400">Key: </span>
                                {copiedKey === keyCopyId ? (
                                  t('common.copied')
                                ) : keyVisible ? (
                                  <span className="inline-block max-w-full break-all">{item.secretKey || '—'}</span>
                                ) : (
                                  maskKey(item.secretKey)
                                )}
                              </button>
                            )}

                            <div
                              className={`mt-2 grid gap-1.5 border-t border-slate-200/80 pt-2 dark:border-slate-700 ${
                                fillSecretKey ? 'grid-cols-3' : 'grid-cols-2'
                              }`}
                            >
                              {fillSecretKey && (
                                <button
                                  type="button"
                                  className="rounded-md border border-slate-300 bg-white px-2 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                                  onClick={() =>
                                    setShowKeys((s) => ({ ...s, [item.id]: !s[item.id] }))
                                  }
                                >
                                  {keyVisible ? t('merchantVault.hideKey') : t('merchantVault.showKey')}
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded-md border border-slate-300 bg-white px-2 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                                onClick={() => startEdit(item)}
                              >
                                {t('merchantVault.edit')}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-center text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"
                                onClick={() => handleDelete(item.id)}
                              >
                                {t('merchantVault.delete')}
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

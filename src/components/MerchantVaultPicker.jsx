import { useCallback, useEffect, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import {
  clearVaultUnlockToken,
  getVaultUnlockToken,
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
 * Password-gated merchant credentials picker, placed next to Merchant ID.
 * onSelect({ merchantName, mid, secretKey, environment })
 */
export default function MerchantVaultPicker({ onSelect, fillSecretKey = true }) {
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

  const vaultHeaders = useCallback(() => {
    const token = getVaultUnlockToken()
    return token ? { 'X-Vault-Token': token } : {}
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/api/merchants/vault')
      setConfigured(Boolean(data.configured))
    } catch (err) {
      setConfigured(false)
      setError(err.response?.data?.message || t('merchantVault.loadError'))
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
    } catch (err) {
      setError(err.response?.data?.message || t('merchantVault.unlockError'))
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
  }

  const startAdd = () => {
    setEditingId(null)
    setForm(emptyForm())
    setShowForm(true)
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

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="btn-secondary whitespace-nowrap px-3 py-2 text-sm"
        onClick={() => setOpen((v) => !v)}
        title={t('merchantVault.open')}
      >
        {t('merchantVault.open')}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:w-96">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t('merchantVault.title')}
              </h4>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>

            {error && (
              <p className="mb-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
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
              <form onSubmit={handleUnlock} className="space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-300">{t('merchantVault.unlockHint')}</p>
                <div>
                  <label className="label">{t('merchantVault.password')}</label>
                  <input
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary w-full text-sm" disabled={loading}>
                  {t('merchantVault.unlock')}
                </button>
              </form>
            )}

            {configured && unlocked && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">{t('merchantVault.unlocked')}</p>
                  <div className="flex gap-2">
                    <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={startAdd}>
                      {t('merchantVault.add')}
                    </button>
                    <button type="button" className="text-xs text-slate-500 hover:underline" onClick={handleLock}>
                      {t('merchantVault.lock')}
                    </button>
                  </div>
                </div>

                {showForm && (
                  <form onSubmit={handleSave} className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    <div>
                      <label className="label">{t('merchantVault.merchantName')}</label>
                      <input
                        className="input"
                        value={form.merchantName}
                        onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))}
                        required
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
                ) : (
                  <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => handleSelect(item)}
                        >
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {item.merchantName}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {item.environment === 'production'
                              ? t('merchantVault.envProduction')
                              : t('merchantVault.envUat')}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                            MID: {item.mid}
                          </div>
                          {fillSecretKey && (
                            <div className="mt-0.5 font-mono text-xs text-slate-500">
                              Key:{' '}
                              {showKeys[item.id] ? item.secretKey || '—' : maskKey(item.secretKey)}
                            </div>
                          )}
                        </button>
                        <div className="mt-1.5 flex flex-wrap gap-2 border-t border-slate-200 pt-1.5 dark:border-slate-700">
                          <button
                            type="button"
                            className="text-xs text-indigo-600 hover:underline"
                            onClick={() => handleSelect(item)}
                          >
                            {t('merchantVault.use')}
                          </button>
                          {fillSecretKey && (
                            <button
                              type="button"
                              className="text-xs text-slate-500 hover:underline"
                              onClick={() =>
                                setShowKeys((s) => ({ ...s, [item.id]: !s[item.id] }))
                              }
                            >
                              {showKeys[item.id] ? t('merchantVault.hideKey') : t('merchantVault.showKey')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-xs text-slate-500 hover:underline"
                            onClick={() => startEdit(item)}
                          >
                            {t('merchantVault.edit')}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-rose-600 hover:underline"
                            onClick={() => handleDelete(item.id)}
                          >
                            {t('merchantVault.delete')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

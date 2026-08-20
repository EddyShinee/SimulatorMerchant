import { useCallback, useEffect, useState } from 'react'
import api from '../api/client.js'
import { useAccess } from '../context/AccessContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ROLES, normalizeFeatureEntry } from '../config/accessControl.js'

export default function AccessControl({ embedded = false }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { catalog, features, setFeatures, refresh } = useAccess()
  const [tab, setTab] = useState('features')
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [savingUser, setSavingUser] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    setError('')
    try {
      const { data } = await api.get('/api/access/users')
      setUsers(data.users || [])
    } catch (err) {
      setError(err.response?.data?.message || t('access.loadUsersError'))
    } finally {
      setLoadingUsers(false)
    }
  }, [t])

  useEffect(() => {
    if (tab === 'members') void loadUsers()
  }, [tab, loadUsers])

  const toggleFeature = async (key, role, enabled) => {
    setSavingKey(`${key}:${role}`)
    setError('')
    setMessage('')
    try {
      const { data } = await api.patch(`/api/access/features/${encodeURIComponent(key)}`, {
        key,
        role,
        enabled,
      })
      setFeatures(data.features)
      setMessage(t('access.featureSaved'))
      await refresh()
    } catch (err) {
      setError(err.response?.data?.message || t('access.saveError'))
    } finally {
      setSavingKey('')
    }
  }

  const changeRole = async (userId, nextRole) => {
    setSavingUser(userId)
    setError('')
    setMessage('')
    try {
      await api.patch(`/api/access/users/${encodeURIComponent(userId)}/role`, { role: nextRole })
      setMessage(t('access.roleSaved'))
      await loadUsers()
      await refresh()
    } catch (err) {
      setError(err.response?.data?.message || t('access.saveError'))
    } finally {
      setSavingUser('')
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="page-title">{t('access.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('access.subtitle')}</p>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        {[
          ['features', t('access.tabFeatures')],
          ['members', t('access.tabMembers')],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
              tab === id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {tab === 'features' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('access.featuresHint')}</p>
          {catalog.map((group) => (
            <div key={group.id} className="card overflow-hidden">
              <div className="hidden items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:grid md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem]">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t(group.labelKey)}</h2>
                <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t('access.roleAdmin')}
                </span>
                <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t('access.roleMember')}
                </span>
              </div>
              <div className="border-b border-slate-100 px-4 py-2 md:hidden dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t(group.labelKey)}</h2>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.features.map((f) => {
                  const flags = normalizeFeatureEntry(features[f.key])
                  const locked = Boolean(f.locked)
                  return (
                    <li
                      key={f.key}
                      className="flex flex-col gap-3 px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] md:items-center md:gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t(f.labelKey)}</p>
                        <p className="font-mono text-[11px] text-slate-400">{f.key}</p>
                      </div>
                      <div className="flex items-center justify-between gap-4 md:contents">
                        {[ROLES.admin, ROLES.member].map((role) => {
                          const on = flags[role] !== false
                          const busy = savingKey === `${f.key}:${role}`
                          const roleLabel = role === ROLES.admin ? t('access.roleAdmin') : t('access.roleMember')
                          return (
                            <div key={role} className="flex flex-1 items-center justify-between gap-3 md:justify-center">
                              <span className="text-xs font-medium text-slate-500 md:hidden">{roleLabel}</span>
                              <button
                                type="button"
                                disabled={locked || busy}
                                onClick={() => void toggleFeature(f.key, role, !on)}
                                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                                  on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
                                } ${locked || busy ? 'cursor-not-allowed opacity-60' : ''}`}
                                aria-pressed={on}
                                aria-label={`${roleLabel}: ${on ? 'on' : 'off'}`}
                                title={locked ? t('access.featureLocked') : ''}
                              >
                                <span
                                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                                    on ? 'left-5' : 'left-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'members' && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('access.membersTitle')}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t('access.membersHint')}</p>
          </div>
          {loadingUsers ? (
            <p className="px-4 py-8 text-sm text-slate-400">{t('common.loading')}</p>
          ) : (
            <div className="table-scroll">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t('common.email')}</th>
                    <th className="px-4 py-2 font-semibold">{t('access.role')}</th>
                    <th className="px-4 py-2 font-semibold">{t('access.you')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          className="input !w-auto !py-1.5 text-xs"
                          value={u.role}
                          disabled={savingUser === u.id}
                          onChange={(e) => void changeRole(u.id, e.target.value)}
                        >
                          <option value={ROLES.admin}>{t('access.roleAdmin')}</option>
                          <option value={ROLES.member}>{t('access.roleMember')}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {u.id === user?.id || u.email === user?.email ? t('access.youBadge') : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client.js'
import { useAccess } from '../context/AccessContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ROLES } from '../config/accessControl.js'

function formatDate(value, locale) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function RoleBadge({ role, t }) {
  const isAdmin = role === ROLES.admin
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
        isAdmin
          ? 'bg-brand-100 text-brand-800 dark:bg-brand-950/50 dark:text-brand-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {isAdmin ? t('access.roleAdmin') : t('access.roleMember')}
    </span>
  )
}

function StatCard({ label, value, tone = 'default' }) {
  const toneClass =
    tone === 'brand'
      ? 'border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/30'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}

export default function MemberManagement() {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const { refresh } = useAccess()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingUser, setSavingUser] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/api/access/users')
      setUsers(data.users || [])
    } catch (err) {
      setError(err.response?.data?.message || t('members.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.role === ROLES.admin).length
    return {
      total: users.length,
      admins,
      members: users.length - admins,
    }
  }, [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return String(u.email || '').toLowerCase().includes(q)
    })
  }, [users, query, roleFilter])

  const changeRole = async (userId, nextRole, currentRole) => {
    if (nextRole === currentRole) return
    if (userId === user?.id && nextRole === ROLES.member) {
      const ok = window.confirm(t('members.confirmDemoteSelf'))
      if (!ok) return
    }
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{t('members.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('members.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" disabled={loading} onClick={() => void loadUsers()}>
            {loading ? t('common.loading') : t('members.refresh')}
          </button>
          <Link to="/app/settings/access" className="btn-secondary text-sm">
            {t('members.manageFeatures')}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t('members.statTotal')} value={stats.total} tone="brand" />
        <StatCard label={t('members.statAdmins')} value={stats.admins} />
        <StatCard label={t('members.statMembers')} value={stats.members} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {message}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <label className="label" htmlFor="member-search">
                {t('members.searchLabel')}
              </label>
              <input
                id="member-search"
                type="search"
                className="input font-mono text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('members.searchPlaceholder')}
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="label" htmlFor="member-role-filter">
                {t('members.filterRole')}
              </label>
              <select
                id="member-role-filter"
                className="input text-sm"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">{t('members.filterAll')}</option>
                <option value={ROLES.admin}>{t('access.roleAdmin')}</option>
                <option value={ROLES.member}>{t('access.roleMember')}</option>
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t('members.resultCount', { count: filtered.length, total: users.length })}
          </p>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">{t('members.empty')}</p>
        ) : (
          <>
            <div className="hidden md:block">
              <div className="table-scroll">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">{t('common.email')}</th>
                      <th className="px-4 py-2.5 font-semibold">{t('access.role')}</th>
                      <th className="px-4 py-2.5 font-semibold">{t('members.createdAt')}</th>
                      <th className="px-4 py-2.5 font-semibold">{t('members.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((u) => {
                      const isSelf = u.id === user?.id || u.email === user?.email
                      return (
                        <tr key={u.id}>
                          <td className="px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                                {u.email}
                              </span>
                              {isSelf && (
                                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                                  {t('access.youBadge')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <RoleBadge role={u.role} t={t} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(u.createdAt, lang)}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="input !w-auto !py-1.5 text-xs"
                              value={u.role}
                              disabled={savingUser === u.id}
                              onChange={(e) => void changeRole(u.id, e.target.value, u.role)}
                            >
                              <option value={ROLES.admin}>{t('access.roleAdmin')}</option>
                              <option value={ROLES.member}>{t('access.roleMember')}</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <ul className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              {filtered.map((u) => {
                const isSelf = u.id === user?.id || u.email === user?.email
                return (
                  <li key={u.id} className="space-y-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-xs text-slate-800 dark:text-slate-100">{u.email}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {t('members.createdAt')}: {formatDate(u.createdAt, lang)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <RoleBadge role={u.role} t={t} />
                        {isSelf && (
                          <span className="text-[10px] font-bold uppercase text-slate-400">{t('access.youBadge')}</span>
                        )}
                      </div>
                    </div>
                    <select
                      className="input text-xs"
                      value={u.role}
                      disabled={savingUser === u.id}
                      onChange={(e) => void changeRole(u.id, e.target.value, u.role)}
                    >
                      <option value={ROLES.admin}>{t('access.roleAdmin')}</option>
                      <option value={ROLES.member}>{t('access.roleMember')}</option>
                    </select>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">{t('members.footerHint')}</p>
    </div>
  )
}

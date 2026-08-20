import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client.js'
import { useAccess } from '../context/AccessContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ROLES, USER_STATUS } from '../config/accessControl.js'

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

function StatusBadge({ status, t }) {
  const blocked = status === USER_STATUS.blocked
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
        blocked
          ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      }`}
    >
      {blocked ? t('members.statusBlocked') : t('members.statusActive')}
    </span>
  )
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
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newConfirm, setNewConfirm] = useState('')
  const [newRole, setNewRole] = useState(ROLES.member)
  const [creating, setCreating] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)
  const [passwordFormError, setPasswordFormError] = useState('')

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

  const changeStatus = async (member, nextStatus) => {
    if (member.status === nextStatus) return
    const isSelf = member.id === user?.id || member.email === user?.email
    if (isSelf && nextStatus === USER_STATUS.blocked) {
      setError(t('members.cannotBlockSelf'))
      return
    }
    if (nextStatus === USER_STATUS.blocked && !window.confirm(t('members.confirmBlock', { email: member.email }))) {
      return
    }
    setSavingUser(member.id)
    setError('')
    setMessage('')
    try {
      await api.patch(`/api/access/users/${encodeURIComponent(member.id)}/status`, { status: nextStatus })
      setMessage(t('members.statusSaved'))
      await loadUsers()
    } catch (err) {
      setError(err.response?.data?.message || t('access.saveError'))
    } finally {
      setSavingUser('')
    }
  }

  const openResetPassword = (member) => {
    setError('')
    setMessage('')
    setPasswordFormError('')
    setPasswordTarget(member)
    setResetPassword('')
    setResetConfirm('')
  }

  const submitResetPassword = async (e) => {
    e.preventDefault()
    if (!passwordTarget) return
    if (resetPassword.length < 6) {
      setPasswordFormError(t('auth.passwordTooShort'))
      return
    }
    if (resetPassword !== resetConfirm) {
      setPasswordFormError(t('auth.passwordMismatch'))
      return
    }
    setResetting(true)
    setPasswordFormError('')
    try {
      await api.patch(`/api/access/users/${encodeURIComponent(passwordTarget.id)}/password`, {
        password: resetPassword,
      })
      setMessage(t('members.passwordSaved', { email: passwordTarget.email }))
      setPasswordTarget(null)
      setResetPassword('')
      setResetConfirm('')
      await loadUsers()
    } catch (err) {
      setPasswordFormError(err.response?.data?.message || t('members.passwordError'))
    } finally {
      setResetting(false)
    }
  }

  const createAccount = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (newPassword.length < 6) {
      setError(t('auth.passwordTooShort'))
      return
    }
    if (newPassword !== newConfirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setCreating(true)
    try {
      const { data } = await api.post('/api/access/users', {
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      setNewEmail('')
      setNewPassword('')
      setNewConfirm('')
      setNewRole(ROLES.member)
      setShowAdd(false)
      setMessage(t('members.addAccountSuccess', { email: data?.user?.email || newEmail.trim() }))
      await loadUsers()
    } catch (err) {
      setError(err.response?.data?.message || t('members.addAccountError'))
    } finally {
      setCreating(false)
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
          <button type="button" className="btn-primary text-sm" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? t('members.addAccountHide') : `+ ${t('members.addAccount')}`}
          </button>
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

      {showAdd && (
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('members.addAccount')}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('members.addAccountHint')}</p>
          </div>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createAccount}>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="new-member-email">
                {t('common.email')}
              </label>
              <input
                id="new-member-email"
                className="input font-mono text-sm"
                type="email"
                autoComplete="off"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t('members.searchPlaceholder')}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new-member-password">
                {t('common.password')}
              </label>
              <input
                id="new-member-password"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder={t('auth.passwordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-member-confirm">
                {t('common.confirmPassword')}
              </label>
              <input
                id="new-member-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={newConfirm}
                onChange={(e) => setNewConfirm(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-member-role">
                {t('access.role')}
              </label>
              <select
                id="new-member-role"
                className="input text-sm"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              >
                <option value={ROLES.member}>{t('access.roleMember')}</option>
                <option value={ROLES.admin}>{t('access.roleAdmin')}</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary text-sm" disabled={creating}>
                {creating ? t('common.loading') : t('members.addAccount')}
              </button>
            </div>
          </form>
        </section>
      )}

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
                      <th className="px-4 py-2.5 font-semibold">{t('members.status')}</th>
                      <th className="px-4 py-2.5 font-semibold">{t('members.lastLogin')}</th>
                      <th className="px-4 py-2.5 font-semibold">{t('members.lastUpdated')}</th>
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
                          <td className="px-4 py-3">
                            <StatusBadge status={u.status} t={t} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(u.lastLoginAt, lang)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(u.updatedAt, lang)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(u.createdAt, lang)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className="input !w-auto !py-1.5 text-xs"
                                value={u.role}
                                disabled={savingUser === u.id}
                                onChange={(e) => void changeRole(u.id, e.target.value, u.role)}
                              >
                                <option value={ROLES.admin}>{t('access.roleAdmin')}</option>
                                <option value={ROLES.member}>{t('access.roleMember')}</option>
                              </select>
                              <button
                                type="button"
                                className="btn-secondary !px-2.5 !py-1.5 text-xs"
                                disabled={savingUser === u.id}
                                onClick={() => openResetPassword(u)}
                              >
                                {t('members.setPassword')}
                              </button>
                              <button
                                type="button"
                                className={`btn-secondary !px-2.5 !py-1.5 text-xs ${
                                  u.status === USER_STATUS.blocked
                                    ? ''
                                    : 'text-red-600 dark:text-red-400'
                                }`}
                                disabled={savingUser === u.id || isSelf}
                                onClick={() =>
                                  void changeStatus(
                                    u,
                                    u.status === USER_STATUS.blocked ? USER_STATUS.active : USER_STATUS.blocked
                                  )
                                }
                              >
                                {u.status === USER_STATUS.blocked ? t('members.unblock') : t('members.block')}
                              </button>
                            </div>
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
                          {t('members.lastLogin')}: {formatDate(u.lastLoginAt, lang)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {t('members.lastUpdated')}: {formatDate(u.updatedAt, lang)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {t('members.createdAt')}: {formatDate(u.createdAt, lang)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <RoleBadge role={u.role} t={t} />
                        <StatusBadge status={u.status} t={t} />
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
                    <button
                      type="button"
                      className="btn-secondary w-full text-xs"
                      disabled={savingUser === u.id}
                      onClick={() => openResetPassword(u)}
                    >
                      {t('members.setPassword')}
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary w-full text-xs ${
                        u.status === USER_STATUS.blocked ? '' : 'text-red-600 dark:text-red-400'
                      }`}
                      disabled={savingUser === u.id || isSelf}
                      onClick={() =>
                        void changeStatus(
                          u,
                          u.status === USER_STATUS.blocked ? USER_STATUS.active : USER_STATUS.blocked
                        )
                      }
                    >
                      {u.status === USER_STATUS.blocked ? t('members.unblock') : t('members.block')}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">{t('members.footerHint')}</p>

      {passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="card w-full max-w-md space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t('members.setPassword')}
              </h2>
              <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{passwordTarget.email}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('members.setPasswordHint')}</p>
            </div>
            <form className="grid gap-3" onSubmit={submitResetPassword}>
              <div>
                <label className="label" htmlFor="admin-reset-password">
                  {t('settings.newPassword')}
                </label>
                <input
                  id="admin-reset-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="label" htmlFor="admin-reset-confirm">
                  {t('common.confirmPassword')}
                </label>
                <input
                  id="admin-reset-confirm"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {passwordFormError && (
                <p className="text-sm text-red-600 dark:text-red-400">{passwordFormError}</p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={resetting}
                  onClick={() => setPasswordTarget(null)}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary text-sm" disabled={resetting}>
                  {resetting ? t('common.loading') : t('members.updatePassword')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

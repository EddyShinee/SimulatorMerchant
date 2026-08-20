import { useState } from 'react'
import api from '../api/client.js'
import { useAccess } from '../context/AccessContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { ROLES, normalizeFeatureEntry } from '../config/accessControl.js'

export default function AccessControl({ embedded = false }) {
  const { t } = useLanguage()
  const { catalog, features, setFeatures, refresh } = useAccess()
  const [savingKey, setSavingKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="page-title">{t('access.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('access.subtitle')}</p>
        </div>
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
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAccess } from '../context/AccessContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { IconLogout, IconSettings } from './icons.jsx'

export default function AccountMenu() {
  const { user, logout } = useAuth()
  const { isAdmin } = useAccess()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const roleLabel = isAdmin ? t('access.roleAdmin') : t('access.roleMember')
  const initial = String(user?.email || '?').trim().charAt(0).toUpperCase() || '?'

  const goSettings = () => {
    setOpen(false)
    navigate('/app/settings')
  }

  const handleLogout = () => {
    setOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[14rem] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 sm:max-w-[18rem]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {initial}
        </span>
        <span className="min-w-0 hidden sm:block">
          <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100" title={user?.email}>
            {user?.email}
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            {roleLabel}
          </span>
        </span>
        <svg
          className={`ml-0.5 hidden h-4 w-4 shrink-0 text-slate-400 transition sm:block ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 px-3.5 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={user?.email}>
              {user?.email}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              {roleLabel}
            </p>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={goSettings}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <IconSettings className="h-4 w-4 shrink-0" />
              {t('nav.settings')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <IconLogout className="h-4 w-4 shrink-0" />
              {t('common.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { API_CATALOG } from '../config/apis.js'
import {
  IconApi,
  IconDashboard,
  IconInbox,
  IconLogout,
  IconMenu,
  IconClose,
} from '../components/icons.jsx'

function NavItem({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

// Radio-style menu item used for the "Choose API" group.
function ApiRadioItem({ to, label, onClick }) {
  return (
    <NavLink to={to} onClick={onClick} className="group block">
      {({ isActive }) => (
        <span
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${
              isActive
                ? 'border-brand-600'
                : 'border-slate-300 group-hover:border-slate-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full bg-brand-600 transition ${
                isActive ? 'scale-100' : 'scale-0'
              }`}
            />
          </span>
          <span>{label}</span>
        </span>
      )}
    </NavLink>
  )
}

export default function SimulatorLayout() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const closeMobile = () => setMobileOpen(false)

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <IconApi className="h-5 w-5" />
        </div>
        <span className="text-base font-bold text-slate-900">{t('appName')}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('nav.sectionMain')}
        </p>
        <NavItem to="/app" icon={IconDashboard} label={t('nav.dashboard')} onClick={closeMobile} />

        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('apis.choose')}
        </p>
        <div className="space-y-0.5">
          {API_CATALOG.map((api) => (
            <ApiRadioItem
              key={api.id}
              to={`/app/api/${api.id}`}
              label={t(api.nameKey)}
              onClick={closeMobile}
            />
          ))}
        </div>

        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('nav.sectionTools')}
        </p>
        <NavItem
          to="/app/inbox"
          icon={IconInbox}
          label={t('nav.requestInbox')}
          onClick={closeMobile}
        />
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 truncate px-3 py-1 text-xs text-slate-500" title={user?.email}>
          {user?.email}
        </div>
        <button onClick={handleLogout} className="btn-secondary w-full">
          <IconLogout className="h-4 w-4" />
          {t('common.logout')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeMobile}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <button
              onClick={closeMobile}
              className="absolute right-3 top-4 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close menu"
            >
              <IconClose className="h-5 w-5" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="hidden text-sm font-medium text-slate-500 lg:block">
            {t('appName')}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-screen-2xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

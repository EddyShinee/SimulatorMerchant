import { NavLink, Outlet } from 'react-router-dom'
import { useAccess } from '../context/AccessContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function Settings() {
  const { t } = useLanguage()
  const { isAdmin } = useAccess()

  const tabs = [
    { to: '/app/settings/account', label: t('settings.account') },
    { to: '/app/settings/password', label: t('settings.password') },
    { to: '/app/settings/biometric', label: t('settings.biometric') },
    ...(isAdmin ? [{ to: '/app/settings/access', label: t('nav.accessControl') }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.subtitle')}</p>
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label={t('settings.title')}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}

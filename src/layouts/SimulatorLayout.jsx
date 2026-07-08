import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { API_CATALOG } from '../config/apis.js'
import { isPaymentFlowRoute } from '../config/paymentFlowWizard.js'
import {
  IconApi,
  IconDashboard,
  IconFlow,
  IconInbox,
  IconLogout,
  IconMenu,
  IconClose,
  IconPayout,
} from '../components/icons.jsx'
import { AppBrandSidebar } from '../components/AppBrand.jsx'
import { PaymentFlowProvider } from '../context/PaymentFlowContext.jsx'
import { useInboxUnread } from '../hooks/useInboxUnread.js'

function NavItem({ to, icon: Icon, label, badge, onClick, end = true }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

function ApiRadioItem({ to, label, onClick }) {
  return (
    <NavLink to={to} onClick={onClick} className="group block">
      {({ isActive }) => (
        <span
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive
              ? 'text-brand-700 dark:text-brand-300'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${
              isActive
                ? 'border-brand-600 dark:border-brand-400'
                : 'border-slate-300 group-hover:border-slate-400 dark:border-slate-600'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full bg-brand-600 transition dark:bg-brand-400 ${
                isActive ? 'scale-100' : 'scale-0'
              }`}
            />
          </span>
          <span className="min-w-0 truncate">{label}</span>
        </span>
      )}
    </NavLink>
  )
}

function usePageTitle(pathname, t) {
  if (pathname === '/app' || pathname === '/app/') return t('nav.dashboard')
  if (isPaymentFlowRoute(pathname)) return t('nav.paymentFlow')
  if (pathname.includes('/inbox')) return t('nav.requestInbox')
  if (pathname.includes('/pos-standalone')) return t('nav.posStandalone')
  if (pathname.includes('/payout/inquiry')) return t('nav.payoutInquiry')
  if (pathname.includes('/payout/create')) return t('nav.payoutCreate')
  const apiMatch = pathname.match(/\/app\/api\/([^/]+)/)
  if (apiMatch) {
    const api = API_CATALOG.find((a) => a.id === apiMatch[1])
    if (api) return t(api.nameKey)
  }
  return t('appName')
}

export default function SimulatorLayout() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { unread: inboxUnread } = useInboxUnread()
  const pageTitle = usePageTitle(location.pathname, t)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const closeMobile = () => setMobileOpen(false)

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <AppBrandSidebar />

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('nav.sectionMain')}
        </p>
        <NavItem to="/app" icon={IconDashboard} label={t('nav.dashboard')} onClick={closeMobile} />

        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('nav.sectionPaymentFlow')}
        </p>
        <NavItem
          to="/app/payment-flow"
          icon={IconFlow}
          label={t('nav.paymentFlow')}
          onClick={closeMobile}
          end={false}
        />

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
          {t('nav.sectionPayout')}
        </p>
        <NavItem
          to="/app/payout/create"
          icon={IconPayout}
          label={t('nav.payoutCreate')}
          onClick={closeMobile}
        />
        <NavItem
          to="/app/payout/inquiry"
          icon={IconPayout}
          label={t('nav.payoutInquiry')}
          onClick={closeMobile}
        />

        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('nav.sectionPosStandalone')}
        </p>
        <NavItem
          to="/app/pos-standalone"
          icon={IconApi}
          label={t('nav.posStandalone')}
          onClick={closeMobile}
        />

        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('nav.sectionTools')}
        </p>
        <NavItem
          to="/app/inbox"
          icon={IconInbox}
          label={t('nav.requestInbox')}
          badge={inboxUnread}
          onClick={closeMobile}
        />
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div
          className="mb-2 truncate px-3 py-1 text-xs text-slate-500 dark:text-slate-400"
          title={user?.email}
        >
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
    <PaymentFlowProvider>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
          {SidebarContent}
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={closeMobile}
              aria-hidden
            />
            <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl dark:bg-slate-900">
              <button
                onClick={closeMobile}
                className="absolute right-3 top-4 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close menu"
              >
                <IconClose className="h-5 w-5" />
              </button>
              {SidebarContent}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="hidden min-w-0 truncate text-sm font-medium text-slate-600 dark:text-slate-300 lg:block">
              {pageTitle}
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
    </PaymentFlowProvider>
  )
}

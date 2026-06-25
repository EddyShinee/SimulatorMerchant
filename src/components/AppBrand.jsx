import { useLanguage } from '../context/LanguageContext.jsx'
import { APP_VERSION } from '../config/appVersion.js'
import { IconApi } from './icons.jsx'

function VersionLabel({ className = '' }) {
  return (
    <span className={`font-mono text-[10px] font-medium tracking-wide text-slate-400 ${className}`}>
      v{APP_VERSION}
    </span>
  )
}

/** Sidebar logo + app name + version */
export function AppBrandSidebar() {
  const { t } = useLanguage()

  return (
    <div className="px-5 py-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <IconApi className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{t('appName')}</div>
          <VersionLabel />
        </div>
      </div>
    </div>
  )
}

/** Centered logo block for login / register */
export function AppBrandCentered() {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
        <IconApi className="h-7 w-7" />
      </div>
      <VersionLabel className="text-xs" />
    </div>
  )
}

/** Compact header row for public pages */
export function AppBrandHeader() {
  const { t } = useLanguage()

  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t('appName')}</span>
      <VersionLabel />
    </div>
  )
}

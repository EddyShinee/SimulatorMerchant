import { useAuth } from '../../context/AuthContext.jsx'
import { useAccess } from '../../context/AccessContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

export default function AccountSettings() {
  const { user } = useAuth()
  const { isAdmin } = useAccess()
  const { t } = useLanguage()

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('settings.account')}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('settings.accountHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('common.email')}</p>
          <p className="mt-1 break-all font-mono text-sm text-slate-800 dark:text-slate-100">{user?.email}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('access.role')}</p>
          <p className="mt-1 text-sm font-semibold text-brand-600 dark:text-brand-400">
            {isAdmin ? t('access.roleAdmin') : t('access.roleMember')}
          </p>
        </div>
      </div>
    </section>
  )
}

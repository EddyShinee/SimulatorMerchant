import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getApiOrigin } from '../api/client.js'
import CopyButton from '../components/CopyButton.jsx'
import { IconApi, IconInbox } from '../components/icons.jsx'

function FeatureCard({ to, icon: Icon, title, desc, cta }) {
  return (
    <Link
      to={to}
      className="card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{desc}</p>
      </div>
      <span className="mt-auto text-sm font-semibold text-brand-600 group-hover:text-brand-700">
        {cta} →
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const webhookUrl = `${getApiOrigin()}/api/simulator/hook`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('dashboard.title')}</h1>
        <p className="mt-1 text-slate-500">{t('dashboard.subtitle')}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 p-6 text-white shadow-sm">
        <p className="text-sm text-brand-100">{t('dashboard.welcomeBack')}</p>
        <p className="mt-0.5 text-xl font-bold">{user?.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          to="/app/api/payment-token"
          icon={IconApi}
          title={t('dashboard.cardApiTitle')}
          desc={t('dashboard.cardApiDesc')}
          cta={t('dashboard.open')}
        />
        <FeatureCard
          to="/app/inbox"
          icon={IconInbox}
          title={t('dashboard.cardInboxTitle')}
          desc={t('dashboard.cardInboxDesc')}
          cta={t('dashboard.open')}
        />
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-900">{t('dashboard.webhookTitle')}</h3>
        <p className="mt-1 text-sm text-slate-500">{t('dashboard.webhookDesc')}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3.5 py-2.5 font-mono text-sm text-brand-200">
            {webhookUrl}
          </code>
          <CopyButton text={webhookUrl} />
        </div>
      </div>
    </div>
  )
}

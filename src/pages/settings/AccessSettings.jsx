import { useLanguage } from '../../context/LanguageContext.jsx'
import AccessControl from '../AccessControl.jsx'

export default function AccessSettings() {
  const { t } = useLanguage()

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('access.subtitle')}</p>
      <AccessControl embedded />
    </div>
  )
}

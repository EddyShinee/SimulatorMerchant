import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function PaymentCategoryPicker({ categories, selected, onSelect }) {
  const { t } = useLanguage()

  if (!categories?.length) return null

  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          📋 {t('paymentOptions.channelPickerTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {t('paymentOptions.channelPickerHint')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2 font-semibold">{t('paymentOptions.colCategory')}</th>
              <th className="px-4 py-2 font-semibold">{t('paymentOptions.colGroup')}</th>
              <th className="px-4 py-2 font-semibold">{t('paymentOptions.colName')}</th>
              <th className="px-4 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {categories.map((row) => {
              const key = `${row.categoryCode}:${row.groupCode}`
              const isActive =
                selected?.categoryCode === row.categoryCode && selected?.groupCode === row.groupCode
              return (
                <tr
                  key={key}
                  className={isActive ? 'bg-brand-50/60 dark:bg-brand-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{row.categoryCode}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{row.groupCode}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {row.iconUrl && (
                        <img src={row.iconUrl} alt="" className="h-5 w-5 object-contain" />
                      )}
                      <span>{row.groupName || row.categoryName}</span>
                      {row.isDefault && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          {t('paymentOptions.defaultBadge')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(row)}
                        className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        {t('paymentOptions.useForDetails')}
                      </button>
                      <Link
                        to="/app/api/payment-option-details"
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {t('paymentOptions.openDetails')}
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

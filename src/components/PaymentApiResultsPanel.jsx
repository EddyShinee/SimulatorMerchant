import { useEffect, useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import CopyButton from './CopyButton.jsx'

function CollapsibleJsonCard({ title, text, mono, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 text-left dark:bg-slate-800/60"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</span>
        <span className="text-xs text-slate-400">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 flex justify-end">
            <CopyButton text={text} />
          </div>
          <pre
            className={`max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 ${
              mono ? 'break-all whitespace-pre-wrap' : ''
            }`}
          >
            {text}
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * Tabbed results: Channels (picker) vs Raw JSON (collapsed request/response).
 */
export default function PaymentApiResultsPanel({
  hasResult,
  hasChannels,
  statusBadges,
  channelsContent,
  requestTitle,
  responseTitle,
  requestText,
  responseText,
  channelsTabLabel,
  footerContent,
}) {
  const { t } = useLanguage()
  const [tab, setTab] = useState(hasChannels ? 'channels' : 'raw')
  const channelsLabel = channelsTabLabel || t('paymentApiResults.tabChannels')

  useEffect(() => {
    if (hasChannels) setTab('channels')
    else if (hasResult) setTab('raw')
  }, [hasChannels, hasResult])

  if (!hasResult && !hasChannels) {
    return (
      <div className="card p-8 text-center text-sm text-slate-400 dark:text-slate-500">
        {t('paymentToken.noResult')}
      </div>
    )
  }

  const tabs = [
    hasChannels && { id: 'channels', label: channelsLabel },
    hasResult && { id: 'raw', label: t('paymentApiResults.tabRaw') },
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      {statusBadges}

      {tabs.length > 1 && (
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${
                tab === item.id
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'channels' && hasChannels && <div className="space-y-4">{channelsContent}</div>}

      {tab === 'raw' && hasResult && (
        <div className="space-y-3">
          {requestText != null && (
            <CollapsibleJsonCard title={requestTitle} text={requestText} defaultOpen={false} />
          )}
          {responseText != null && (
            <CollapsibleJsonCard title={responseTitle} text={responseText} mono defaultOpen={false} />
          )}
          {footerContent}
        </div>
      )}
    </div>
  )
}

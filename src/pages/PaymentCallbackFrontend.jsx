import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import { AppBrandHeader } from '../components/AppBrand.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import CopyButton from '../components/CopyButton.jsx'
import {
  decodeCallbackDisplayToken,
  paymentResponseStatus,
  statusTheme,
} from '../utils/paymentResponse.js'

function DetailRow({ label, value, mono }) {
  if (value == null || value === '') return null
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span
        className={`break-all text-sm text-slate-900 dark:text-slate-100 ${mono ? 'font-mono' : 'font-semibold'}`}
      >
        {String(value)}
      </span>
    </div>
  )
}

export default function PaymentCallbackFrontend() {
  const { t } = useLanguage()
  const [params] = useSearchParams()
  const data = useMemo(() => decodeCallbackDisplayToken(params.get('d')), [params])

  const parsed = data?.parsed ?? null
  const status = paymentResponseStatus(parsed)
  const theme = statusTheme(status)

  const statusTitle = {
    success: t('paymentCallback.statusSuccess'),
    completed: t('paymentCallback.statusCompleted'),
    pending: t('paymentCallback.statusPending'),
    failed: t('paymentCallback.statusFailed'),
    unknown: t('paymentCallback.statusUnknown'),
  }[status]

  const displayFields = parsed
    ? [
        ['invoiceNo', parsed.invoiceNo],
        ['respCode', parsed.respCode ?? parsed.responseCode],
        ['respDesc', parsed.respDesc ?? parsed.responseDescription],
        ['channelCode', parsed.channelCode],
        ['merchantID', parsed.merchantID ?? parsed.merchantId],
        ['tranRef', parsed.tranRef ?? parsed.transactionRef],
        ['referenceNo', parsed.referenceNo],
        ['approvalCode', parsed.approvalCode],
        ['amount', parsed.amount],
        ['currencyCode', parsed.currencyCode],
        ['locale', parsed.locale],
      ].filter(([, v]) => v != null && v !== '')
    : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6 sm:px-8">
        <div className="mb-6 flex items-center justify-between">
          <AppBrandHeader />
          <div className="flex gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        {!data ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-2xl dark:bg-slate-800">
              ↩
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t('paymentCallback.emptyTitle')}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">{t('paymentCallback.emptyDesc')}</p>
            <Link to="/app" className="btn-primary mt-8">
              {t('paymentCallback.backToApp')}
            </Link>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center pb-8">
            <div
              className={`relative overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-200/60 ring-1 dark:bg-slate-900 dark:shadow-none ${theme.ring}`}
            >
              <div className={`bg-gradient-to-br px-6 pb-8 pt-10 text-white ${theme.bg}`}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-3xl font-bold backdrop-blur-sm">
                  {theme.icon}
                </div>
                <h1 className="text-center text-2xl font-bold tracking-tight">{statusTitle}</h1>
                {parsed?.respDesc && (
                  <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-white/90">
                    {parsed.respDesc}
                  </p>
                )}
                {parsed?.invoiceNo && (
                  <div className="mt-6 rounded-2xl bg-black/15 px-4 py-3 text-center backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-wider text-white/70">
                      {t('paymentCallback.invoiceNo')}
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold">{parsed.invoiceNo}</p>
                  </div>
                )}
              </div>

              <div className="px-6 py-2">
                {displayFields.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    label={t(`paymentCallback.${key}`)}
                    value={value}
                    mono={['invoiceNo', 'respCode', 'channelCode', 'tranRef', 'referenceNo', 'approvalCode'].includes(
                      key
                    )}
                  />
                ))}
              </div>

              <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{t('paymentCallback.receivedAt')}</span>
                  <span className="text-xs text-slate-400">
                    {data.receivedAt ? new Date(data.receivedAt).toLocaleString() : '—'}
                  </span>
                </div>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${theme.badge}`}>
                  {parsed?.respCode ?? '—'}
                </span>
              </div>
            </div>

            {data.raw && (
              <details className="mt-4 rounded-2xl border border-slate-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/80">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                  paymentResponse (raw)
                </summary>
                <div className="flex items-start justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <pre className="max-h-32 flex-1 overflow-auto break-all font-mono text-xs text-slate-600 dark:text-slate-400">
                    {data.raw}
                  </pre>
                  <CopyButton text={data.raw} />
                </div>
              </details>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                to={
                  parsed?.invoiceNo
                    ? `/app/payment-flow/inquiry?invoiceNo=${encodeURIComponent(parsed.invoiceNo)}`
                    : '/app/payment-flow/inquiry'
                }
                className="btn-primary flex-1 text-center"
              >
                {t('paymentCallback.paymentInquiry')}
              </Link>
              <Link to="/app/inbox" className="btn-secondary flex-1 text-center">
                {t('paymentCallback.viewInbox')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

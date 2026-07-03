import { useEffect, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import PaymentTokenField from '../components/PaymentTokenField.jsx'
import PaymentApiResultsPanel from '../components/PaymentApiResultsPanel.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import {
  parsePaymentOptions,
  categorySelectionToFlow,
  buildChannelGroups,
  countChannelsInGroups,
  channelSelectionToFlow,
} from '../utils/paymentOptionParse.js'
import PaymentCategoryPicker from '../components/PaymentCategoryPicker.jsx'
import PaymentChannelPicker from '../components/PaymentChannelPicker.jsx'
import { fetchAllPaymentOptionDetails } from '../utils/paymentChannelApi.js'
import {
  PAYMENT_OPTIONS_ENVIRONMENTS as ENVIRONMENTS,
  PAYMENT_OPTIONS_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
  DEFAULT_BROWSER_DETAILS,
} from '../config/paymentOptionsConfig.js'
import { PAYMENT_OPTION_DETAILS_ENVIRONMENTS as DETAILS_ENVIRONMENTS } from '../config/paymentOptionDetailsConfig.js'

function randomClientId() {
  return crypto.randomUUID().replace(/-/g, '')
}

export default function PaymentOptions() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow, recordStep } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  const [paymentToken, setPaymentToken] = useState(flow.paymentToken || '')
  const [clientId, setClientId] = useState(randomClientId)
  const [locale, setLocale] = useState('en')
  const [browserJson, setBrowserJson] = useState(() =>
    JSON.stringify(DEFAULT_BROWSER_DETAILS, null, 2)
  )

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [parsedOptions, setParsedOptions] = useState(null)
  const [channelGroups, setChannelGroups] = useState(flow.channelGroups || [])
  const [fetchProgress, setFetchProgress] = useState('')
  const [activeChannel, setActiveChannel] = useState(null)
  const [activeContext, setActiveContext] = useState(null)

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const handleResetBrowser = () => {
    setBrowserJson(JSON.stringify(DEFAULT_BROWSER_DETAILS, null, 2))
  }

  const handleSend = async () => {
    setError('')
    setResult(null)
    setParsedOptions(null)
    setChannelGroups([])
    setFetchProgress('')

    if (!paymentToken.trim()) {
      setError(t('paymentOptions.tokenRequired'))
      toast.warning(t('paymentOptions.tokenRequired'))
      return
    }

    let browserDetails
    try {
      browserDetails = JSON.parse(browserJson)
    } catch {
      setError(t('paymentOptions.invalidBrowserJson'))
      toast.warning(t('paymentOptions.invalidBrowserJson'))
      return
    }

    const payload = {
      paymentToken: paymentToken.trim(),
      clientID: clientId.trim() || randomClientId(),
      locale: locale.trim() || 'en',
      browserDetails,
    }

    const signal = start()
    try {
      const { data } = await api.post(
        '/api/simulator/proxy',
        {
          method: 'POST',
          url: apiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        },
        { signal }
      )

      updateFlow({ paymentToken: paymentToken.trim() })

      const parsed = parsePaymentOptions(data?.body)
      setParsedOptions(parsed)

      let groups = []
      let appliedChannel = false
      if (data?.status >= 200 && data?.status < 300 && parsed.ok && parsed.categories.length) {
        const detailsUrl =
          env === 'custom' ? DETAILS_ENVIRONMENTS.sandbox : DETAILS_ENVIRONMENTS[env] || DETAILS_ENVIRONMENTS.sandbox

        const detailResults = await fetchAllPaymentOptionDetails({
          url: detailsUrl,
          paymentToken: paymentToken.trim(),
          categories: parsed.categories,
          clientId: clientId.trim() || randomClientId(),
          locale: locale.trim() || 'en',
          signal,
          onProgress: (p) =>
            setFetchProgress(
              t('paymentOptions.fetchingDetails')
                .replace('{current}', String(p.current))
                .replace('{total}', String(p.total))
                .replace('{label}', p.label)
            ),
        })

        groups = buildChannelGroups(parsed.categories, detailResults)
        setChannelGroups(groups)
        updateFlow({ channelGroups: groups, optionCategories: parsed.categories })

        const defaultGroup = groups.find(
          (g) => g.categoryCode === parsed.defaultSelection?.categoryCode && g.groupCode === parsed.defaultSelection?.groupCode
        ) || groups[0]
        const firstChannel = defaultGroup?.channels?.find((c) => !c.isDown)
        if (firstChannel && defaultGroup) {
          const ctx = {
            categoryCode: defaultGroup.categoryCode,
            groupCode: defaultGroup.groupCode,
            categoryName: defaultGroup.categoryName,
            groupName: defaultGroup.groupName,
          }
          setActiveChannel(firstChannel)
          setActiveContext(ctx)
          updateFlow(channelSelectionToFlow(firstChannel, ctx))
          appliedChannel = true
        }
      }

      setResult({
        payload,
        status: data?.status,
        statusText: data?.statusText,
        durationMs: data?.durationMs,
        response: data?.body,
        error: data?.error ? data?.message : null,
      })

      if (data?.status >= 200 && data?.status < 300) {
        const channelCount = countChannelsInGroups(groups)
        toast.success(
          channelCount > 0
            ? t('paymentOptions.allDetailsLoaded').replace('{count}', String(channelCount))
            : t('common.requestSuccess')
        )
        if (parsed.ok && parsed.defaultSelection && !appliedChannel) {
          updateFlow(categorySelectionToFlow(parsed.defaultSelection))
        }
        if (groups.length > 0) recordStep('payment-options', 'success')
      } else toast.warning(data?.message || `HTTP ${data?.status}`)
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        setResult({ payload, error: t('common.requestCancelled') })
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
      const d = err.response?.data
      setResult({
        payload,
        status: err.response?.status,
        durationMs: d?.durationMs,
        error: message,
      })
    } finally {
      stop()
    }
  }

  const handleSelectCategory = (row) => {
    updateFlow(categorySelectionToFlow(row))
    toast.success(t('paymentOptions.categorySaved').replace('{code}', `${row.categoryCode} / ${row.groupCode}`))
  }

  const handleSelectChannel = (channel, context) => {
    setActiveChannel(channel)
    setActiveContext(context)
    updateFlow(channelSelectionToFlow(channel, context))
    toast.success(t('paymentOptionDetails.channelSaved').replace('{name}', channel.name))
  }

  const responseText =
    result?.response != null
      ? typeof result.response === 'string'
        ? result.response
        : JSON.stringify(result.response, null, 2)
      : null

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} title={fetchProgress || undefined} onCancel={cancel} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">POST</span>
        <h1 className="text-2xl font-bold text-slate-900">🧾 {t('paymentOptions.title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">⚙️ {t('paymentToken.configuration')}</h2>

          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => handleEnv(e.target.value)}>
                  {ENVIRONMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('paymentToken.apiUrl')}</label>
                <input
                  className="input font-mono text-xs"
                  value={apiUrl}
                  onChange={(e) => {
                    setApiUrl(e.target.value)
                    setEnv('custom')
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card space-y-3 p-4">
            <h3 className="font-semibold text-slate-800">{t('doPayment.basicInfo')}</h3>
            <PaymentTokenField value={paymentToken} onChange={setPaymentToken} />
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="label mb-0">🧾 Client ID</label>
                <button
                  type="button"
                  onClick={() => setClientId(randomClientId())}
                  className="text-xs text-brand-600 hover:underline"
                >
                  🔄 {t('paymentOptions.newClientId')}
                </button>
              </div>
              <input
                className="input font-mono text-xs"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div>
              <label className="label">🌍 Locale</label>
              <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} />
            </div>
          </div>

          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">🌐 {t('paymentOptions.browserDetails')}</h3>
              <button type="button" onClick={handleResetBrowser} className="text-xs text-brand-600 hover:underline">
                ↩ {t('paymentOptions.resetBrowser')}
              </button>
            </div>
            <textarea
              className="input min-h-[200px] font-mono text-xs"
              value={browserJson}
              onChange={(e) => setBrowserJson(e.target.value)}
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('paymentOptions.sending') : `🚀 ${t('paymentOptions.send')}`}
          </button>
        </div>

        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            📊 {t('paymentToken.results')}
          </h2>

          <PaymentApiResultsPanel
            hasResult={!!result}
            hasChannels={channelGroups.length > 0 || (parsedOptions?.categories?.length ?? 0) > 0}
            statusBadges={
              result && (result.status != null || result.error) ? (
                <div className="flex flex-wrap items-center gap-2">
                  {result.status != null && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        result.status >= 200 && result.status < 300
                          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {result.status} {result.statusText || ''}
                    </span>
                  )}
                  {result.durationMs != null && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {result.durationMs} ms
                    </span>
                  )}
                  {result.error && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                      {result.error}
                    </span>
                  )}
                </div>
              ) : null
            }
            channelsContent={
              <>
                {channelGroups.length > 0 && (
                  <PaymentChannelPicker
                    groups={channelGroups}
                    selected={flow}
                    activeChannel={activeChannel}
                    activeContext={activeContext}
                    onSelect={handleSelectChannel}
                  />
                )}
                {parsedOptions?.categories?.length > 0 && (
                  <PaymentCategoryPicker
                    categories={parsedOptions.categories}
                    selected={{ categoryCode: flow.categoryCode, groupCode: flow.groupCode }}
                    onSelect={handleSelectCategory}
                  />
                )}
                {parsedOptions && !parsedOptions.ok && parsedOptions.respCode && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    respCode: {parsedOptions.respCode} — {parsedOptions.respDesc}
                  </div>
                )}
              </>
            }
            requestTitle={`📤 ${t('paymentOptions.requestTitle')}`}
            responseTitle={`📥 ${t('paymentOptions.responseTitle')}`}
            requestText={result ? JSON.stringify(result.payload, null, 2) : null}
            responseText={responseText}
            footerContent={null}
          />
        </div>
      </div>
    </div>
  )
}

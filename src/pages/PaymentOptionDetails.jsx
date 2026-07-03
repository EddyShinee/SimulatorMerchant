import { useEffect, useState } from 'react'
import api from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { usePaymentFlow } from '../context/PaymentFlowContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import PaymentTokenField from '../components/PaymentTokenField.jsx'
import { useAbortableLoading } from '../hooks/useAbortableLoading.js'
import { proxyErrorMessage } from '../utils/proxyResponse.js'
import {
  parsePaymentOptionDetails,
  channelSelectionToFlow,
  buildChannelGroups,
  countChannelsInGroups,
} from '../utils/paymentOptionParse.js'
import PaymentChannelPicker from '../components/PaymentChannelPicker.jsx'
import { fetchAllPaymentOptionDetails } from '../utils/paymentChannelApi.js'
import {
  PAYMENT_OPTION_DETAILS_ENVIRONMENTS as ENVIRONMENTS,
  PAYMENT_OPTION_DETAILS_ENV_OPTIONS as ENVIRONMENT_OPTIONS,
} from '../config/paymentOptionDetailsConfig.js'

function randomClientId() {
  return crypto.randomUUID().replace(/-/g, '')
}

function ResultCard({ title, text, mono }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <CopyButton text={text} />
      </div>
      <pre
        className={`max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 ${
          mono ? 'break-all whitespace-pre-wrap' : ''
        }`}
      >
        {text}
      </pre>
    </div>
  )
}

export default function PaymentOptionDetails() {
  const { t } = useLanguage()
  const toast = useToast()
  const { flow, updateFlow } = usePaymentFlow()
  const { loading, start, cancel, stop, isAbortError } = useAbortableLoading()

  const [env, setEnv] = useState('sandbox')
  const [apiUrl, setApiUrl] = useState(ENVIRONMENTS.sandbox)

  useEffect(() => {
    if (env !== 'custom') setApiUrl(ENVIRONMENTS[env])
  }, [env])

  const [paymentToken, setPaymentToken] = useState(flow.paymentToken || '')
  const [clientId, setClientId] = useState(randomClientId)
  const [locale, setLocale] = useState('en')
  const [categoryCode, setCategoryCode] = useState(flow.categoryCode || 'GCARD')
  const [groupCode, setGroupCode] = useState(flow.groupCode || 'CC')

  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [parsedDetails, setParsedDetails] = useState(null)
  const [channelGroups, setChannelGroups] = useState(flow.channelGroups || [])
  const [fetchProgress, setFetchProgress] = useState('')
  const [activeChannel, setActiveChannel] = useState(null)
  const [activeContext, setActiveContext] = useState(null)

  useEffect(() => {
    if (flow.categoryCode) setCategoryCode(flow.categoryCode)
    if (flow.groupCode) setGroupCode(flow.groupCode)
  }, [flow.categoryCode, flow.groupCode])

  useEffect(() => {
    if (flow.channelGroups?.length) setChannelGroups(flow.channelGroups)
  }, [flow.channelGroups])

  useEffect(() => {
    if (flow.selectedChannelName && flow.channelCode) {
      setActiveChannel({
        name: flow.selectedChannelName,
        channelCode: flow.channelCode,
        agentCode: flow.agentCode || '',
        agentChannelCode: flow.agentChannelCode || '',
        requiresCard: flow.requiresCard,
      })
      setActiveContext({
        categoryCode: flow.categoryCode,
        groupCode: flow.groupCode,
        categoryName: flow.categoryName,
        groupName: flow.groupName,
      })
    }
  }, [
    flow.selectedChannelName,
    flow.channelCode,
    flow.agentCode,
    flow.agentChannelCode,
    flow.categoryCode,
    flow.groupCode,
    flow.categoryName,
    flow.groupName,
    flow.requiresCard,
  ])

  const handleEnv = (value) => {
    setEnv(value)
    if (value !== 'custom') setApiUrl(ENVIRONMENTS[value])
  }

  const mergeGroupIntoList = (groups, group) => {
    const key = `${group.categoryCode}:${group.groupCode}`
    const rest = groups.filter((g) => `${g.categoryCode}:${g.groupCode}` !== key)
    return group.channels?.length ? [...rest, group] : rest
  }

  const handleFetchAll = async () => {
    const categories = flow.optionCategories || []
    if (!categories.length) {
      toast.warning(t('paymentOptionDetails.needOptionsFirst'))
      return
    }
    if (!paymentToken.trim()) {
      setError(t('paymentOptionDetails.tokenRequired'))
      toast.warning(t('paymentOptionDetails.tokenRequired'))
      return
    }

    setError('')
    setFetchProgress('')
    const signal = start()

    try {
      const detailResults = await fetchAllPaymentOptionDetails({
        url: apiUrl,
        paymentToken: paymentToken.trim(),
        categories,
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

      const groups = buildChannelGroups(categories, detailResults)
      setChannelGroups(groups)
      updateFlow({ channelGroups: groups, paymentToken: paymentToken.trim() })
      toast.success(t('paymentOptions.allDetailsLoaded').replace('{count}', String(countChannelsInGroups(groups))))
    } catch (err) {
      if (isAbortError(err)) {
        toast.warning(t('common.requestCancelled'))
        return
      }
      const message = proxyErrorMessage(err, t('errors.network'))
      setError(message)
      toast.error(message)
    } finally {
      stop()
      setFetchProgress('')
    }
  }

  const handleSend = async () => {
    setError('')
    setResult(null)
    setParsedDetails(null)

    if (!paymentToken.trim()) {
      setError(t('paymentOptionDetails.tokenRequired'))
      toast.warning(t('paymentOptionDetails.tokenRequired'))
      return
    }

    const payload = {
      paymentToken: paymentToken.trim(),
      clientID: clientId.trim() || randomClientId(),
      locale: locale.trim() || 'en',
      categoryCode: categoryCode.trim(),
      groupCode: groupCode.trim(),
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

      const parsed = parsePaymentOptionDetails(data?.body)
      setParsedDetails(parsed)

      const singleGroup = {
        categoryCode: parsed.categoryCode || categoryCode.trim(),
        categoryName: flow.categoryName,
        groupCode: parsed.groupCode || groupCode.trim(),
        groupName: flow.groupName,
        ok: parsed.ok,
        channels: parsed.channels || [],
      }

      if (data?.status >= 200 && data?.status < 300 && parsed.ok && singleGroup.channels.length) {
        const nextGroups = mergeGroupIntoList(channelGroups, singleGroup)
        setChannelGroups(nextGroups)
        updateFlow({
          paymentToken: paymentToken.trim(),
          categoryCode: categoryCode.trim(),
          groupCode: groupCode.trim(),
          channelGroups: nextGroups,
        })
      } else {
        updateFlow({
          paymentToken: paymentToken.trim(),
          categoryCode: categoryCode.trim(),
          groupCode: groupCode.trim(),
        })
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
        toast.success(t('common.requestSuccess'))
        const firstUp = parsed.channels?.find((c) => !c.isDown)
        if (parsed.ok && firstUp) {
          const ctx = {
            categoryCode: parsed.categoryCode || categoryCode.trim(),
            groupCode: parsed.groupCode || groupCode.trim(),
            categoryName: flow.categoryName,
            groupName: flow.groupName,
          }
          setActiveChannel(firstUp)
          setActiveContext(ctx)
          updateFlow(channelSelectionToFlow(firstUp, ctx))
        }
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

  const handleSelectChannel = (channel, context) => {
    setCategoryCode(context.categoryCode)
    setGroupCode(context.groupCode)
    setActiveChannel(channel)
    setActiveContext(context)
    updateFlow(channelSelectionToFlow(channel, context))
    toast.success(t('paymentOptionDetails.channelSaved').replace('{name}', channel.name))
  }

  const displayGroups =
    channelGroups.length > 0
      ? channelGroups
      : parsedDetails?.channels?.length
        ? [
            {
              categoryCode: parsedDetails.categoryCode || categoryCode,
              groupCode: parsedDetails.groupCode || groupCode,
              categoryName: flow.categoryName,
              groupName: flow.groupName,
              channels: parsedDetails.channels,
            },
          ]
        : []

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
        <h1 className="text-2xl font-bold text-slate-900">🧾 {t('paymentOptionDetails.title')}</h1>
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
                  🔄 {t('paymentOptionDetails.newClientId')}
                </button>
              </div>
              <input
                className="input font-mono text-xs"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">🌍 Locale</label>
                <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} />
              </div>
              <div>
                <label className="label">📂 categoryCode</label>
                <input className="input font-mono text-xs" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} />
              </div>
              <div>
                <label className="label">👥 groupCode</label>
                <input className="input font-mono text-xs" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ⚠️ {error}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
              {loading ? t('paymentOptionDetails.sending') : `🚀 ${t('paymentOptionDetails.send')}`}
            </button>
            <button
              type="button"
              onClick={handleFetchAll}
              className="btn-secondary w-full"
              disabled={loading || !(flow.optionCategories?.length)}
            >
              {loading ? t('paymentOptionDetails.fetchingAll') : `⚡ ${t('paymentOptionDetails.fetchAll')}`}
            </button>
          </div>
          {!(flow.optionCategories?.length) && (
            <p className="text-xs text-slate-500">{t('paymentOptionDetails.needOptionsFirst')}</p>
          )}
        </div>

        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">📊 {t('paymentToken.results')}</h2>

          {displayGroups.length > 0 && (
            <PaymentChannelPicker
              groups={displayGroups}
              selected={flow}
              activeChannel={activeChannel}
              activeContext={activeContext}
              onSelect={handleSelectChannel}
            />
          )}

          {!result && displayGroups.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-400">{t('paymentToken.noResult')}</div>
          ) : result ? (
            <div className="space-y-4">
              {(result.status != null || result.error) && (
                <div className="flex flex-wrap items-center gap-2">
                  {result.status != null && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        result.status >= 200 && result.status < 300
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {result.status} {result.statusText || ''}
                    </span>
                  )}
                  {result.durationMs != null && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {result.durationMs} ms
                    </span>
                  )}
                  {result.error && (
                    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      {result.error}
                    </span>
                  )}
                </div>
              )}

              <ResultCard
                title={`📤 ${t('paymentOptionDetails.requestTitle')}`}
                text={JSON.stringify(result.payload, null, 2)}
              />

              {responseText != null && (
                <ResultCard title={`📥 ${t('paymentOptionDetails.responseTitle')}`} text={responseText} mono />
              )}

              {parsedDetails && !parsedDetails.ok && parsedDetails.respCode && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  respCode: {parsedDetails.respCode} — {parsedDetails.respDesc}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

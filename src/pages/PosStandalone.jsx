import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api, { getInboxUrls } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import CopyButton from '../components/CopyButton.jsx'
import LoadingOverlay from '../components/LoadingOverlay.jsx'
import NotificationBodyForm from '../components/NotificationBodyForm.jsx'
import FinvietNotificationBodyForm from '../components/FinvietNotificationBodyForm.jsx'
import {
  POS_OPERATIONS,
  POS_ENV_OPTIONS,
  NOTIFICATION_TEMPLATES,
  CALLBACK_URL_PRESETS,
  buildOperationUrl,
  defaultRequestBody,
  generateTranId,
  DEFAULT_AES_KEY,
  isVtcCallbackUrl,
} from '../config/posStandaloneConfig.js'
import { buildFinvietNotificationTemplate, isFinvietCallbackUrl, FINVIET_DEFAULT_SECRET_KEY } from '../config/finvietNotificationConfig.js'
import {
  DEFAULT_NOTIFICATION_FORM,
  templateToForm,
  formToNotificationBody,
  parseNotificationFormFromJson,
  withFreshTranIds,
  withFreshTranIdsBody,
} from '../utils/notificationForm.js'
import {
  DEFAULT_FINVIET_FORM,
  templateToFinvietForm,
  finvietFormToBody,
  parseFinvietFormFromJson,
  withFreshFinvietIds,
  withFreshFinvietTimestamps,
  ensureFinvietMerchantBillId,
  regenerateFinvietAutoFields,
  regenerateFinvietAutoFieldsBody,
  finvietSignFingerprint,
} from '../utils/finvietNotificationForm.js'
import { finvietBodyWithSignature } from '../utils/finvietSignature.js'
import { decodeJwtPayload, payloadsMatch } from '../utils/jwtDecode.js'
import {
  loadStoredPrivateKeyPem,
  loadStoredPublicCertPem,
  saveStoredPrivateKeyPem,
  saveStoredPublicCertPem,
  loadStoredAesKey,
  saveStoredAesKey,
  loadStoredPlainPan,
  saveStoredPlainPan,
  loadStoredFinvietSecret,
  saveStoredFinvietSecret,
} from '../utils/posStandaloneKeyStore.js'

function ResultCard({ title, text }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        <CopyButton text={text} />
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{text}</pre>
    </div>
  )
}

export default function PosStandalone() {
  const { t } = useLanguage()
  const { user } = useAuth()

  const [operation, setOperation] = useState('notification')
  const [env, setEnv] = useState('custom')
  const [baseUrl, setBaseUrl] = useState('')
  const [transactionId, setTransactionId] = useState(() => generateTranId())
  const [bearerToken, setBearerToken] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [callbackPreset, setCallbackPreset] = useState('simulator')
  const [bodyJson, setBodyJson] = useState('')
  const [notificationForm, setNotificationForm] = useState(DEFAULT_NOTIFICATION_FORM)
  const [finvietForm, setFinvietForm] = useState(DEFAULT_FINVIET_FORM)
  const [finvietSigning, setFinvietSigning] = useState(false)
  const finvietSignSkipRef = useRef(false)
  const finvietSignFingerprintRef = useRef('')
  const [notificationEditMode, setNotificationEditMode] = useState('form')
  const [privateKeyPem, setPrivateKeyPem] = useState(loadStoredPrivateKeyPem)
  const [privateKeyFile, setPrivateKeyFile] = useState(null)
  const [privateKeyPassword, setPrivateKeyPassword] = useState('')
  const [privateKeyFileName, setPrivateKeyFileName] = useState('')
  const [publicCertPem, setPublicCertPem] = useState(loadStoredPublicCertPem)
  const [publicCertFileName, setPublicCertFileName] = useState('')
  const [plainPan, setPlainPan] = useState(loadStoredPlainPan)
  const [aesKey, setAesKey] = useState(loadStoredAesKey)
  const [encryptingCardPan, setEncryptingCardPan] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)

  const BINARY_KEY_EXT = /\.(pfx|p12|der)$/i

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  const handlePrivateKeyFile = (file) => {
    if (!file) return
    if (BINARY_KEY_EXT.test(file.name)) {
      const reader = new FileReader()
      reader.onload = () => {
        setPrivateKeyFile({
          base64: arrayBufferToBase64(reader.result),
          filename: file.name,
        })
        setPrivateKeyPem('')
        setPrivateKeyFileName(file.name)
      }
      reader.onerror = () => setError(t('posStandalone.keyReadFailed'))
      reader.readAsArrayBuffer(file)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const pem = String(reader.result || '')
      setPrivateKeyPem(pem)
      saveStoredPrivateKeyPem(pem)
      setPrivateKeyFile(null)
      setPrivateKeyFileName(file.name)
    }
    reader.onerror = () => setError(t('posStandalone.keyReadFailed'))
    reader.readAsText(file)
  }

  const handlePastePrivateKey = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text?.trim()) {
        setPrivateKeyPem(text.trim())
        saveStoredPrivateKeyPem(text.trim())
        setPrivateKeyFile(null)
        setPrivateKeyFileName('')
      }
    } catch {
      setError(t('posStandalone.pasteFailed'))
    }
  }

  const regenerateEcKeyPair = async () => {
    const { data } = await api.post('/api/simulator/pos-standalone/generate-test-key')
    const privateKey = data.privateKeyPem || ''
    const cert = data.publicCertPem || ''
    setPrivateKeyPem(privateKey)
    setPublicCertPem(cert)
    saveStoredPrivateKeyPem(privateKey)
    saveStoredPublicCertPem(cert)
    setPrivateKeyFile(null)
    setPrivateKeyFileName('')
    setPublicCertFileName('')
    setPrivateKeyPassword('')
    setVerifyResult(null)
    return { privateKeyPem: privateKey, publicCertPem: cert }
  }

  const handleGenerateTestKey = async () => {
    setError('')
    try {
      await regenerateEcKeyPair()
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('errors.network'))
    }
  }

  const handlePublicCertFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const pem = String(reader.result || '')
      setPublicCertPem(pem)
      saveStoredPublicCertPem(pem)
      setPublicCertFileName(file.name)
      setVerifyResult(null)
    }
    reader.onerror = () => setError(t('posStandalone.keyReadFailed'))
    reader.readAsText(file)
  }

  const handleVerifyJwt = async () => {
    setError('')
    setVerifyResult(null)
    const jwt = result?.webhookJwt
    if (!jwt) {
      setError(t('posStandalone.verifyNeedSend'))
      return
    }
    if (!publicCertPem.trim()) {
      setError(t('posStandalone.verifyNeedCert'))
      return
    }
    try {
      const { data } = await api.post('/api/simulator/pos-standalone/verify-jwt', {
        webhookJwt: jwt,
        publicCertPem,
      })
      setVerifyResult(data)
    } catch (err) {
      setVerifyResult(err.response?.data || { valid: false, message: err.message })
    }
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const opMeta = POS_OPERATIONS.find((o) => o.id === operation) || POS_OPERATIONS[0]
  const isNotification = operation === 'notification'
  const isFinviet =
    isNotification && (callbackPreset === 'finviet' || isFinvietCallbackUrl(callbackUrl))
  const isVtc =
    isNotification && (callbackPreset === 'vtc-qa' || isVtcCallbackUrl(callbackUrl))

  const signFinvietBody = useCallback(async (body, secretKey) => {
    const unsigned = { ...body }
    delete unsigned.signature
    return finvietBodyWithSignature(unsigned, secretKey.trim())
  }, [])

  const finvietSecret = useCallback(
    (form = finvietForm) =>
      form.secretKey?.trim() || loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
    [finvietForm]
  )

  const applyFinvietSignature = useCallback(
    async (form = finvietForm, { regenerate = false } = {}) => {
      const secret = finvietSecret(form)
      setFinvietSigning(true)
      try {
        saveStoredFinvietSecret(secret)
        const base = regenerate
          ? regenerateFinvietAutoFields({ ...form, secretKey: secret })
          : { ...form, secretKey: secret }
        const refreshed = withFreshFinvietTimestamps(ensureFinvietMerchantBillId(base))
        const signed = await signFinvietBody(finvietFormToBody(refreshed, { refreshTimes: false }), secret)
        finvietSignSkipRef.current = true
        finvietSignFingerprintRef.current = finvietSignFingerprint({ ...refreshed, signature: signed.signature })
        const nextForm = { ...refreshed, signature: signed.signature }
        setFinvietForm(nextForm)
        if (notificationEditMode === 'form') {
          setBodyJson(JSON.stringify(signed, null, 2))
        }
        return signed
      } finally {
        setFinvietSigning(false)
      }
    },
    [finvietForm, notificationEditMode, signFinvietBody, finvietSecret]
  )

  const finvietSignPayload = useMemo(
    () => (isFinviet && notificationEditMode === 'form' ? finvietSignFingerprint(finvietForm) : ''),
    [isFinviet, notificationEditMode, finvietForm]
  )

  useEffect(() => {
    if (!isFinviet || notificationEditMode !== 'form') return
    if (finvietSignSkipRef.current) {
      finvietSignSkipRef.current = false
      return
    }
    const secret = finvietForm.secretKey?.trim() || loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY
    if (!secret) return
    if (finvietSignPayload && finvietSignPayload === finvietSignFingerprintRef.current) return

    const timer = setTimeout(() => {
      void applyFinvietSignature(finvietForm)
    }, 200)
    return () => clearTimeout(timer)
  }, [isFinviet, notificationEditMode, finvietSignPayload, finvietForm.secretKey, applyFinvietSignature, finvietForm])

  useEffect(() => {
    if (callbackPreset === 'simulator') {
      setCallbackUrl(`${getInboxUrls(user?.id).webhook}/pos-standalone`)
    } else {
      const preset = CALLBACK_URL_PRESETS.find((p) => p.id === callbackPreset)
      if (preset?.url) setCallbackUrl(preset.url)
    }
  }, [callbackPreset, user?.id])

  useEffect(() => {
    if (!isNotification || isFinviet || !isVtc) return
    setNotificationForm((prev) => {
      const jwtSecret = prev.jwtSecret?.trim() || aesKey.trim() || DEFAULT_AES_KEY
      if (prev.jwtSecret === jwtSecret) return prev
      return { ...prev, jwtSecret }
    })
  }, [isNotification, isFinviet, isVtc, aesKey])

  useEffect(() => {
    if (!isNotification) {
      const def = defaultRequestBody(operation)
      setBodyJson(def ? JSON.stringify(def, null, 2) : '')
      setError('')
      setResult(null)
      return
    }

    if (isFinviet) {
      const form = withFreshFinvietIds({
        ...templateToFinvietForm(buildFinvietNotificationTemplate()),
        secretKey: loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
      })
      setFinvietForm(form)
      setBodyJson(JSON.stringify(finvietFormToBody(form), null, 2))
    } else {
      const form = withFreshTranIds(templateToForm(NOTIFICATION_TEMPLATES.sale))
      setNotificationForm(form)
      setBodyJson(JSON.stringify(formToNotificationBody(form), null, 2))
    }
    setNotificationEditMode('form')
    setError('')
    setResult(null)
  }, [operation, isNotification, isFinviet])

  const targetUrl = useMemo(() => {
    if (isNotification) return callbackUrl.trim()
    return buildOperationUrl(operation, baseUrl, transactionId)
  }, [operation, baseUrl, transactionId, callbackUrl, isNotification])

  const applyTemplate = (key) => {
    if (isFinviet) {
      const form = withFreshFinvietIds({
        ...templateToFinvietForm(buildFinvietNotificationTemplate()),
        secretKey: finvietForm.secretKey?.trim() || loadStoredFinvietSecret() || FINVIET_DEFAULT_SECRET_KEY,
      })
      setFinvietForm(form)
      setBodyJson(JSON.stringify(finvietFormToBody(form), null, 2))
      setNotificationEditMode('form')
      return
    }
    if (NOTIFICATION_TEMPLATES[key]) {
      const form = withFreshTranIds(templateToForm(NOTIFICATION_TEMPLATES[key]))
      setNotificationForm(form)
      setBodyJson(JSON.stringify(formToNotificationBody(form), null, 2))
      setNotificationEditMode('form')
    }
  }

  const syncNotificationTranIds = (body) => {
    if (isFinviet) {
      const next = regenerateFinvietAutoFieldsBody(body)
      const nextForm = templateToFinvietForm(next)
      setFinvietForm((prev) => ({ ...prev, ...nextForm, secretKey: finvietSecret(prev), signature: '' }))
      setBodyJson(JSON.stringify(next, null, 2))
      return next
    }
    const next = withFreshTranIdsBody(body)
    setNotificationForm((prev) => ({ ...prev, tranId: next.tranId, linkedTranId: next.linkedTranId }))
    setBodyJson(JSON.stringify(next, null, 2))
    return next
  }

  const switchNotificationMode = (mode) => {
    if (mode === 'json' && notificationEditMode === 'form') {
      setBodyJson(
        JSON.stringify(isFinviet ? finvietFormToBody(finvietForm) : formToNotificationBody(notificationForm), null, 2)
      )
    }
    if (mode === 'form' && notificationEditMode === 'json') {
      try {
        if (isFinviet) setFinvietForm(parseFinvietFormFromJson(bodyJson))
        else setNotificationForm(parseNotificationFormFromJson(bodyJson))
      } catch {
        setError(t('posStandalone.invalidJson'))
        return
      }
    }
    setNotificationEditMode(mode)
  }

  const handleNotificationFormChange = (nextForm) => {
    if (isFinviet) {
      if (nextForm.secretKey?.trim()) saveStoredFinvietSecret(nextForm.secretKey.trim())
      setFinvietForm(nextForm)
      if (notificationEditMode === 'form' && !nextForm.secretKey?.trim()) {
        setBodyJson(JSON.stringify(finvietFormToBody(nextForm), null, 2))
      }
      return
    }
    setNotificationForm(nextForm)
    if (notificationEditMode === 'form') {
      setBodyJson(JSON.stringify(formToNotificationBody(nextForm), null, 2))
    }
  }

  const encryptCardPanToForm = async (form = notificationForm) => {
    const key = aesKey.trim() || DEFAULT_AES_KEY
    const pan = plainPan.trim()
    if (!pan) throw new Error(t('posStandalone.plainPanRequired'))
    const { data } = await api.post('/api/simulator/pos-standalone/encrypt-card-pan', {
      plainPan: pan,
      aesKey: key,
    })
    return { ...form, cardPan: data.cardPan, jwtSecret: key }
  }

  const handleEncryptCardPan = async () => {
    setError('')
    setEncryptingCardPan(true)
    try {
      const nextForm = await encryptCardPanToForm()
      handleNotificationFormChange(nextForm)
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('posStandalone.encryptCardPanFailed'))
    } finally {
      setEncryptingCardPan(false)
    }
  }

  const handleSend = async () => {
    setError('')
    setResult(null)

    if (!targetUrl) {
      setError(t('posStandalone.urlRequired'))
      return
    }

    if (!isNotification && !bearerToken.trim()) {
      setError(t('posStandalone.bearerRequired'))
      return
    }

    let parsedBody = null
    if (!isNotification && opMeta.method === 'POST') {
      try {
        parsedBody = JSON.parse(bodyJson)
      } catch {
        setError(t('posStandalone.invalidJson'))
        return
      }
    }

    let notificationBody = null
    let signingPrivateKeyPem = privateKeyPem
    let signingPrivateKeyFile = privateKeyFile
    const signWebhook = isNotification && !isFinviet
    if (isNotification) {
      try {
        let softposForm = notificationForm
        if (!isFinviet && plainPan.trim() && notificationEditMode === 'form') {
          softposForm = await encryptCardPanToForm(notificationForm)
          setNotificationForm(softposForm)
        }

        notificationBody =
          notificationEditMode === 'form'
            ? isFinviet
              ? finvietFormToBody(finvietForm)
              : formToNotificationBody(softposForm)
            : JSON.parse(bodyJson)
        notificationBody = syncNotificationTranIds(notificationBody)
      } catch {
        setError(t('posStandalone.invalidJson'))
        return
      }

      if (isFinviet) {
        const secret = finvietSecret(finvietForm)
        try {
          notificationBody = await signFinvietBody(notificationBody, secret)
          const nextForm = templateToFinvietForm(notificationBody)
          finvietSignSkipRef.current = true
          setFinvietForm((prev) => ({
            ...prev,
            ...nextForm,
            secretKey: secret,
            signature: notificationBody.signature,
          }))
          setBodyJson(JSON.stringify(notificationBody, null, 2))
        } catch (e) {
          setError(e.message || t('posStandalone.finvietSignFailed'))
          return
        }
      }

      if (signWebhook && !privateKeyPem.trim() && !privateKeyFile?.base64) {
        setError(t('posStandalone.keyRequired'))
        return
      }
    }

    setLoading(true)
    try {
      const { data } = await api.post('/api/simulator/pos-standalone/send', {
        method: isNotification ? 'POST' : opMeta.method,
        url: targetUrl,
        bearerToken: isNotification ? undefined : bearerToken.trim(),
        body: signWebhook ? null : isNotification ? notificationBody : parsedBody,
        signWebhookJwt: signWebhook,
        privateKeyPem: signWebhook ? signingPrivateKeyPem : undefined,
        privateKeyFile: signWebhook ? signingPrivateKeyFile : undefined,
        privateKeyPassword: signWebhook ? privateKeyPassword || undefined : undefined,
        notificationBody: signWebhook ? notificationBody : isNotification ? notificationBody : undefined,
        finvietSecretKey: isFinviet ? finvietSecret(finvietForm) : undefined,
      })

      setResult(data)
      if (!data.ok && data.error) setError(data.message || data.error)
    } catch (err) {
      const d = err.response?.data
      if (err.response?.status === 404) {
        setError(t('posStandalone.endpointNotFound'))
      } else {
        setError(d?.message || err.message || t('errors.network'))
      }
    } finally {
      setLoading(false)
    }
  }

  const responseText =
    result?.body != null
      ? typeof result.body === 'string'
        ? result.body
        : JSON.stringify(result.body, null, 2)
      : null

  const decodedJwt = result?.webhookJwt ? decodeJwtPayload(result.webhookJwt) : null
  const sentBody = useMemo(() => {
    if (!result) return null
    try {
      if (isFinviet) {
        if (result?.finvietSignedBody) return result.finvietSignedBody
        return notificationEditMode === 'form' ? finvietFormToBody(finvietForm) : JSON.parse(bodyJson)
      }
      if (!result?.webhookJwt) return null
      return notificationEditMode === 'form'
        ? formToNotificationBody(notificationForm)
        : JSON.parse(bodyJson)
    } catch {
      return null
    }
  }, [result, isFinviet, notificationEditMode, finvietForm, notificationForm, bodyJson])

  const jwtBodyMatch = decodedJwt && sentBody ? payloadsMatch(decodedJwt, sentBody) : null

  return (
    <div className="space-y-6">
      <LoadingOverlay show={loading} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
          {opMeta.method}
        </span>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          📱 {t('posStandalone.title')}
        </h1>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">{t('posStandalone.subtitle')}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            ⚙️ {t('paymentToken.configuration')}
          </h2>

          <div className="card p-4">
            <label className="label">{t('posStandalone.operation')}</label>
            <div className="flex flex-wrap gap-2">
              {POS_OPERATIONS.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setOperation(op.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    operation === op.id
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {!isNotification && (
            <div className="card space-y-3 p-4">
              <div>
                <label className="label">{t('paymentToken.environment')}</label>
                <select className="input" value={env} onChange={(e) => setEnv(e.target.value)}>
                  {POS_ENV_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('posStandalone.baseUrl')}</label>
                <input
                  className="input font-mono text-xs"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://acquirer-api.example.com"
                />
              </div>
              <div>
                <label className="label">{t('posStandalone.transactionId')}</label>
                <input
                  className="input font-mono text-xs"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Authorization Bearer</label>
                <input
                  className="input font-mono text-xs"
                  type="password"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  placeholder="Bearer token"
                />
              </div>
            </div>
          )}

          {isNotification && (
            <div className="card space-y-3 p-4">
              <div>
                <label className="label">{t('posStandalone.callbackUrl')}</label>
                <select
                  className="input mb-2 text-xs"
                  value={callbackPreset}
                  onChange={(e) => setCallbackPreset(e.target.value)}
                >
                  {CALLBACK_URL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">{t('posStandalone.callbackCustom')}</option>
                </select>
                <input
                  className="input font-mono text-xs"
                  value={callbackUrl}
                  onChange={(e) => {
                    setCallbackUrl(e.target.value)
                    setCallbackPreset('custom')
                  }}
                />
                <p className="mt-1 text-xs text-slate-400">{t('posStandalone.callbackHint')}</p>
                {callbackUrl.includes('2c2p.com') && !isFinviet && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    {t('posStandalone.callback2c2pWarning')}
                  </p>
                )}
                {isFinviet && (
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                    {t('posStandalone.finvietCallbackHint')}
                  </p>
                )}
              </div>
              {!isFinviet && (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-600">
                <p className="label mb-3">webhook-jwt (ES256)</p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('posStandalone.keyPersistHint')}</p>
                <p className="label mb-1">{t('posStandalone.acquirerPrivateKey')}</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button type="button" onClick={handleGenerateTestKey} className="btn-secondary whitespace-nowrap">
                    🔑 {t('posStandalone.generateTestKey')}
                  </button>
                  <button type="button" onClick={handlePastePrivateKey} className="btn-secondary whitespace-nowrap">
                    📋 {t('posStandalone.pasteKey')}
                  </button>
                </div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t('posStandalone.uploadKey')}
                </label>
                <input
                  type="file"
                  accept=".pem,.key,.txt,.pfx,.p12,.der"
                  className="mb-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-slate-300"
                  onChange={(e) => {
                    handlePrivateKeyFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <div className="mb-2">
                  <label className="label">{t('posStandalone.keyPassword')}</label>
                  <input
                    className="input font-mono text-xs"
                    type="password"
                    value={privateKeyPassword}
                    onChange={(e) => setPrivateKeyPassword(e.target.value)}
                    placeholder={t('posStandalone.keyPasswordHint')}
                  />
                </div>
                {privateKeyFileName && <p className="mb-2 text-xs text-slate-500">📎 {privateKeyFileName}</p>}
                <textarea
                  className="input mb-4 min-h-[100px] font-mono text-xs"
                  value={privateKeyPem}
                  onChange={(e) => {
                    const pem = e.target.value
                    setPrivateKeyPem(pem)
                    saveStoredPrivateKeyPem(pem)
                    setPrivateKeyFile(null)
                    setPrivateKeyFileName('')
                  }}
                  placeholder={'-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----'}
                  spellCheck={false}
                />

                <p className="label mb-1">{t('posStandalone.publicCert')}</p>
                <input
                  type="file"
                  accept=".cer,.crt,.pem"
                  className="mb-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700 dark:text-slate-300"
                  onChange={(e) => {
                    handlePublicCertFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {publicCertFileName && <p className="mb-2 text-xs text-slate-500">📎 {publicCertFileName}</p>}
                <textarea
                  className="input min-h-[80px] font-mono text-xs"
                  value={publicCertPem}
                  onChange={(e) => {
                    const pem = e.target.value
                    setPublicCertPem(pem)
                    saveStoredPublicCertPem(pem)
                    setPublicCertFileName('')
                    setVerifyResult(null)
                  }}
                  placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                  spellCheck={false}
                />
              </div>
              )}
              <div>
                <label className="label mb-2">{t('posStandalone.notificationTemplates')}</label>
                <div className="flex flex-wrap gap-2">
                  {isFinviet ? (
                    <button
                      type="button"
                      onClick={() => applyTemplate('finviet')}
                      className="btn-secondary text-xs"
                    >
                      FinViet
                    </button>
                  ) : (
                    Object.keys(NOTIFICATION_TEMPLATES).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyTemplate(key)}
                        className="btn-secondary text-xs capitalize"
                      >
                        {key}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {(isNotification || opMeta.method === 'POST') && (
            <div className="card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="label mb-0">
                  {isNotification ? t('posStandalone.notificationBody') : t('posStandalone.requestBody')}
                </label>
                {isNotification && (
                  <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-600">
                    <button
                      type="button"
                      onClick={() => switchNotificationMode('form')}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        notificationEditMode === 'form'
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {t('posStandalone.formMode')}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchNotificationMode('json')}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        notificationEditMode === 'json'
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                )}
              </div>

              {isNotification && notificationEditMode === 'form' ? (
                isFinviet ? (
                  <FinvietNotificationBodyForm
                    form={finvietForm}
                    onChange={handleNotificationFormChange}
                    onRegenerateSignature={() => applyFinvietSignature(finvietForm, { regenerate: true })}
                    signing={finvietSigning}
                    t={t}
                  />
                ) : (
                <NotificationBodyForm
                  form={notificationForm}
                  onChange={handleNotificationFormChange}
                  t={t}
                  plainPan={plainPan}
                  aesKey={aesKey}
                  onPlainPanChange={(value) => {
                    setPlainPan(value)
                    saveStoredPlainPan(value)
                  }}
                  onAesKeyChange={(value) => {
                    setAesKey(value)
                    saveStoredAesKey(value)
                  }}
                  onEncryptCardPan={handleEncryptCardPan}
                  encrypting={encryptingCardPan}
                  showVtcJwtHint={isVtc}
                />
                )
              ) : (
                <textarea
                  className="input min-h-[220px] font-mono text-xs"
                  value={bodyJson}
                  onChange={(e) => setBodyJson(e.target.value)}
                  spellCheck={false}
                />
              )}

              {isNotification && notificationEditMode === 'form' && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-400">
                    {t('posStandalone.previewJson')}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-slate-100">
                    {bodyJson}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="card p-4">
            <label className="label">{t('posStandalone.targetUrl')}</label>
            <p className="break-all font-mono text-xs text-brand-700 dark:text-brand-300">{targetUrl || '—'}</p>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleSend} className="btn-primary w-full" disabled={loading}>
            {loading ? t('posStandalone.sending') : `🚀 ${t('posStandalone.send')}`}
          </button>
        </div>

        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            📊 {t('paymentToken.results')}
          </h2>

          {!result ? (
            <div className="card p-8 text-center text-sm text-slate-400">{t('paymentToken.noResult')}</div>
          ) : (
            <div className="space-y-4">
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
              </div>

              {result.webhookJwt && !isFinviet && (
                <>
                  <ResultCard title="🔏 webhook-jwt" text={result.webhookJwt} />
                  <button type="button" onClick={handleVerifyJwt} className="btn-secondary text-xs">
                    ✓ {t('posStandalone.verifyJwt')}
                  </button>
                  {verifyResult && (
                    <p className={`text-xs font-medium ${verifyResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {verifyResult.valid ? `✅ ${t('posStandalone.verifyOk')}` : `❌ ${verifyResult.message}`}
                    </p>
                  )}
                  {decodedJwt && (
                    <ResultCard
                      title={`📋 ${t('posStandalone.jwtPayload')}`}
                      text={JSON.stringify(decodedJwt, null, 2)}
                    />
                  )}
                  {jwtBodyMatch != null && (
                    <p
                      className={`text-xs font-medium ${jwtBodyMatch ? 'text-green-600' : 'text-amber-600'}`}
                    >
                      {jwtBodyMatch ? `✅ ${t('posStandalone.jwtBodyMatch')}` : `⚠️ ${t('posStandalone.jwtBodyMismatch')}`}
                    </p>
                  )}
                </>
              )}

              {result.status === 403 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {t('posStandalone.error403')}
                </div>
              )}

              {(result.body?.status === 'failed' ||
                (typeof result.body === 'string' && result.body.includes('"failed"'))) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-semibold">{t('posStandalone.statusFailedTitle')}</p>
                  <p className="mt-1 text-xs opacity-90">{t('posStandalone.statusFailedIntro')}</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                    <li>{t('posStandalone.statusFailedTranId')}</li>
                    <li>{t('posStandalone.statusFailedCardPan')}</li>
                    <li>{t('posStandalone.statusFailedAmount')}</li>
                    <li>{t('posStandalone.statusFailedMerchant')}</li>
                    <li>{t('posStandalone.statusFailedJwtSecret')}</li>
                  </ul>
                </div>
              )}

              {result.requestHeaders && (
                <ResultCard
                  title={`📤 ${t('posStandalone.requestHeaders')}`}
                  text={JSON.stringify(result.requestHeaders, null, 2)}
                />
              )}

              {isFinviet && sentBody && (
                <ResultCard
                  title={`📤 ${t('posStandalone.finvietRequestBody')}`}
                  text={JSON.stringify(sentBody, null, 2)}
                />
              )}

              {responseText != null && (
                <ResultCard title={`📥 ${t('posStandalone.response')}`} text={responseText} />
              )}
            </div>
          )}

          <div className="card p-4 text-xs text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-slate-700 dark:text-slate-300">{t('posStandalone.apiReference')}</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>GET /order/reference/&#123;transactionId&#125; — Inquiry</li>
              <li>POST /api/v2/order/refund/&#123;transactionId&#125; — Refund</li>
              <li>POST /order/void/&#123;transactionId&#125; — Void</li>
              <li>POST /api/v2/order/capture/&#123;transactionId&#125; — Capture</li>
              <li>POST + webhook-jwt (ES256) — Notification callback</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

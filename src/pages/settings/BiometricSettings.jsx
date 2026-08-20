import { useEffect, useState } from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

export default function BiometricSettings() {
  const { user, enableTouchId, updateTouchId, disableTouchId, getTouchIdStatus } = useAuth()
  const { t } = useLanguage()
  const [touchIdAvailable, setTouchIdAvailable] = useState(false)
  const [touchIdEnabled, setTouchIdEnabled] = useState(null)
  const [touchIdBusy, setTouchIdBusy] = useState(false)
  const [touchIdMsg, setTouchIdMsg] = useState('')

  useEffect(() => {
    let active = true
    async function checkPlatform() {
      if (!browserSupportsWebAuthn()) {
        if (active) setTouchIdAvailable(false)
        return
      }
      try {
        const ok = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        if (active) setTouchIdAvailable(Boolean(ok))
      } catch {
        if (active) setTouchIdAvailable(false)
      }
    }
    checkPlatform()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    async function loadStatus() {
      if (!user) {
        setTouchIdEnabled(null)
        return
      }
      try {
        const status = await getTouchIdStatus()
        if (active) setTouchIdEnabled(Boolean(status?.enabled))
      } catch {
        if (active) setTouchIdEnabled(false)
      }
    }
    loadStatus()
    return () => {
      active = false
    }
  }, [user, getTouchIdStatus])

  const runTouchIdAction = async (action, successKey) => {
    setTouchIdMsg('')
    setTouchIdBusy(true)
    try {
      await action()
      const status = await getTouchIdStatus()
      setTouchIdEnabled(Boolean(status?.enabled))
      setTouchIdMsg(t(successKey))
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setTouchIdMsg(t('auth.touchIdCancelled'))
      } else {
        setTouchIdMsg(err.response?.data?.message || err.message || t('errors.network'))
      }
    } finally {
      setTouchIdBusy(false)
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('settings.biometric')}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('settings.biometricHint')}</p>
      </div>

      {!touchIdAvailable ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.biometricUnavailable')}</p>
      ) : touchIdEnabled ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('auth.touchIdEnabled')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={touchIdBusy}
              onClick={() => {
                if (!window.confirm(t('auth.confirmUpdateTouchId'))) return
                void runTouchIdAction(() => updateTouchId(), 'auth.updateTouchIdSuccess')
              }}
            >
              {touchIdBusy ? t('common.loading') : t('auth.updateTouchId')}
            </button>
            <button
              type="button"
              className="btn-secondary text-sm text-red-600 hover:text-red-700 dark:text-red-400"
              disabled={touchIdBusy}
              onClick={() => {
                if (!window.confirm(t('auth.confirmRemoveTouchId'))) return
                void runTouchIdAction(() => disableTouchId(), 'auth.removeTouchIdSuccess')
              }}
            >
              {t('auth.removeTouchId')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={touchIdBusy}
          onClick={() => void runTouchIdAction(() => enableTouchId(), 'auth.enableTouchIdSuccess')}
        >
          {touchIdBusy ? t('common.loading') : t('auth.enableTouchId')}
        </button>
      )}

      {touchIdMsg && <p className="text-sm text-slate-500 dark:text-slate-400">{touchIdMsg}</p>}
    </section>
  )
}

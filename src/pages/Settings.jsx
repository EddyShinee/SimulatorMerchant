import { useEffect, useState } from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useAuth } from '../context/AuthContext.jsx'
import { useAccess } from '../context/AccessContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import AccessControl from './AccessControl.jsx'

export default function Settings() {
  const { user, enableTouchId, updateTouchId, disableTouchId, getTouchIdStatus } = useAuth()
  const { isAdmin } = useAccess()
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

  const handleEnableTouchId = () => void runTouchIdAction(() => enableTouchId(), 'auth.enableTouchIdSuccess')

  const handleUpdateTouchId = () => {
    if (!window.confirm(t('auth.confirmUpdateTouchId'))) return
    void runTouchIdAction(() => updateTouchId(), 'auth.updateTouchIdSuccess')
  }

  const handleDisableTouchId = () => {
    if (!window.confirm(t('auth.confirmRemoveTouchId'))) return
    void runTouchIdAction(() => disableTouchId(), 'auth.removeTouchIdSuccess')
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.subtitle')}</p>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('settings.account')}</h2>
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
                onClick={handleUpdateTouchId}
              >
                {touchIdBusy ? t('common.loading') : t('auth.updateTouchId')}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                disabled={touchIdBusy}
                onClick={handleDisableTouchId}
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
            onClick={handleEnableTouchId}
          >
            {touchIdBusy ? t('common.loading') : t('auth.enableTouchId')}
          </button>
        )}

        {touchIdMsg && <p className="text-sm text-slate-500 dark:text-slate-400">{touchIdMsg}</p>}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('nav.accessControl')}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('access.subtitle')}</p>
          </div>
          <AccessControl embedded />
        </section>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useAuth } from '../context/AuthContext.jsx'
import { useAccess } from '../context/AccessContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { AppBrandCentered } from '../components/AppBrand.jsx'

export default function Register() {
  const { register, registerWithTouchId } = useAuth()
  const { isFeatureOn, loading: accessLoading } = useAccess()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [touchIdAvailable, setTouchIdAvailable] = useState(false)

  useEffect(() => {
    let active = true
    async function check() {
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
    check()
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      await register(email, password)
      setSuccess(t('auth.registerSuccess'))
      setTimeout(() => navigate('/app', { replace: true }), 600)
    } catch (err) {
      setError(err.response?.data?.message || t('errors.network'))
    } finally {
      setLoading(false)
    }
  }

  const handleTouchId = async () => {
    setError('')
    setSuccess('')
    if (!email.trim()) {
      setError(t('auth.emailRequiredForTouchId'))
      return
    }
    setLoading(true)
    try {
      await registerWithTouchId(email)
      setSuccess(t('auth.registerTouchIdSuccess'))
      setTimeout(() => navigate('/app', { replace: true }), 600)
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError(t('auth.touchIdCancelled'))
      } else {
        setError(err.response?.data?.message || err.message || t('errors.network'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-brand-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <div className="flex justify-end gap-2 p-4">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <AppBrandCentered />
          <div className="mb-8 flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold text-slate-900">{t('auth.registerTitle')}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{t('auth.registerSubtitle')}</p>
          </div>

          {!accessLoading && !isFeatureOn('registration') ? (
            <div className="card space-y-4 p-6 text-center sm:p-8">
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('auth.registrationClosed')}</p>
              <Link to="/login" className="btn-primary inline-flex">
                {t('auth.goLogin')}
              </Link>
            </div>
          ) : (
          <div className="card p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">
                  {success}
                </div>
              )}
              <div>
                <label className="label" htmlFor="email">
                  {t('common.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username webauthn"
                  className="input"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="password">
                  {t('common.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm">
                  {t('common.confirmPassword')}
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? t('common.loading') : t('auth.registerButton')}
              </button>
            </form>

            {touchIdAvailable && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs text-slate-400">{t('auth.or')}</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
                <button
                  type="button"
                  className="btn-secondary w-full"
                  disabled={loading}
                  onClick={handleTouchId}
                >
                  {t('auth.registerTouchId')}
                </button>
                <p className="text-center text-[11px] text-slate-400">{t('auth.registerTouchIdHint')}</p>
              </div>
            )}
          </div>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              {t('auth.goLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

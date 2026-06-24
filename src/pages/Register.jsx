import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { IconApi } from '../components/icons.jsx'

export default function Register() {
  const { register } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-brand-50">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
              <IconApi className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{t('auth.registerTitle')}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{t('auth.registerSubtitle')}</p>
          </div>

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
                  autoComplete="email"
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
          </div>

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

import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { IconApi } from '../components/icons.jsx'

export default function Login() {
  const { login } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || t('errors.network'))
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
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
              <IconApi className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{t('auth.loginTitle')}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{t('auth.loginSubtitle')}</p>
          </div>

          <div className="card p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {error}
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
                  autoComplete="current-password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? t('common.loading') : t('auth.loginButton')}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              {t('auth.goRegister')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

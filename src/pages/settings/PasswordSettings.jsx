import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

export default function PasswordSettings() {
  const { changePassword } = useAuth()
  const { t } = useLanguage()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordMsg('')
    setPasswordError('')

    if (newPassword.length < 6) {
      setPasswordError(t('auth.passwordTooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.passwordMismatch'))
      return
    }
    if (currentPassword === newPassword) {
      setPasswordError(t('settings.passwordUnchanged'))
      return
    }

    setPasswordBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg(t('settings.passwordSaved'))
    } catch (err) {
      setPasswordError(err.response?.data?.message || err.message || t('errors.network'))
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('settings.password')}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('settings.passwordHint')}</p>
      </div>
      <form className="grid max-w-md gap-3" onSubmit={handleChangePassword}>
        <div>
          <label className="label" htmlFor="current-password">
            {t('settings.currentPassword')}
          </label>
          <input
            id="current-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="new-password">
            {t('settings.newPassword')}
          </label>
          <input
            id="new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholder')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">
            {t('common.confirmPassword')}
          </label>
          <input
            id="confirm-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
        {passwordMsg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{passwordMsg}</p>}
        <div>
          <button type="submit" className="btn-primary text-sm" disabled={passwordBusy}>
            {passwordBusy ? t('common.loading') : t('settings.updatePassword')}
          </button>
        </div>
      </form>
    </section>
  )
}

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { translations, LANGUAGES } from '../i18n/translations.js'
import { biometricLabel, detectBiometricKind } from '../utils/platformBiometric.js'

const LanguageContext = createContext(null)

const STORAGE_KEY = 'sim_lang'

function getInitialLang() {
  if (typeof window === 'undefined') return 'vi'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && translations[stored]) return stored
  const browser = window.navigator.language?.slice(0, 2)
  return translations[browser] ? browser : 'vi'
}

// Resolve a dotted key path like "auth.loginTitle" from the dictionary.
function resolveKey(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), dict)
}

function interpolate(template, vars) {
  if (typeof template !== 'string' || !vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`))
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)
  const [biometricKind] = useState(() => detectBiometricKind())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const biometric = useMemo(() => biometricLabel(lang, biometricKind), [lang, biometricKind])

  const t = useCallback(
    (key, extra) => {
      const raw = resolveKey(translations[lang], key) ?? resolveKey(translations.en, key) ?? key
      return interpolate(raw, { biometric, ...extra })
    },
    [lang, biometric]
  )

  const value = useMemo(
    () => ({ lang, setLang, t, biometric, biometricKind, languages: LANGUAGES }),
    [lang, t, biometric, biometricKind]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { translations, LANGUAGES } from '../i18n/translations.js'

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

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback(
    (key) => {
      const value = resolveKey(translations[lang], key)
      if (value != null) return value
      // Fallback to English, then the raw key.
      return resolveKey(translations.en, key) ?? key
    },
    [lang]
  )

  const value = useMemo(
    () => ({ lang, setLang, t, languages: LANGUAGES }),
    [lang, t]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

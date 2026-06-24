import { useLanguage } from '../context/LanguageContext.jsx'

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang, languages } = useLanguage()

  return (
    <div className={`inline-flex rounded-lg border border-slate-200 bg-white p-0.5 ${className}`}>
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            lang === l.code
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          aria-pressed={lang === l.code}
        >
          <span aria-hidden>{l.flag}</span>
          <span className="hidden sm:inline">{l.label}</span>
          <span className="sm:hidden">{l.code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}

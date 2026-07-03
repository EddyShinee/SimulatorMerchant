import { useLanguage } from '../context/LanguageContext.jsx'

export default function PasteButton({ onPaste, className = '' }) {
  const { t } = useLanguage()

  const handleClick = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text?.trim()) onPaste(text.trim())
    } catch {
      onPaste(null)
    }
  }

  return (
    <button type="button" onClick={handleClick} className={`text-xs text-brand-600 hover:underline ${className}`}>
      📋 {t('common.paste')}
    </button>
  )
}

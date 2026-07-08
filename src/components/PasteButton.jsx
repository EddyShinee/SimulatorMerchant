import { useLanguage } from '../context/LanguageContext.jsx'

export default function PasteButton({ onPaste, className = '', label }) {
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
    <button type="button" onClick={handleClick} className={`text-xs text-brand-600 hover:underline dark:text-brand-400 ${className}`}>
      📋 {label || t('common.paste')}
    </button>
  )
}

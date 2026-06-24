import { useLanguage } from '../context/LanguageContext.jsx'

export default function PaymentTokenField({ value, onChange, onPaste }) {
  const { t } = useLanguage()

  const handlePaste = async () => {
    if (onPaste) {
      onPaste()
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (text?.trim()) onChange(text.trim())
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div>
      <label className="label">🔑 Payment Token</label>
      <div className="flex gap-2">
        <input
          type="text"
          className="input-single min-w-0 flex-1 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="kSA..."
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" onClick={handlePaste} className="btn-secondary shrink-0 whitespace-nowrap">
          📋 {t('doPayment.pasteToken')}
        </button>
      </div>
    </div>
  )
}

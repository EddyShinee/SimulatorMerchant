import { useState } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { IconCopy } from './icons.jsx'

export default function CopyButton({ text, className = '', label }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for non-secure contexts
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button type="button" onClick={handleCopy} className={`btn-secondary ${className}`}>
      <IconCopy className="h-4 w-4" />
      {copied ? t('common.copied') : label || t('common.copy')}
    </button>
  )
}

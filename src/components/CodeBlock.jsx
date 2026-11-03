import JsonView, { tryParseJson } from './JsonView.jsx'
import XmlView from './XmlView.jsx'
import { formatStructuredText } from '../utils/formatStructuredText.js'

/**
 * Monospace block for JSON, XML, and plain text.
 * language="auto" pretty-prints JSON (highlighted) and XML (indented + colored).
 * language="text" leaves the value unchanged.
 */
export default function CodeBlock({
  children,
  className = '',
  as = 'pre',
  maxHeight = 'max-h-72',
  language = 'auto',
}) {
  const raw = typeof children === 'string' ? children : String(children ?? '')
  const text = language === 'text' ? raw : formatStructuredText(raw)
  const parsed = language === 'text' || language === 'xml' ? null : tryParseJson(text)
  const isXml = language === 'xml' || (language !== 'text' && text.trim().startsWith('<'))
  const Tag = as

  if (parsed != null) {
    return (
      <pre className={`code-block ${maxHeight} ${className}`}>
        <code className="json-view">
          <JsonView value={parsed} />
        </code>
      </pre>
    )
  }

  if (isXml) {
    return (
      <pre className={`code-block ${maxHeight} ${className}`}>
        <code className="xml-view">
          <XmlView xml={text} />
        </code>
      </pre>
    )
  }

  return (
    <Tag className={`code-block code-block-plain ${maxHeight} ${className}`}>
      {text}
    </Tag>
  )
}

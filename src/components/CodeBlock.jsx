import JsonView, { tryParseJson } from './JsonView.jsx'

/**
 * Monospace block for JWT / JSON / plain text.
 * JSON is syntax-highlighted when parseable.
 */
export default function CodeBlock({
  children,
  className = '',
  as = 'pre',
  maxHeight = 'max-h-72',
  language = 'auto',
}) {
  const text = typeof children === 'string' ? children : String(children ?? '')
  const parsed =
    language === 'json' ? tryParseJson(text) : language === 'text' ? null : tryParseJson(text)
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

  return (
    <Tag className={`code-block code-block-plain ${maxHeight} ${className}`}>
      {text}
    </Tag>
  )
}

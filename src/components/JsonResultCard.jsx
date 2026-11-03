import CopyButton from './CopyButton.jsx'
import CodeBlock from './CodeBlock.jsx'
import { formatStructuredText } from '../utils/formatStructuredText.js'

/** Result card. JSON and XML are pretty-printed unless language is "text". */
export default function JsonResultCard({
  title,
  text,
  maxHeight = 'max-h-72',
  language = 'auto',
  copyLabel,
}) {
  const raw = text == null ? '' : typeof text === 'string' ? text : JSON.stringify(text, null, 2)
  const body = language === 'text' ? raw : formatStructuredText(raw)

  return (
    <div className="card min-w-0 overflow-hidden p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        <CopyButton text={body} label={copyLabel} />
      </div>
      <CodeBlock maxHeight={maxHeight} language={language}>
        {body}
      </CodeBlock>
    </div>
  )
}

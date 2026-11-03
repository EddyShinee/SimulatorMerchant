/** Indent compact XML. A tag and its text stay on one line. */
export function prettyXml(xml) {
  const source = String(xml ?? '').trim()
  if (!source.startsWith('<')) return source

  const lines = source
    .replace(/>\s+</g, '><')
    .replace(/>(?=<)/g, '>\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let depth = 0
  const out = []
  for (const line of lines) {
    const isClose = /^<\//.test(line)
    const isDecl = /^<\?/.test(line) || /^<!/.test(line)
    const isSelfClosing = /\/>$/.test(line)
    const isPair = /<\/[^>]+>$/.test(line) && !isClose
    const isOpen = /^<[^!?/]/.test(line) && !isSelfClosing && !isPair
    if (isClose) depth = Math.max(depth - 1, 0)
    out.push(`${'  '.repeat(depth)}${line}`)
    if (isOpen && !isDecl) depth += 1
  }
  return out.join('\n')
}

function prettyJson(text) {
  const source = String(text ?? '').trim()
  if (!(source.startsWith('{') || source.startsWith('['))) return null
  try {
    return JSON.stringify(JSON.parse(source), null, 2)
  } catch {
    return null
  }
}

/**
 * Pretty-print a result body.
 * JSON is indented. XML is indented. Everything else is unchanged.
 */
export function formatStructuredText(value) {
  if (value == null) return ''
  if (typeof value !== 'string') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  const json = prettyJson(value)
  if (json != null) return json
  const trimmed = value.trim()
  if (trimmed.startsWith('<')) return prettyXml(trimmed)
  return value
}

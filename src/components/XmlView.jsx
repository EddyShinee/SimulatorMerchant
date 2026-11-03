const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:.-]+(?:\s[^<>]*?)?\/?>|[^<]+/g

function Attrs({ text }) {
  if (!text) return null
  const parts = []
  const re = /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g
  let last = 0
  let match
  let index = 0
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push(<span key={`gap-${index}`}>{text.slice(last, match.index)}</span>)
    }
    parts.push(
      <span key={index}>
        <span className="text-violet-300">{match[1]}</span>
        <span className="text-slate-500">{match[2]}</span>
        <span className="text-amber-300">{match[3]}</span>
      </span>
    )
    last = match.index + match[0].length
    index += 1
  }
  if (last < text.length) parts.push(<span key="tail">{text.slice(last)}</span>)
  return <>{parts}</>
}

function XmlToken({ token, index }) {
  if (token.startsWith('<!--')) {
    return (
      <span key={index} className="text-slate-500">
        {token}
      </span>
    )
  }
  if (token.startsWith('<![CDATA[')) {
    return (
      <span key={index} className="text-emerald-300">
        {token}
      </span>
    )
  }
  if (!token.startsWith('<')) {
    return (
      <span key={index} className="text-emerald-300">
        {token}
      </span>
    )
  }

  const match = token.match(/^(<\/?)([\w:.-]+)([^>]*?)(\/?>)$/)
  if (!match) return <span key={index}>{token}</span>
  const [, open, name, attrs, close] = match
  return (
    <span key={index}>
      <span className="text-slate-500">{open}</span>
      <span className="text-sky-300">{name}</span>
      <Attrs text={attrs} />
      <span className="text-slate-500">{close}</span>
    </span>
  )
}

/** Colored, already-indented XML. */
export default function XmlView({ xml }) {
  const tokens = String(xml ?? '').match(TOKEN_RE) || []
  return tokens.map((token, index) => <XmlToken key={index} token={token} index={index} />)
}

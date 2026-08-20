function JsonString({ value }) {
  return <span className="text-emerald-300">&quot;{value}&quot;</span>
}

function JsonPrimitive({ value }) {
  if (value === null) return <span className="italic text-slate-400">null</span>
  if (typeof value === 'boolean') return <span className="text-violet-300">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-amber-300">{String(value)}</span>
  return <JsonString value={String(value)} />
}

function JsonLine({ children, indent = 0 }) {
  return (
    <>
      {'\n'}
      {'  '.repeat(indent)}
      {children}
    </>
  )
}

function JsonValue({ value, indent = 0 }) {
  if (value === null || typeof value !== 'object') {
    return <JsonPrimitive value={value} />
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-500">[]</span>
    return (
      <>
        <span className="text-slate-500">[</span>
        {value.map((item, i) => (
          <JsonLine key={i} indent={indent + 1}>
            <JsonValue value={item} indent={indent + 1} />
            {i < value.length - 1 ? <span className="text-slate-500">,</span> : null}
          </JsonLine>
        ))}
        <JsonLine indent={indent}>
          <span className="text-slate-500">]</span>
        </JsonLine>
      </>
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return <span className="text-slate-500">{'{}'}</span>

  return (
    <>
      <span className="text-slate-500">{'{'}</span>
      {entries.map(([key, val], i) => (
        <JsonLine key={key} indent={indent + 1}>
          <span className="text-sky-300">&quot;{key}&quot;</span>
          <span className="text-slate-500">: </span>
          <JsonValue value={val} indent={indent + 1} />
          {i < entries.length - 1 ? <span className="text-slate-500">,</span> : null}
        </JsonLine>
      ))}
      <JsonLine indent={indent}>
        <span className="text-slate-500">{'}'}</span>
      </JsonLine>
    </>
  )
}

export default function JsonView({ value }) {
  return <JsonValue value={value} indent={0} />
}

export function tryParseJson(text) {
  const s = String(text ?? '').trim()
  if (!s) return null
  if (!(s.startsWith('{') || s.startsWith('['))) return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

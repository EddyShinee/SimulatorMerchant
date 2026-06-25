function cellText(cell) {
  const label = cell.querySelector('label')
  return (label ? label.textContent : cell.textContent).trim()
}

/** Detect login / empty responses before parsing transaction table. */
export function analyzeHtmlResponse(html, finalUrl = '') {
  const text = typeof html === 'string' ? html : ''
  const lower = text.toLowerCase()
  const urlLower = (finalUrl || '').toLowerCase()

  if (
    urlLower.includes('/login') ||
    lower.includes('login to my.2c2p.com') ||
    lower.includes('id="loginform"') ||
    /<title>[^<]*login[^<]*<\/title>/i.test(text)
  ) {
    return {
      kind: 'login',
      error: 'login_page',
    }
  }

  if (!text.trim()) {
    return { kind: 'empty', error: 'empty_response' }
  }

  return { kind: 'unknown', error: null }
}

/** Parse HTML table.table from 2C2P merchant portal into row objects. */
export function parseHtmlTable(html) {
  const precheck = analyzeHtmlResponse(html)
  if (precheck.kind === 'login') {
    return { error: 'login_page', rows: [] }
  }
  if (precheck.kind === 'empty') {
    return { error: 'empty_response', rows: [] }
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table.table')
  if (!table) return { error: 'no_table', rows: [] }

  const trs = [...table.querySelectorAll('tr')]
  if (trs.length < 2) return { error: 'No data rows found in table', rows: [] }

  let headers = []
  for (const row of trs) {
    if (row.querySelector('td.header')) {
      headers = [...row.querySelectorAll('td.header')].map(cellText)
      break
    }
  }

  const dataRows = []
  const seen = new Set()

  for (const row of trs) {
    const borderCells = row.querySelectorAll('td.border')
    if (!borderCells.length) continue

    const rowData = [...borderCells].map(cellText)
    const lastBorder = row.querySelector('td.last-border')
    if (lastBorder) rowData.push(cellText(lastBorder))

    if (!rowData.some((c) => c.trim())) continue
    const key = rowData.join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    dataRows.push(rowData)
  }

  if (!dataRows.length) return { error: 'No data rows found', rows: [] }

  const colCount = dataRows[0].length
  if (!headers.length) {
    headers = Array.from({ length: colCount }, (_, i) => `Column_${i + 1}`)
  } else if (headers.length < colCount) {
    for (let i = headers.length; i < colCount; i++) headers.push(`Column_${i + 1}`)
  } else if (headers.length > colCount) {
    headers = headers.slice(0, colCount)
  }

  const rows = dataRows.map((cells) => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? ''
    })
    return obj
  })

  return { error: null, rows, headers: headers.slice(0, colCount) }
}

/** Parse DD/MM/YYYY HH:MM:SS */
export function parseDateTime(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, dd, mm, yyyy, hh, min, ss] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss))
  return Number.isNaN(d.getTime()) ? null : d
}

export function findColumn(columns, ...patterns) {
  for (const col of columns) {
    const lower = col.toLowerCase()
    if (patterns.every((p) => lower.includes(p))) return col
  }
  for (const col of columns) {
    const lower = col.toLowerCase()
    if (patterns.some((p) => lower.includes(p))) return col
  }
  return null
}

export function enrichTransactionRows(rows, columns) {
  const datetimeCol = findColumn(columns, 'date', 'time') || findColumn(columns, 'date')
  const statusCol = findColumn(columns, 'status')
  const amountCol =
    findColumn(columns, 'transaction amount') || findColumn(columns, 'amount')

  const enriched = rows
    .map((row) => {
      const parsedDateTime = datetimeCol ? parseDateTime(row[datetimeCol]) : null
      const status = statusCol ? String(row[statusCol] || '').trim() : ''
      let transactionAmount = null
      if (amountCol) {
        const raw = String(row[amountCol] || '')
          .replace(/,/g, '')
          .replace(/\s/g, '')
        const n = Number(raw)
        transactionAmount = Number.isFinite(n) ? n : null
      }
      return {
        ...row,
        parsedDateTime,
        status,
        transactionAmount,
      }
    })
    .filter((r) => r.parsedDateTime)

  return { rows: enriched, datetimeCol, statusCol, amountCol }
}

export function addTimeBucket(rows, filterType) {
  const groupCol =
    filterType === 'Day' ? 'dayBucket' : filterType === 'Hour' ? 'hourBucket' : 'minuteBucket'
  const xLabel = filterType

  const bucketed = rows.map((row) => {
    const d = row.parsedDateTime
    if (!d) return { ...row, [groupCol]: null }

    const pad = (n) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    let bucket
    if (filterType === 'Day') {
      bucket = date
    } else if (filterType === 'Hour') {
      bucket = `${date} ${pad(d.getHours())}:00`
    } else {
      bucket = `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    return { ...row, [groupCol]: bucket }
  })

  return { rows: bucketed, groupCol, xLabel }
}

export function countByGroupAndStatus(rows, groupCol) {
  const map = new Map()
  for (const row of rows) {
    if (!row[groupCol] || !row.status) continue
    const key = `${row[groupCol]}|${row.status}`
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].map(([key, count]) => {
    const idx = key.lastIndexOf('|')
    return { bucket: key.slice(0, idx), status: key.slice(idx + 1), count }
  })
}

export function rateByGroupAndStatus(rows, groupCol) {
  const counts = countByGroupAndStatus(rows, groupCol)
  const totals = new Map()
  for (const { bucket, count } of counts) {
    totals.set(bucket, (totals.get(bucket) || 0) + count)
  }
  return counts.map(({ bucket, status, count }) => ({
    bucket,
    status,
    count,
    total: totals.get(bucket) || 0,
    rate: totals.get(bucket) ? Math.round((count / totals.get(bucket)) * 10000) / 100 : 0,
  }))
}

export function sumAmountByGroupAndStatus(rows, groupCol) {
  const map = new Map()
  for (const row of rows) {
    if (!row[groupCol] || !row.status || row.transactionAmount == null) continue
    const key = `${row[groupCol]}|${row.status}`
    map.set(key, (map.get(key) || 0) + row.transactionAmount)
  }
  return [...map.entries()].map(([key, totalAmount]) => {
    const idx = key.lastIndexOf('|')
    return { bucket: key.slice(0, idx), status: key.slice(idx + 1), totalAmount }
  })
}

export function sumAmountByStatus(rows) {
  const map = new Map()
  for (const row of rows) {
    if (!row.status || row.transactionAmount == null) continue
    map.set(row.status, (map.get(row.status) || 0) + row.transactionAmount)
  }
  return [...map.entries()].map(([status, totalAmount]) => ({ status, totalAmount }))
}

export function computeSuccessRate(rows, groupCol) {
  const buckets = [...new Set(rows.map((r) => r[groupCol]).filter(Boolean))].sort()
  const statusCounts = countByGroupAndStatus(rows, groupCol)

  return buckets.map((bucket) => {
    const slice = statusCounts.filter((c) => c.bucket === bucket)
    const get = (s) => slice.find((x) => x.status === s)?.count || 0
    const approved = get('Approved')
    const settled = get('Settled')
    const rejected = get('Rejected')
    const expired = get('Payment Expired')
    const srCount = approved + settled
    const denom = approved + settled + rejected + expired
    return {
      bucket,
      srCount,
      srRate: denom > 0 ? Math.round((srCount / denom) * 10000) / 100 : 0,
    }
  })
}

export function computeProfileStats(rows) {
  const statuses = rows.map((r) => r.status).filter(Boolean)
  const amounts = rows.map((r) => r.transactionAmount).filter((n) => n != null)
  const dates = rows.map((r) => r.parsedDateTime).filter(Boolean)

  const statusCounts = {}
  for (const s of statuses) statusCounts[s] = (statusCounts[s] || 0) + 1

  return {
    total: rows.length,
    totalAmount: amounts.reduce((a, b) => a + b, 0),
    approved: statusCounts.Approved || 0,
    rejected: statusCounts.Rejected || 0,
    statusCounts,
    dateMin: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
    dateMax: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    amountStats:
      amounts.length > 0
        ? {
            min: Math.min(...amounts),
            max: Math.max(...amounts),
            mean: amounts.reduce((a, b) => a + b, 0) / amounts.length,
          }
        : null,
  }
}

export function pivotTable(data, indexKey, columnKey, valueKey) {
  const buckets = [...new Set(data.map((d) => d[indexKey]))].sort()
  const cols = [...new Set(data.map((d) => d[columnKey]))].sort()
  const lookup = new Map(data.map((d) => [`${d[indexKey]}|${d[columnKey]}`, d[valueKey]]))
  return {
    buckets,
    cols,
    rows: buckets.map((bucket) => ({
      bucket,
      values: Object.fromEntries(cols.map((c) => [c, lookup.get(`${bucket}|${c}`) ?? 0])),
    })),
  }
}

export function formatDateTime(d) {
  if (!d) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

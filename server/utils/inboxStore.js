import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { getSupabaseAdmin, isMerchantStoreConfigured } from './merchantStore.js'

const MAX_INBOX = Number(process.env.INBOX_MAX_ITEMS) || 2000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

const HEADER_DENY = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-vault-token',
])

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const JWT_FIELD_NAMES = ['payload', 'paymentToken', 'token', 'jwt', 'webhook-jwt', 'paymentResponse']
const INVOICE_KEYS = ['invoiceNo', 'invoiceNumber', 'invoice', 'invoiceID', 'invoiceId']

/** In-memory fallback when Supabase / DATABASE_URL is not configured. */
const memoryByUser = new Map()
const GLOBAL_KEY = '__global__'

function memoryKey(userId) {
  return userId ? String(userId) : GLOBAL_KEY
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    if (HEADER_DENY.has(String(k).toLowerCase())) continue
    out[k] = v
  }
  return out
}

function looksLikeJwt(value) {
  return typeof value === 'string' && JWT_RE.test(value.trim())
}

function findJwtInValue(value, depth = 0) {
  if (depth > 3 || value == null) return null
  if (looksLikeJwt(value)) return value.trim()
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const key of JWT_FIELD_NAMES) {
      if (key in value && looksLikeJwt(value[key])) return String(value[key]).trim()
    }
    for (const v of Object.values(value)) {
      const found = findJwtInValue(v, depth + 1)
      if (found) return found
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJwtInValue(item, depth + 1)
      if (found) return found
    }
  }
  return null
}

function invoiceFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null
  for (const k of INVOICE_KEYS) {
    const v = obj[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

function tryDecodeJwt(token) {
  try {
    return jwt.decode(token)
  } catch {
    return null
  }
}

/** Best-effort extract invoiceNo from query / body / JWT payload for search. */
export function extractInvoiceNo({ query, body, headers } = {}) {
  const fromQuery = invoiceFromObject(query)
  if (fromQuery) return fromQuery

  if (body && typeof body === 'object') {
    const direct = invoiceFromObject(body)
    if (direct) return direct
    const jwtTok = findJwtInValue(body)
    if (jwtTok) {
      const decoded = tryDecodeJwt(jwtTok)
      const fromJwt = invoiceFromObject(decoded)
      if (fromJwt) return fromJwt
    }
  }

  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (looksLikeJwt(trimmed)) {
      const fromJwt = invoiceFromObject(tryDecodeJwt(trimmed))
      if (fromJwt) return fromJwt
    }
    try {
      const parsed = JSON.parse(trimmed)
      const direct = invoiceFromObject(parsed)
      if (direct) return direct
      const jwtTok = findJwtInValue(parsed)
      if (jwtTok) {
        const fromJwt = invoiceFromObject(tryDecodeJwt(jwtTok))
        if (fromJwt) return fromJwt
      }
    } catch {
      /* ignore */
    }
  }

  if (headers && typeof headers === 'object') {
    const lower = {}
    for (const [k, v] of Object.entries(headers)) lower[String(k).toLowerCase()] = v
    for (const key of ['webhook-jwt', 'x-webhook-jwt']) {
      const val = lower[key]
      if (looksLikeJwt(val)) {
        const fromJwt = invoiceFromObject(tryDecodeJwt(String(val).trim()))
        if (fromJwt) return fromJwt
      }
    }
  }

  return null
}

function mapInboxRow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id || null,
    receivedAt: row.received_at,
    method: row.method,
    path: row.path,
    query: row.query || {},
    headers: row.headers || {},
    body: row.body ?? null,
    ip: row.ip || null,
    invoiceNo: row.invoice_no || null,
  }
}

function trimMemory(list) {
  if (list.length > MAX_INBOX) list.length = MAX_INBOX
}

function pushMemory(userId, entry) {
  const key = memoryKey(userId)
  const list = memoryByUser.get(key) || []
  list.unshift(entry)
  trimMemory(list)
  memoryByUser.set(key, list)
  return entry
}

function collectMemory(userId) {
  const own = memoryByUser.get(memoryKey(userId)) || []
  const shared = userId ? memoryByUser.get(GLOBAL_KEY) || [] : []
  return [...own, ...shared].sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
}

function filterMemory(list, { invoiceNo, from, to, method, pathFilter } = {}) {
  const inv = String(invoiceNo || '').trim().toLowerCase()
  const fromMs = from ? new Date(from).getTime() : null
  const toMs = to ? new Date(to).getTime() : null
  const methodUpper = method && method !== 'all' ? String(method).toUpperCase() : null
  const pathF = pathFilter && pathFilter !== 'all' ? String(pathFilter).toLowerCase() : null

  return list.filter((r) => {
    if (inv) {
      const hay = String(r.invoiceNo || '').toLowerCase()
      if (!hay.includes(inv)) return false
    }
    if (fromMs && Number.isFinite(fromMs)) {
      if (new Date(r.receivedAt).getTime() < fromMs) return false
    }
    if (toMs && Number.isFinite(toMs)) {
      if (new Date(r.receivedAt).getTime() > toMs) return false
    }
    if (methodUpper && r.method !== methodUpper) return false
    if (pathF) {
      const p = String(r.path || '').toLowerCase()
      if (pathF === 'callback' && !p.includes('callback')) return false
      if (pathF === 'pos' && !p.includes('pos-standalone')) return false
      if (pathF === 'hook' && !p.includes('/hook')) return false
    }
    return true
  })
}

/**
 * Persist an inbound webhook/callback.
 */
export async function saveInboxRequest({
  userId = null,
  method,
  path,
  query = {},
  headers = {},
  body = null,
  ip = null,
  id = null,
  receivedAt = null,
}) {
  const cleanHeaders = sanitizeHeaders(headers)
  const invoiceNo = extractInvoiceNo({ query, body, headers: cleanHeaders })
  const entry = {
    id: id || crypto.randomUUID(),
    userId: userId || null,
    receivedAt: receivedAt || new Date().toISOString(),
    method: String(method || 'GET').toUpperCase(),
    path: String(path || ''),
    query: query && typeof query === 'object' ? query : {},
    headers: cleanHeaders,
    body: body ?? null,
    ip: ip ? String(ip) : null,
    invoiceNo,
  }

  if (!isMerchantStoreConfigured()) {
    return pushMemory(userId, entry)
  }

  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('inbox_requests')
      .insert({
        id: entry.id,
        user_id: entry.userId,
        received_at: entry.receivedAt,
        method: entry.method,
        path: entry.path,
        query: entry.query,
        headers: entry.headers,
        body: entry.body,
        ip: entry.ip,
        invoice_no: entry.invoiceNo,
      })
      .select('id, user_id, received_at, method, path, query, headers, body, ip, invoice_no')
      .single()
    if (error) {
      console.error('[inbox] save failed, falling back to memory', error.message)
      return pushMemory(userId, entry)
    }
    pruneInbox(userId).catch(() => {})
    return mapInboxRow(data)
  }

  return pushMemory(userId, entry)
}

async function pruneInbox(userId) {
  const admin = getSupabaseAdmin()
  if (!admin) return

  let q = admin
    .from('inbox_requests')
    .select('id')
    .order('received_at', { ascending: false })
    .range(MAX_INBOX, MAX_INBOX + 100)

  if (userId) q = q.eq('user_id', userId)
  else q = q.is('user_id', null)

  const { data, error } = await q
  if (error || !data?.length) return
  await admin.from('inbox_requests').delete().in(
    'id',
    data.map((r) => r.id)
  )
}

function normalizeListOpts(opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(opts.pageSize) || DEFAULT_PAGE_SIZE))
  return {
    page,
    pageSize,
    invoiceNo: String(opts.invoiceNo || '').trim(),
    from: opts.from || '',
    to: opts.to || '',
    method: opts.method || 'all',
    pathFilter: opts.pathFilter || 'all',
  }
}

/**
 * Paginated inbox list.
 * @returns {{ requests, total, page, pageSize, totalPages }}
 */
export async function listInboxRequests(userId, opts = {}) {
  const { page, pageSize, invoiceNo, from, to, method, pathFilter } = normalizeListOpts(opts)
  const offset = (page - 1) * pageSize

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const filtered = filterMemory(collectMemory(userId), { invoiceNo, from, to, method, pathFilter })
    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return {
      requests: filtered.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  const admin = getSupabaseAdmin()
  let q = admin
    .from('inbox_requests')
    .select('id, user_id, received_at, method, path, query, headers, body, ip, invoice_no', {
      count: 'exact',
    })
    .or(userId ? `user_id.eq.${userId},user_id.is.null` : 'user_id.is.null')
    .order('received_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (invoiceNo) q = q.ilike('invoice_no', `%${invoiceNo}%`)
  if (from) q = q.gte('received_at', new Date(from).toISOString())
  if (to) {
    // If `to` is date-only (YYYY-MM-DD), include the whole day
    const toDate = String(to).length <= 10 ? `${to}T23:59:59.999Z` : to
    q = q.lte('received_at', new Date(toDate).toISOString())
  }
  if (method && method !== 'all') q = q.eq('method', String(method).toUpperCase())
  if (pathFilter && pathFilter !== 'all') {
    if (pathFilter === 'callback') q = q.ilike('path', '%callback%')
    else if (pathFilter === 'pos') q = q.ilike('path', '%pos-standalone%')
    else if (pathFilter === 'hook') q = q.ilike('path', '%/hook%')
  }

  const { data, error, count } = await q
  if (error) {
    console.error('[inbox] list failed', error.message)
    const filtered = filterMemory(collectMemory(userId), { invoiceNo, from, to, method, pathFilter })
    const total = filtered.length
    return {
      requests: filtered.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  const total = count ?? 0
  return {
    requests: (data || []).map(mapInboxRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
  }
}

export async function clearInboxRequests(userId) {
  if (!isMerchantStoreConfigured()) {
    memoryByUser.set(memoryKey(userId), [])
    if (userId) memoryByUser.set(GLOBAL_KEY, [])
    return { deleted: true }
  }

  const admin = getSupabaseAdmin()
  if (!admin) {
    memoryByUser.set(memoryKey(userId), [])
    return { deleted: true }
  }

  if (userId) {
    await admin.from('inbox_requests').delete().eq('user_id', userId)
  } else {
    await admin.from('inbox_requests').delete().is('user_id', null)
  }
  memoryByUser.set(memoryKey(userId), [])
  return { deleted: true }
}

export async function countInboxSince(userId, sinceIso) {
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const list = collectMemory(userId)
    if (!sinceIso) return list.length
    const since = new Date(sinceIso).getTime()
    if (!Number.isFinite(since)) return list.length
    return list.filter((r) => new Date(r.receivedAt).getTime() > since).length
  }

  const admin = getSupabaseAdmin()
  let q = admin
    .from('inbox_requests')
    .select('id', { count: 'exact', head: true })
    .or(userId ? `user_id.eq.${userId},user_id.is.null` : 'user_id.is.null')

  if (sinceIso) q = q.gt('received_at', sinceIso)

  const { count, error } = await q
  if (error) {
    console.error('[inbox] count failed', error.message)
    return 0
  }
  return count || 0
}

/** Extract UUID from paths like …/hook/u/<uuid>/… or …/callback/frontend/u/<uuid> */
export function extractInboxUserIdFromPath(pathname) {
  const m = String(pathname || '').match(
    /\/u\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$|\?)/i
  )
  return m ? m[1] : null
}

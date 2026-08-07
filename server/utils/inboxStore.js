import crypto from 'crypto'
import { getSupabaseAdmin, isMerchantStoreConfigured } from './merchantStore.js'

const MAX_INBOX = Number(process.env.INBOX_MAX_ITEMS) || 200
const HEADER_DENY = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-vault-token',
])

/** In-memory fallback when Supabase / DATABASE_URL is not configured. */
const memoryByUser = new Map() // userKey -> entries[]
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

/**
 * Persist an inbound webhook/callback.
 * @param {object} partial
 * @param {string|null} [partial.userId]
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
  const entry = {
    id: id || crypto.randomUUID(),
    userId: userId || null,
    receivedAt: receivedAt || new Date().toISOString(),
    method: String(method || 'GET').toUpperCase(),
    path: String(path || ''),
    query: query && typeof query === 'object' ? query : {},
    headers: sanitizeHeaders(headers),
    body: body ?? null,
    ip: ip ? String(ip) : null,
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
      })
      .select('id, user_id, received_at, method, path, query, headers, body, ip')
      .single()
    if (error) {
      console.error('[inbox] save failed, falling back to memory', error.message)
      return pushMemory(userId, entry)
    }
    // Best-effort prune old rows for this user (and global bucket)
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
    .select('id, received_at')
    .order('received_at', { ascending: false })
    .range(MAX_INBOX, MAX_INBOX + 50)

  if (userId) q = q.eq('user_id', userId)
  else q = q.is('user_id', null)

  const { data, error } = await q
  if (error || !data?.length) return

  const ids = data.map((r) => r.id)
  await admin.from('inbox_requests').delete().in('id', ids)
}

export async function listInboxRequests(userId, { limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), MAX_INBOX)

  if (!isMerchantStoreConfigured()) {
    const own = memoryByUser.get(memoryKey(userId)) || []
    const shared = userId ? memoryByUser.get(GLOBAL_KEY) || [] : []
    const merged = [...own, ...shared]
      .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      .slice(0, lim)
    return merged
  }

  const admin = getSupabaseAdmin()
  if (!admin) {
    return memoryByUser.get(memoryKey(userId)) || []
  }

  // User-scoped inbox + legacy unscoped (null) so old webhook URLs still show up
  const { data, error } = await admin
    .from('inbox_requests')
    .select('id, user_id, received_at, method, path, query, headers, body, ip')
    .or(userId ? `user_id.eq.${userId},user_id.is.null` : 'user_id.is.null')
    .order('received_at', { ascending: false })
    .limit(lim)

  if (error) {
    console.error('[inbox] list failed', error.message)
    const own = memoryByUser.get(memoryKey(userId)) || []
    return own.slice(0, lim)
  }
  return (data || []).map(mapInboxRow)
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

  // Clear only this user's inbox (unscoped legacy rows stay for other clients)
  if (userId) {
    await admin.from('inbox_requests').delete().eq('user_id', userId)
  } else {
    await admin.from('inbox_requests').delete().is('user_id', null)
  }
  memoryByUser.set(memoryKey(userId), [])
  return { deleted: true }
}

export async function countInboxSince(userId, sinceIso) {
  const list = await listInboxRequests(userId, { limit: MAX_INBOX })
  if (!sinceIso) return list.length
  const since = new Date(sinceIso).getTime()
  if (!Number.isFinite(since)) return list.length
  return list.filter((r) => new Date(r.receivedAt).getTime() > since).length
}

/** Extract UUID from paths like …/hook/u/<uuid>/… or …/callback/frontend/u/<uuid> */
export function extractInboxUserIdFromPath(pathname) {
  const m = String(pathname || '').match(/\/u\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$|\?)/i)
  return m ? m[1] : null
}

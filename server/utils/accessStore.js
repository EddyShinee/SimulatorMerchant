import { getSupabaseAdmin, isMerchantStoreConfigured } from './merchantStore.js'
import { FEATURE_KEYS, DEFAULT_FEATURE_MAP, ROLES } from '../../src/config/accessControl.js'

const memoryProfiles = new Map()
const memoryFeatures = { ...DEFAULT_FEATURE_MAP }

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function mapFeatureRows(rows) {
  const map = { ...DEFAULT_FEATURE_MAP }
  for (const row of rows || []) {
    if (row?.key) map[row.key] = row.enabled !== false
  }
  return map
}

async function countAdmins() {
  if (isMerchantStoreConfigured() && getSupabaseAdmin()) {
    const { count, error } = await getSupabaseAdmin()
      .from('app_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', ROLES.admin)
    if (error) {
      console.error('[access] count admins', error.message)
      return memoryProfiles.size
        ? [...memoryProfiles.values()].filter((p) => p.role === ROLES.admin).length
        : 0
    }
    return count ?? 0
  }
  return [...memoryProfiles.values()].filter((p) => p.role === ROLES.admin).length
}

export async function ensureAppProfile({ id, email }) {
  const uid = String(id || '')
  const mail = String(email || '').trim().toLowerCase()
  if (!uid) return { id: uid, email: mail, role: ROLES.member }

  const bootstrapAdmin = adminEmails().includes(mail) || (await countAdmins()) === 0
  const desiredRole = bootstrapAdmin ? ROLES.admin : ROLES.member

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const existing = memoryProfiles.get(uid)
    const role = existing?.role || desiredRole
    const profile = { id: uid, email: mail || existing?.email || '', role }
    memoryProfiles.set(uid, profile)
    return profile
  }

  const admin = getSupabaseAdmin()
  const { data: existing } = await admin
    .from('app_profiles')
    .select('id, email, role')
    .eq('id', uid)
    .maybeSingle()

  if (existing?.id) {
    let role = existing.role === ROLES.admin ? ROLES.admin : ROLES.member
    if (adminEmails().includes(mail) && role !== ROLES.admin) role = ROLES.admin
    if (existing.email !== mail || existing.role !== role) {
      await admin.from('app_profiles').update({ email: mail || existing.email, role }).eq('id', uid)
    }
    return { id: uid, email: mail || existing.email, role }
  }

  const { data, error } = await admin
    .from('app_profiles')
    .insert({ id: uid, email: mail, role: desiredRole })
    .select('id, email, role')
    .single()

  if (error) {
    console.error('[access] ensure profile', error.message)
    return { id: uid, email: mail, role: desiredRole }
  }
  return { id: data.id, email: data.email, role: data.role === ROLES.admin ? ROLES.admin : ROLES.member }
}

export async function getFeatureMap() {
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    return { ...memoryFeatures }
  }
  const { data, error } = await getSupabaseAdmin().from('app_features').select('key, enabled')
  if (error) {
    console.error('[access] list features', error.message)
    return { ...DEFAULT_FEATURE_MAP }
  }
  return mapFeatureRows(data)
}

export async function setFeatureEnabled(key, enabled, updatedBy) {
  const k = decodeURIComponent(String(key || '')).trim()
  if (!k || k === 'dashboard' || !FEATURE_KEYS.includes(k)) {
    const err = new Error('This feature cannot be changed.')
    err.code = 'FEATURE_LOCKED'
    throw err
  }
  const on = Boolean(enabled)

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    memoryFeatures[k] = on
    return { key: k, enabled: on }
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('app_features')
    .upsert({
      key: k,
      enabled: on,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || null,
    })
    .select('key, enabled')
    .single()

  if (error) {
    console.error('[access] update feature', error.message)
    throw new Error('Failed to update feature flag.')
  }
  return { key: data.key, enabled: Boolean(data.enabled) }
}

export async function listAppUsers() {
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    return [...memoryProfiles.values()].sort((a, b) => a.email.localeCompare(b.email))
  }
  const { data, error } = await getSupabaseAdmin()
    .from('app_profiles')
    .select('id, email, role, created_at')
    .order('email', { ascending: true })
  if (error) {
    console.error('[access] list users', error.message)
    throw new Error('Failed to load users.')
  }
  return (data || []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role === ROLES.admin ? ROLES.admin : ROLES.member,
    createdAt: row.created_at,
  }))
}

export async function setUserRole(userId, role, actorId) {
  const next = role === ROLES.admin ? ROLES.admin : ROLES.member
  const uid = String(userId || '')

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const profile = memoryProfiles.get(uid)
    if (!profile) {
      const err = new Error('User not found.')
      err.code = 'NOT_FOUND'
      throw err
    }
    if (next === ROLES.member && profile.role === ROLES.admin) {
      const admins = [...memoryProfiles.values()].filter((p) => p.role === ROLES.admin)
      if (admins.length <= 1) {
        const err = new Error('Cannot remove the last admin.')
        err.code = 'LAST_ADMIN'
        throw err
      }
    }
    profile.role = next
    memoryProfiles.set(uid, profile)
    return profile
  }

  const admin = getSupabaseAdmin()
  const { data: existing, error: readErr } = await admin
    .from('app_profiles')
    .select('id, email, role')
    .eq('id', uid)
    .maybeSingle()

  if (readErr || !existing) {
    const err = new Error('User not found.')
    err.code = 'NOT_FOUND'
    throw err
  }

  if (next === ROLES.member && existing.role === ROLES.admin) {
    const n = await countAdmins()
    if (n <= 1) {
      const err = new Error('Cannot remove the last admin.')
      err.code = 'LAST_ADMIN'
      throw err
    }
  }

  const { data, error } = await admin
    .from('app_profiles')
    .update({ role: next })
    .eq('id', uid)
    .select('id, email, role')
    .single()

  if (error) {
    console.error('[access] set role', error.message, actorId)
    throw new Error('Failed to update role.')
  }
  return { id: data.id, email: data.email, role: data.role === ROLES.admin ? ROLES.admin : ROLES.member }
}

export function featureEnabled(map, key, role) {
  if (role === ROLES.admin) return true
  if (!key || key === 'dashboard') return true
  return map?.[key] !== false
}

/** Global flag (no admin bypass) — registration, merchant-vault, etc. */
export function isFlagOn(map, key) {
  if (!key || key === 'dashboard') return true
  return map?.[key] !== false
}

export async function assertFlagOn(key) {
  const map = await getFeatureMap()
  if (!isFlagOn(map, key)) {
    const err = new Error('This feature is currently disabled.')
    err.code = 'FEATURE_DISABLED'
    throw err
  }
}

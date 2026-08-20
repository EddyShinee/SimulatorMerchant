import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin, isMerchantStoreConfigured } from './merchantStore.js'
import { isSupabaseConfigured } from './supabaseClient.js'
import { createUser, findUserByEmail, findUserById, initUsersDb, updateUserPasswordHash } from './usersDb.js'
import {
  FEATURE_KEYS,
  DEFAULT_FEATURE_MAP,
  ROLES,
  USER_STATUS,
  normalizeFeatureEntry,
  normalizeFeatureMap,
  isFeatureEnabledForRole,
  defaultRoleFlags,
} from '../../src/config/accessControl.js'

const memoryProfiles = new Map()
const memoryFeatures = normalizeFeatureMap(DEFAULT_FEATURE_MAP)

function nowIso() {
  return new Date().toISOString()
}

export function normalizeStatus(status) {
  return status === USER_STATUS.blocked ? USER_STATUS.blocked : USER_STATUS.active
}

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    role: row.role === ROLES.admin ? ROLES.admin : ROLES.member,
    status: normalizeStatus(row.status),
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
  }
}

const PROFILE_COLUMNS = 'id, email, role, status, created_at, updated_at, last_login_at'

function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function mapFeatureRows(rows) {
  const map = normalizeFeatureMap({})
  for (const row of rows || []) {
    if (!row?.key) continue
    if (row.admin_enabled != null || row.member_enabled != null) {
      map[row.key] = {
        admin: row.admin_enabled !== false,
        member: row.member_enabled !== false,
      }
      continue
    }
    // Legacy single `enabled` column
    map[row.key] = defaultRoleFlags(row.enabled !== false)
  }
  return map
}

async function countActiveAdmins() {
  if (isMerchantStoreConfigured() && getSupabaseAdmin()) {
    const { count, error } = await getSupabaseAdmin()
      .from('app_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', ROLES.admin)
      .neq('status', USER_STATUS.blocked)
    if (error) {
      console.error('[access] count admins', error.message)
      return [...memoryProfiles.values()].filter(
        (p) => p.role === ROLES.admin && normalizeStatus(p.status) !== USER_STATUS.blocked
      ).length
    }
    return count ?? 0
  }
  return [...memoryProfiles.values()].filter(
    (p) => p.role === ROLES.admin && normalizeStatus(p.status) !== USER_STATUS.blocked
  ).length
}

export async function ensureAppProfile({ id, email }) {
  const uid = String(id || '')
  const mail = String(email || '').trim().toLowerCase()
  if (!uid) return { id: uid, email: mail, role: ROLES.member }

  const bootstrapAdmin = adminEmails().includes(mail) || (await countActiveAdmins()) === 0
  const desiredRole = bootstrapAdmin ? ROLES.admin : ROLES.member

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const existing = memoryProfiles.get(uid)
    const role = existing?.role || desiredRole
    const profile = mapProfile({
      id: uid,
      email: mail || existing?.email || '',
      role,
      status: existing?.status || USER_STATUS.active,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: existing?.updatedAt || nowIso(),
      lastLoginAt: existing?.lastLoginAt || null,
    })
    memoryProfiles.set(uid, profile)
    return profile
  }

  const admin = getSupabaseAdmin()
  const { data: existing } = await admin
    .from('app_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', uid)
    .maybeSingle()

  if (existing?.id) {
    let role = existing.role === ROLES.admin ? ROLES.admin : ROLES.member
    if (adminEmails().includes(mail) && role !== ROLES.admin) role = ROLES.admin
    if ((mail && existing.email !== mail) || existing.role !== role) {
      const { data: updated } = await admin
        .from('app_profiles')
        .update({ email: mail || existing.email, role, updated_at: nowIso() })
        .eq('id', uid)
        .select(PROFILE_COLUMNS)
        .single()
      return mapProfile(updated || { ...existing, email: mail || existing.email, role })
    }
    return mapProfile(existing)
  }

  const createdAt = nowIso()
  const { data, error } = await admin
    .from('app_profiles')
    .insert({
      id: uid,
      email: mail,
      role: desiredRole,
      status: USER_STATUS.active,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select(PROFILE_COLUMNS)
    .single()

  if (error) {
    console.error('[access] ensure profile', error.message)
    return mapProfile({
      id: uid,
      email: mail,
      role: desiredRole,
      status: USER_STATUS.active,
      created_at: createdAt,
      updated_at: createdAt,
      last_login_at: null,
    })
  }
  return mapProfile(data)
}

export async function getFeatureMap() {
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    return normalizeFeatureMap(memoryFeatures)
  }
  const { data, error } = await getSupabaseAdmin()
    .from('app_features')
    .select('key, enabled, admin_enabled, member_enabled')
  if (error) {
    console.error('[access] list features', error.message)
    return normalizeFeatureMap({})
  }
  return mapFeatureRows(data)
}

export async function setFeatureEnabled(key, role, enabled, updatedBy) {
  const k = decodeURIComponent(String(key || '')).trim()
  const r = role === ROLES.admin ? ROLES.admin : role === ROLES.member ? ROLES.member : ''
  if (!k || k === 'dashboard' || !FEATURE_KEYS.includes(k) || !r) {
    const err = new Error('This feature cannot be changed.')
    err.code = 'FEATURE_LOCKED'
    throw err
  }
  const on = Boolean(enabled)

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const current = normalizeFeatureEntry(memoryFeatures[k])
    current[r] = on
    memoryFeatures[k] = current
    return { key: k, ...current }
  }

  const admin = getSupabaseAdmin()
  const map = await getFeatureMap()
  const current = normalizeFeatureEntry(map[k])
  current[r] = on

  const { data, error } = await admin
    .from('app_features')
    .upsert({
      key: k,
      enabled: current.admin && current.member,
      admin_enabled: current.admin,
      member_enabled: current.member,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || null,
    })
    .select('key, admin_enabled, member_enabled')
    .single()

  if (error) {
    console.error('[access] update feature', error.message)
    throw new Error('Failed to update feature flag.')
  }
  return {
    key: data.key,
    admin: data.admin_enabled !== false,
    member: data.member_enabled !== false,
  }
}

export async function listAppUsers() {
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    return [...memoryProfiles.values()].map(mapProfile).sort((a, b) => a.email.localeCompare(b.email))
  }
  const { data, error } = await getSupabaseAdmin()
    .from('app_profiles')
    .select(PROFILE_COLUMNS)
    .order('email', { ascending: true })
  if (error) {
    console.error('[access] list users', error.message)
    throw new Error('Failed to load users.')
  }
  return (data || []).map(mapProfile)
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
      const admins = [...memoryProfiles.values()].filter(
        (p) => p.role === ROLES.admin && normalizeStatus(p.status) !== USER_STATUS.blocked
      )
      if (admins.length <= 1) {
        const err = new Error('Cannot remove the last admin.')
        err.code = 'LAST_ADMIN'
        throw err
      }
    }
    profile.role = next
    profile.updatedAt = nowIso()
    memoryProfiles.set(uid, profile)
    return mapProfile(profile)
  }

  const admin = getSupabaseAdmin()
  const { data: existing, error: readErr } = await admin
    .from('app_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', uid)
    .maybeSingle()

  if (readErr || !existing) {
    const err = new Error('User not found.')
    err.code = 'NOT_FOUND'
    throw err
  }

  if (next === ROLES.member && existing.role === ROLES.admin) {
    const n = await countActiveAdmins()
    if (n <= 1) {
      const err = new Error('Cannot remove the last admin.')
      err.code = 'LAST_ADMIN'
      throw err
    }
  }

  const { data, error } = await admin
    .from('app_profiles')
    .update({ role: next, updated_at: nowIso() })
    .eq('id', uid)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) {
    console.error('[access] set role', error.message, actorId)
    throw new Error('Failed to update role.')
  }
  return mapProfile(data)
}

export async function getAppProfile(userId) {
  const uid = String(userId || '')
  if (!uid) return null
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    return memoryProfiles.get(uid) ? mapProfile(memoryProfiles.get(uid)) : null
  }
  const { data, error } = await getSupabaseAdmin()
    .from('app_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', uid)
    .maybeSingle()
  if (error) {
    console.error('[access] get profile', error.message)
    return null
  }
  return mapProfile(data)
}

export async function recordLastLogin(userId) {
  const uid = String(userId || '')
  if (!uid) return
  const ts = nowIso()
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const profile = memoryProfiles.get(uid)
    if (profile) {
      profile.lastLoginAt = ts
      memoryProfiles.set(uid, profile)
    }
    return
  }
  const { error } = await getSupabaseAdmin().from('app_profiles').update({ last_login_at: ts }).eq('id', uid)
  if (error) console.error('[access] last login', error.message)
}

export async function touchProfileUpdated(userId) {
  const uid = String(userId || '')
  if (!uid) return
  const ts = nowIso()
  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const profile = memoryProfiles.get(uid)
    if (profile) {
      profile.updatedAt = ts
      memoryProfiles.set(uid, profile)
    }
    return
  }
  const { error } = await getSupabaseAdmin().from('app_profiles').update({ updated_at: ts }).eq('id', uid)
  if (error) console.error('[access] touch updated', error.message)
}

export async function assertAccountActive(userId) {
  const profile = await getAppProfile(userId)
  if (profile && normalizeStatus(profile.status) === USER_STATUS.blocked) {
    const err = new Error('This account is blocked.')
    err.code = 'ACCOUNT_BLOCKED'
    throw err
  }
  return profile
}

export async function setUserStatus(userId, status, actorId) {
  const next = normalizeStatus(status)
  const uid = String(userId || '')
  const actor = String(actorId || '')

  if (uid && actor && uid === actor && next === USER_STATUS.blocked) {
    const err = new Error('You cannot block your own account.')
    err.code = 'SELF_BLOCK'
    throw err
  }

  if (!isMerchantStoreConfigured() || !getSupabaseAdmin()) {
    const profile = memoryProfiles.get(uid)
    if (!profile) {
      const err = new Error('User not found.')
      err.code = 'NOT_FOUND'
      throw err
    }
    if (
      next === USER_STATUS.blocked &&
      profile.role === ROLES.admin &&
      normalizeStatus(profile.status) !== USER_STATUS.blocked
    ) {
      const admins = [...memoryProfiles.values()].filter(
        (p) => p.role === ROLES.admin && normalizeStatus(p.status) !== USER_STATUS.blocked
      )
      if (admins.length <= 1) {
        const err = new Error('Cannot block the last admin.')
        err.code = 'LAST_ADMIN'
        throw err
      }
    }
    profile.status = next
    profile.updatedAt = nowIso()
    memoryProfiles.set(uid, profile)
    return mapProfile(profile)
  }

  const admin = getSupabaseAdmin()
  const { data: existing, error: readErr } = await admin
    .from('app_profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', uid)
    .maybeSingle()

  if (readErr || !existing) {
    const err = new Error('User not found.')
    err.code = 'NOT_FOUND'
    throw err
  }

  if (next === USER_STATUS.blocked && existing.role === ROLES.admin && normalizeStatus(existing.status) !== USER_STATUS.blocked) {
    const n = await countActiveAdmins()
    if (n <= 1) {
      const err = new Error('Cannot block the last admin.')
      err.code = 'LAST_ADMIN'
      throw err
    }
  }

  const { data, error } = await admin
    .from('app_profiles')
    .update({ status: next, updated_at: nowIso() })
    .eq('id', uid)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) {
    console.error('[access] set status', error.message, actor)
    throw new Error('Failed to update status.')
  }
  return mapProfile(data)
}

export async function setUserPassword(userId, password) {
  const uid = String(userId || '')
  const pwd = String(password || '')
  if (pwd.length < 6) {
    const err = new Error('Password must be at least 6 characters.')
    err.code = 'WEAK_PASSWORD'
    throw err
  }

  const profile = await getAppProfile(uid)
  if (!profile) {
    const err = new Error('User not found.')
    err.code = 'NOT_FOUND'
    throw err
  }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (!admin) {
      const err = new Error('Supabase service role is required to update passwords.')
      err.code = 'STORE_UNAVAILABLE'
      throw err
    }
    const { error } = await admin.auth.admin.updateUserById(uid, { password: pwd })
    if (error) {
      const err = new Error(error.message || 'Failed to update password.')
      err.code = 'UPDATE_FAILED'
      throw err
    }
    await touchProfileUpdated(uid)
    return profile
  }

  await initUsersDb()
  const local = (await findUserById(uid)) || (await findUserByEmail(profile.email))
  if (!local) {
    const err = new Error('User not found.')
    err.code = 'NOT_FOUND'
    throw err
  }
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
  await updateUserPasswordHash(local.id, await bcrypt.hash(pwd, saltRounds))
  await touchProfileUpdated(uid)
  return profile
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Admin-created account (does not sign the caller in as the new user). */
export async function createAppUser({ email, password, role }) {
  const mail = String(email || '').trim().toLowerCase()
  const pwd = String(password || '')
  const nextRole = role === ROLES.admin ? ROLES.admin : ROLES.member

  if (!EMAIL_REGEX.test(mail)) {
    const err = new Error('A valid email is required.')
    err.code = 'INVALID_EMAIL'
    throw err
  }
  if (pwd.length < 6) {
    const err = new Error('Password must be at least 6 characters.')
    err.code = 'WEAK_PASSWORD'
    throw err
  }

  let user

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (!admin) {
      const err = new Error('Supabase service role is required to create users.')
      err.code = 'STORE_UNAVAILABLE'
      throw err
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: mail,
      password: pwd,
      email_confirm: true,
    })
    if (error) {
      const taken = /already|registered|exists/i.test(error.message || '')
      const err = new Error(taken ? 'An account with this email already exists.' : error.message)
      err.code = taken ? 'EMAIL_TAKEN' : 'CREATE_FAILED'
      throw err
    }
    if (!data?.user) {
      const err = new Error('User was not created.')
      err.code = 'CREATE_FAILED'
      throw err
    }
    user = { id: data.user.id, email: data.user.email || mail }
  } else {
    await initUsersDb()
    if (await findUserByEmail(mail)) {
      const err = new Error('An account with this email already exists.')
      err.code = 'EMAIL_TAKEN'
      throw err
    }
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    user = await createUser({
      id: crypto.randomUUID(),
      email: mail,
      passwordHash: await bcrypt.hash(pwd, saltRounds),
      createdAt: new Date().toISOString(),
    })
  }

  let profile = await ensureAppProfile({ id: user.id, email: user.email })
  if (profile.role !== nextRole) {
    profile = await setUserRole(user.id, nextRole, user.id)
  }
  return profile
}

export function featureEnabled(map, key, role) {
  return isFeatureEnabledForRole(map, key, role)
}

/** Public / unauthenticated flags use the member column (new users are members). */
export function isFlagOn(map, key) {
  return isFeatureEnabledForRole(map, key, ROLES.member)
}

export async function assertFlagOn(key) {
  const map = await getFeatureMap()
  if (!isFlagOn(map, key)) {
    const err = new Error('This feature is currently disabled.')
    err.code = 'FEATURE_DISABLED'
    throw err
  }
}

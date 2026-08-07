import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const { Pool } = pg

let adminClient = null
let pool = null

/** Supabase client that must use the service role (bypasses RLS). */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      realtime: { transport: ws },
    })
  }
  return adminClient
}

function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return null
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    })
  }
  return pool
}

export function isMerchantStoreConfigured() {
  return Boolean(getSupabaseAdmin() || getPool())
}

function storeUnavailableError() {
  const err = new Error(
    'Merchant vault storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL on the server.'
  )
  err.code = 'STORE_UNAVAILABLE'
  return err
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    merchantName: row.merchant_name,
    mid: row.mid,
    secretKey: row.secret_key,
    environment: row.environment === 'production' ? 'production' : 'uat',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeEnvironment(value) {
  return value === 'production' ? 'production' : 'uat'
}

const CREDENTIAL_COLUMNS =
  'id, user_id, merchant_name, mid, secret_key, environment, created_at, updated_at'

export async function getVaultRow(userId) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_vault')
      .select('user_id, password_hash, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    'SELECT user_id, password_hash, updated_at FROM merchant_vault WHERE user_id = $1',
    [userId]
  )
  return rows[0] || null
}

export async function createVault(userId, passwordHash) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_vault')
      .insert({ user_id: userId, password_hash: passwordHash, updated_at: new Date().toISOString() })
      .select('user_id')
      .single()
    if (error) throw error
    return data
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    `INSERT INTO merchant_vault (user_id, password_hash, updated_at)
     VALUES ($1, $2, now())
     RETURNING user_id`,
    [userId, passwordHash]
  )
  return rows[0]
}

export async function updateVaultPassword(userId, passwordHash) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_vault')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('user_id')
      .single()
    if (error) throw error
    return data
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    `UPDATE merchant_vault SET password_hash = $2, updated_at = now()
     WHERE user_id = $1 RETURNING user_id`,
    [userId, passwordHash]
  )
  return rows[0] || null
}

export async function listCredentials(userId) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_credentials')
      .select(CREDENTIAL_COLUMNS)
      .eq('user_id', userId)
      .order('merchant_name', { ascending: true })
    if (error) throw error
    return (data || []).map(mapRow)
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    `SELECT ${CREDENTIAL_COLUMNS}
     FROM merchant_credentials WHERE user_id = $1
     ORDER BY merchant_name ASC`,
    [userId]
  )
  return rows.map(mapRow)
}

export async function createCredential(userId, { merchantName, mid, secretKey, environment }) {
  const env = normalizeEnvironment(environment)
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_credentials')
      .insert({
        user_id: userId,
        merchant_name: merchantName,
        mid,
        secret_key: secretKey ?? '',
        environment: env,
        updated_at: new Date().toISOString(),
      })
      .select(CREDENTIAL_COLUMNS)
      .single()
    if (error) throw error
    return mapRow(data)
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    `INSERT INTO merchant_credentials (user_id, merchant_name, mid, secret_key, environment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${CREDENTIAL_COLUMNS}`,
    [userId, merchantName, mid, secretKey ?? '', env]
  )
  return mapRow(rows[0])
}

export async function updateCredential(userId, id, { merchantName, mid, secretKey, environment }) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const patch = { updated_at: new Date().toISOString() }
    if (merchantName !== undefined) patch.merchant_name = merchantName
    if (mid !== undefined) patch.mid = mid
    if (secretKey !== undefined) patch.secret_key = secretKey
    if (environment !== undefined) patch.environment = normalizeEnvironment(environment)

    const { data, error } = await admin
      .from('merchant_credentials')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(CREDENTIAL_COLUMNS)
      .maybeSingle()
    if (error) throw error
    return mapRow(data)
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const env =
    environment !== undefined ? normalizeEnvironment(environment) : null
  const { rows } = await db.query(
    `UPDATE merchant_credentials
     SET merchant_name = COALESCE($3, merchant_name),
         mid = COALESCE($4, mid),
         secret_key = COALESCE($5, secret_key),
         environment = COALESCE($6, environment),
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${CREDENTIAL_COLUMNS}`,
    [id, userId, merchantName ?? null, mid ?? null, secretKey ?? null, env]
  )
  return mapRow(rows[0] || null)
}

export async function deleteCredential(userId, id) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_credentials')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    return Boolean(data)
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rowCount } = await db.query(
    'DELETE FROM merchant_credentials WHERE id = $1 AND user_id = $2',
    [id, userId]
  )
  return rowCount > 0
}

function mapWebAuthnRow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: Number(row.counter) || 0,
    transports: row.transports || [],
    deviceName: row.device_name || '',
    createdAt: row.created_at,
  }
}

export async function listWebAuthnCredentials(userId) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_vault_webauthn')
      .select('id, user_id, credential_id, public_key, counter, transports, device_name, created_at')
      .eq('user_id', userId)
    if (error) throw error
    return (data || []).map(mapWebAuthnRow)
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    `SELECT id, user_id, credential_id, public_key, counter, transports, device_name, created_at
     FROM merchant_vault_webauthn WHERE user_id = $1`,
    [userId]
  )
  return rows.map(mapWebAuthnRow)
}

export async function countWebAuthnCredentials(userId) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { count, error } = await admin
      .from('merchant_vault_webauthn')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (error) throw error
    return count || 0
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS c FROM merchant_vault_webauthn WHERE user_id = $1',
    [userId]
  )
  return rows[0]?.c || 0
}

export async function saveWebAuthnCredential(userId, { credentialId, publicKey, counter, transports, deviceName }) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { data, error } = await admin
      .from('merchant_vault_webauthn')
      .insert({
        user_id: userId,
        credential_id: credentialId,
        public_key: publicKey,
        counter: counter ?? 0,
        transports: transports || null,
        device_name: deviceName || null,
      })
      .select('id, user_id, credential_id, public_key, counter, transports, device_name, created_at')
      .single()
    if (error) throw error
    return mapWebAuthnRow(data)
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  const { rows } = await db.query(
    `INSERT INTO merchant_vault_webauthn
       (user_id, credential_id, public_key, counter, transports, device_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, credential_id, public_key, counter, transports, device_name, created_at`,
    [userId, credentialId, publicKey, counter ?? 0, transports || null, deviceName || null]
  )
  return mapWebAuthnRow(rows[0])
}

export async function updateWebAuthnCounter(userId, credentialId, counter) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { error } = await admin
      .from('merchant_vault_webauthn')
      .update({ counter })
      .eq('user_id', userId)
      .eq('credential_id', credentialId)
    if (error) throw error
    return
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  await db.query(
    `UPDATE merchant_vault_webauthn SET counter = $3
     WHERE user_id = $1 AND credential_id = $2`,
    [userId, credentialId, counter]
  )
}

export async function deleteWebAuthnCredentials(userId) {
  const admin = getSupabaseAdmin()
  if (admin) {
    const { error } = await admin.from('merchant_vault_webauthn').delete().eq('user_id', userId)
    if (error) throw error
    return
  }

  const db = getPool()
  if (!db) throw storeUnavailableError()
  await db.query('DELETE FROM merchant_vault_webauthn WHERE user_id = $1', [userId])
}

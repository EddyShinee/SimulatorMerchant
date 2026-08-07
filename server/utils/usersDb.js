import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import pg from 'pg'
import { readUsers as readCsvUsers } from './csv.js'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')

let mode = null // 'postgres' | 'sqlite'
let pool = null
let sqliteDb = null
let sqlitePath = null
let readyPromise = null

function resolveSqlitePath() {
  const configured = process.env.USERS_DB_PATH
  if (configured && path.isAbsolute(configured)) return configured
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Serverless FS is ephemeral — set DATABASE_URL for production.
    return path.join('/tmp', configured || 'users.db')
  }
  return path.join(SERVER_ROOT, configured || 'data/users.db')
}

function persistSqlite() {
  if (!sqliteDb || !sqlitePath) return
  const data = sqliteDb.export()
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
  fs.writeFileSync(sqlitePath, Buffer.from(data))
}

function ensureSchemaSqlite() {
  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`)
}

async function ensureSchemaPostgres() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`)
}

function insertUserSyncSqlite(user) {
  sqliteDb.run(
    `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    [user.id, user.email, user.passwordHash, user.createdAt]
  )
  persistSqlite()
}

async function insertUserPostgres(user) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)`,
    [user.id, user.email, user.passwordHash, user.createdAt]
  )
}

async function countUsers() {
  if (mode === 'postgres') {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users')
    return rows[0]?.c || 0
  }
  const row = sqliteDb.exec('SELECT COUNT(*) AS c FROM users')
  return row[0]?.values?.[0]?.[0] || 0
}

async function migrateFromCsvIfNeeded() {
  if ((await countUsers()) > 0) return

  let csvUsers = []
  try {
    csvUsers = readCsvUsers()
  } catch {
    return
  }
  if (!csvUsers.length) return

  for (const user of csvUsers) {
    const row = {
      id: user.id,
      email: String(user.email || '').trim().toLowerCase(),
      passwordHash: user.passwordHash,
      createdAt: user.createdAt || new Date().toISOString(),
    }
    if (mode === 'postgres') await insertUserPostgres(row)
    else insertUserSyncSqlite(row)
  }
  console.log(`[users-db] migrated ${csvUsers.length} user(s) from CSV → database`)
}

async function initPostgres() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  })
  await ensureSchemaPostgres()
  mode = 'postgres'
  console.log('[users-db] using Postgres (DATABASE_URL)')
}

async function initSqlite() {
  const SQL = await initSqlJs()
  sqlitePath = resolveSqlitePath()
  if (fs.existsSync(sqlitePath)) {
    sqliteDb = new SQL.Database(fs.readFileSync(sqlitePath))
  } else {
    sqliteDb = new SQL.Database()
  }
  ensureSchemaSqlite()
  persistSqlite()
  mode = 'sqlite'
  console.log(`[users-db] using SQLite at ${sqlitePath}`)
}

export function initUsersDb() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (process.env.DATABASE_URL) await initPostgres()
      else await initSqlite()
      await migrateFromCsvIfNeeded()
      return mode
    })().catch((err) => {
      readyPromise = null
      throw err
    })
  }
  return readyPromise
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash ?? row.passwordHash,
    createdAt: row.created_at ?? row.createdAt,
  }
}

export async function findUserByEmail(email) {
  await initUsersDb()
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return null

  if (mode === 'postgres') {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, created_at FROM users WHERE lower(email) = $1 LIMIT 1',
      [normalized]
    )
    return mapRow(rows[0])
  }

  const stmt = sqliteDb.prepare(
    'SELECT id, email, password_hash, created_at FROM users WHERE lower(email) = ? LIMIT 1'
  )
  try {
    stmt.bind([normalized])
    if (!stmt.step()) return null
    return mapRow(stmt.getAsObject())
  } finally {
    stmt.free()
  }
}

export async function createUser(user) {
  await initUsersDb()
  const row = {
    id: user.id,
    email: String(user.email || '').trim().toLowerCase(),
    passwordHash: user.passwordHash,
    createdAt: user.createdAt || new Date().toISOString(),
  }

  if (mode === 'postgres') await insertUserPostgres(row)
  else insertUserSyncSqlite(row)

  return row
}

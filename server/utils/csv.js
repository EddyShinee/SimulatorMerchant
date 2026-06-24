import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')

const CSV_HEADER = ['id', 'email', 'passwordHash', 'createdAt']

function resolveCsvPath() {
  const configured = process.env.USERS_CSV_PATH
  if (configured && path.isAbsolute(configured)) return configured

  // On serverless hosts (e.g. Vercel) only /tmp is writable. Note: /tmp is
  // ephemeral, so accounts there may reset on cold starts.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join('/tmp', configured || 'users.csv')
  }

  return path.join(SERVER_ROOT, configured || 'data/users.csv')
}

function escapeField(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// Minimal RFC-4180-ish CSV line parser that supports quoted fields.
function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

function ensureCsvFile() {
  const csvPath = resolveCsvPath()
  const dir = path.dirname(csvPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, CSV_HEADER.join(',') + '\n', 'utf8')
  }
  return csvPath
}

export function readUsers() {
  const csvPath = ensureCsvFile()
  const content = fs.readFileSync(csvPath, 'utf8')
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length <= 1) return []
  return lines.slice(1).map((line) => {
    const [id, email, passwordHash, createdAt] = parseCsvLine(line)
    return { id, email, passwordHash, createdAt }
  })
}

export function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return readUsers().find((user) => user.email.toLowerCase() === normalized) || null
}

export function appendUser(user) {
  const csvPath = ensureCsvFile()
  const row = CSV_HEADER.map((key) => escapeField(user[key])).join(',')
  fs.appendFileSync(csvPath, row + '\n', 'utf8')
  return user
}

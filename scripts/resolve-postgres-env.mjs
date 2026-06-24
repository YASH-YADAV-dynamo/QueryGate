/**
 * Build-time env resolver (mirrors src/config/postgres-url.ts for vercel-build / prisma db push).
 */

const HOST_KEYS = ["PGHOST", "POSTGRES_HOST", "NEON_HOST"]
const USER_KEYS = ["PGUSER", "POSTGRES_USER", "NEON_USER"]
const PASSWORD_KEYS = ["PGPASSWORD", "POSTGRES_PASSWORD", "NEON_PASSWORD"]
const DATABASE_KEYS = ["DATABASE", "PGDATABASE", "POSTGRES_DATABASE", "NEON_DATABASE"]

function firstEnv(keys) {
  for (const key of keys) {
    const v = process.env[key]?.trim()
    if (v) return v
  }
  return undefined
}

function looksLikePostgresUrl(value) {
  return /^postgres(ql)?:\/\//i.test(value)
}

function normalizeDatabaseUrl(databaseUrl) {
  return databaseUrl
    .trim()
    .replace(/([?&])channel_binding=[^&]*&?/g, "$1")
    .replace(/[?&]$/, "")
}

function ensureDatabaseInUrl(url, dbName) {
  const name = dbName?.trim()
  if (!name || !looksLikePostgresUrl(url)) return url
  try {
    const u = new URL(url)
    const pathDb = u.pathname.replace(/^\//, "").split("/")[0]
    if (!pathDb) u.pathname = `/${name}`
    return u.toString()
  } catch {
    return url
  }
}

function buildPostgresUrlFromParts() {
  const host = firstEnv(HOST_KEYS)
  const user = firstEnv(USER_KEYS)
  const password = firstEnv(PASSWORD_KEYS)
  const database = firstEnv(DATABASE_KEYS) ?? "neondb"
  if (!host || !user || !password) return undefined
  const sslmode = process.env.PGSSLMODE?.trim() || process.env.POSTGRES_SSL?.trim() || "require"
  const u = new URL(`postgresql://${host}/${database}`)
  u.username = user
  u.password = password
  u.searchParams.set("sslmode", sslmode)
  return u.toString()
}

/** Set process.env.QUERYGATE_STORE_URL from full URL or Vercel split vars (DATABASE=neondb). */
export function ensureQuerygateStoreUrl() {
  const dbName = firstEnv(DATABASE_KEYS)
  const existing = process.env.QUERYGATE_STORE_URL?.trim()
  if (existing && looksLikePostgresUrl(existing)) {
    process.env.QUERYGATE_STORE_URL = normalizeDatabaseUrl(ensureDatabaseInUrl(existing, dbName))
    return process.env.QUERYGATE_STORE_URL
  }

  for (const key of [
    "QUERYGATE_STORE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "DATABASE_URL",
    "NEON_DATABASE_URL",
  ]) {
    const raw = process.env[key]?.trim()
    if (raw && looksLikePostgresUrl(raw)) {
      process.env.QUERYGATE_STORE_URL = normalizeDatabaseUrl(ensureDatabaseInUrl(raw, dbName))
      return process.env.QUERYGATE_STORE_URL
    }
  }

  const built = buildPostgresUrlFromParts()
  if (built) {
    process.env.QUERYGATE_STORE_URL = normalizeDatabaseUrl(built)
    return process.env.QUERYGATE_STORE_URL
  }

  return undefined
}

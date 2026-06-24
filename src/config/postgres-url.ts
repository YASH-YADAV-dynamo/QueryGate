import { normalizeDatabaseUrl } from "../db/connector.js"

const URL_KEYS = [
  "QUERYGATE_STORE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
] as const

const HOST_KEYS = ["PGHOST", "POSTGRES_HOST", "NEON_HOST"] as const
const USER_KEYS = ["PGUSER", "POSTGRES_USER", "NEON_USER"] as const
const PASSWORD_KEYS = ["PGPASSWORD", "POSTGRES_PASSWORD", "NEON_PASSWORD"] as const
const DATABASE_KEYS = ["DATABASE", "PGDATABASE", "POSTGRES_DATABASE", "NEON_DATABASE"] as const

function firstEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = process.env[key]?.trim()
    if (v) return v
  }
  return undefined
}

function looksLikePostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\//i.test(value)
}

/** If URL has no database in the path, append DATABASE / PGDATABASE (e.g. neondb). */
export function ensureDatabaseInUrl(url: string, dbName?: string): string {
  const name = dbName?.trim()
  if (!name || !looksLikePostgresUrl(url)) return url

  try {
    const u = new URL(url)
    const pathDb = u.pathname.replace(/^\//, "").split("/")[0]
    if (!pathDb) {
      u.pathname = `/${name}`
    }
    return u.toString()
  } catch {
    return url
  }
}

/** Build postgres:// URL from Vercel/Neon split env vars (DATABASE=neondb, etc.). */
export function buildPostgresUrlFromParts(): string | undefined {
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

export interface ResolvePostgresUrlOptions {
  /** Prefer QUERYGATE_STORE_URL / POSTGRES_* for the metadata store. */
  preferStore?: boolean
}

/**
 * Resolve a Postgres URL from env — full URL or Vercel split vars (DATABASE=neondb + host/user/pass).
 * Always normalizes (strips channel_binding) and fills missing db name from DATABASE.
 */
export function resolvePostgresUrlFromEnv(
  options: ResolvePostgresUrlOptions = {},
): string | undefined {
  const dbName = firstEnv(DATABASE_KEYS)

  const orderedKeys = options.preferStore
    ? (["QUERYGATE_STORE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL", "NEON_DATABASE_URL"] as const)
    : (["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "QUERYGATE_STORE_URL", "NEON_DATABASE_URL"] as const)

  for (const key of orderedKeys) {
    const raw = process.env[key]?.trim()
    if (!raw) continue
    if (looksLikePostgresUrl(raw)) {
      return normalizeDatabaseUrl(ensureDatabaseInUrl(raw, dbName))
    }
  }

  const built = buildPostgresUrlFromParts()
  if (built) return normalizeDatabaseUrl(built)

  return undefined
}

/** Like resolvePostgresUrlFromEnv but sets process.env.QUERYGATE_STORE_URL when built from parts. */
export function ensureQuerygateStoreUrl(): string | undefined {
  const existing = process.env.QUERYGATE_STORE_URL?.trim()
  if (existing && looksLikePostgresUrl(existing)) {
    const dbName = firstEnv(DATABASE_KEYS)
    process.env.QUERYGATE_STORE_URL = normalizeDatabaseUrl(ensureDatabaseInUrl(existing, dbName))
    return process.env.QUERYGATE_STORE_URL
  }

  const resolved = resolvePostgresUrlFromEnv({ preferStore: true })
  if (resolved) {
    process.env.QUERYGATE_STORE_URL = resolved
    return resolved
  }

  return undefined
}

/** User / analytics DB — defaults to QUERYGATE_STORE_URL when that is the only URL in .env. */
export function resolveDatabaseUrlFromEnv(): string | undefined {
  const dbName = firstEnv(DATABASE_KEYS)

  const dbUrl = process.env.DATABASE_URL?.trim()
  if (dbUrl && looksLikePostgresUrl(dbUrl)) {
    return normalizeDatabaseUrl(ensureDatabaseInUrl(dbUrl, dbName))
  }

  // Typical .env: QUERYGATE_STORE_URL + JWT_SECRET + ENCRYPTION_KEY only (neondb in path).
  const storeUrl = process.env.QUERYGATE_STORE_URL?.trim()
  if (storeUrl && looksLikePostgresUrl(storeUrl)) {
    return normalizeDatabaseUrl(ensureDatabaseInUrl(storeUrl, dbName))
  }

  return resolvePostgresUrlFromEnv({ preferStore: false })
}

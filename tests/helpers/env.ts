const STORE_ENV_KEYS = [
  "QUERYGATE_STORE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "DATABASE",
  "PGHOST",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "POSTGRES_HOST",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DATABASE",
] as const

/** Run a test with no Postgres env (simulates missing credentials). */
export async function withoutDatabaseUrl<T>(fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const key of STORE_ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value
      else delete process.env[key]
    }
  }
}

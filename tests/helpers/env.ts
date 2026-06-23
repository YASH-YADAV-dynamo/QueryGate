const STORE_ENV_KEYS = [
  "QUERYGATE_STORE_URL",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
] as const

/** Run a test without DATABASE_URL or connection store env (simulates legacy local mode). */
export async function withoutDatabaseUrl<T>(fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {
    DATABASE_URL: process.env.DATABASE_URL,
  }
  for (const key of STORE_ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  delete process.env.DATABASE_URL

  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value
      else delete process.env[key]
    }
  }
}

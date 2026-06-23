/** Run a test with DATABASE_URL unset (simulates hosted mode without env fallback). */
export async function withoutDatabaseUrl<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  try {
    return await fn()
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL = prev
    else delete process.env.DATABASE_URL
  }
}

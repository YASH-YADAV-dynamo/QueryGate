import { AsyncLocalStorage } from "node:async_hooks"

interface RequestContext {
  databaseUrl: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithDatabaseUrl<T>(databaseUrl: string, fn: () => T): T {
  return storage.run({ databaseUrl }, fn)
}

export function runWithDatabaseUrlAsync<T>(
  databaseUrl: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ databaseUrl }, fn)
}

export function getRequestDatabaseUrl(): string | undefined {
  return storage.getStore()?.databaseUrl
}

export function extractDatabaseUrlFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw =
    headers["database_url"] ??
    headers["x-database-url"] ??
    headers["DATABASE_URL"]

  if (typeof raw === "string" && raw.length > 0) return raw
  if (Array.isArray(raw) && raw[0]) return raw[0]
  return undefined
}

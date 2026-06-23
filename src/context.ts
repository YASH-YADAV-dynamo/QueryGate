import { AsyncLocalStorage } from "node:async_hooks"

interface RequestContext {
  databaseUrl?: string
  accessToken?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithDatabaseUrl<T>(databaseUrl: string, fn: () => T): T {
  const prev = storage.getStore()
  return storage.run({ ...prev, databaseUrl }, fn)
}

export function runWithDatabaseUrlAsync<T>(
  databaseUrl: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = storage.getStore()
  return storage.run({ ...prev, databaseUrl }, fn)
}

export function runWithAccessTokenAsync<T>(
  accessToken: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = storage.getStore()
  return storage.run({ ...prev, accessToken }, fn)
}

export function getRequestDatabaseUrl(): string | undefined {
  return storage.getStore()?.databaseUrl
}

export function getRequestAccessToken(): string | undefined {
  return storage.getStore()?.accessToken
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

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const raw = headers[name.toLowerCase()] ?? headers[name]
  if (typeof raw === "string" && raw.length > 0) return raw
  if (Array.isArray(raw) && raw[0]) return raw[0]
  return undefined
}

/** Bearer JWT or X-QueryGate-Token header. */
export function extractAccessTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const direct = headerValue(headers, "x-querygate-token")
  if (direct) return direct

  const auth = headerValue(headers, "authorization")
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim()
    if (token.length > 0) return token
  }
  return undefined
}

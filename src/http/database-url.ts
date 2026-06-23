import type { IncomingMessage, ServerResponse } from "node:http"
import { extractDatabaseUrlFromHeaders } from "../context.js"

export type HttpReq = IncomingMessage & { body?: unknown; query?: Record<string, string | string[] | undefined> }

export type HttpRes = ServerResponse

export function resolveDatabaseUrl(
  req: HttpReq,
  sessionUrls: Map<string, string>,
  sessionId?: string,
): string | undefined {
  const fromHeader = extractDatabaseUrlFromHeaders(
    req.headers as Record<string, string | string[] | undefined>,
  )
  if (fromHeader) return fromHeader
  if (sessionId) return sessionUrls.get(sessionId)
  return undefined
}

export function sendMissingDatabaseUrl(res: HttpRes): void {
  res.statusCode = 401
  res.setHeader("Content-Type", "application/json")
  res.end(
    JSON.stringify({
      error: "Missing DATABASE_URL header",
      hint: 'Send "DATABASE_URL" or "X-Database-Url" on the first request, or paste your Postgres URL in chat so the app can pass it as a header.',
    }),
  )
}

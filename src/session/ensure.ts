import { getOrCreatePool } from "../db/connector.js"
import { buildSchemaStore } from "../rag/schema-pipeline.js"
import { inferAliases, addAlias } from "./alias-store.js"
import { createSession, getSession, getSessionForDatabaseUrl, updateSessionStatus } from "./manager.js"
import { CONSTANTS } from "../config/index.js"
import { getRequestAccessToken, getRequestDatabaseUrl } from "../context.js"
import { isConnectionStoreEnabled, resolveDatabaseUrlFromToken } from "../store/connection-store.js"
import { logger } from "../utils/logger.js"
import { McpError, toMcpError } from "../utils/error.js"
import type { SessionState } from "../db/types.js"
import type { McpToolResult } from "../tools/core/types.js"
import { toolError } from "../tools/core/response.js"

/** Connect to a database and load its schema into a session. Idempotent — reuses ready sessions. */
export async function ensureConnected(databaseUrl: string): Promise<SessionState> {
  const existing = getSessionForDatabaseUrl(databaseUrl)
  if (existing?.status === "ready") {
    existing.lastUsedAt = Date.now()
    existing.databaseUrl = databaseUrl
    return existing
  }

  const session = existing ?? createSession(databaseUrl)

  try {
    updateSessionStatus(session.id, "connecting")
    const pool = await getOrCreatePool(databaseUrl)
    updateSessionStatus(session.id, "schema_load")
    const schema = await buildSchemaStore(pool)

    const live = getSession(session.id)!
    live.schema = schema
    live.databaseUrl = databaseUrl

    const inferred = inferAliases(schema)
    for (const alias of inferred) {
      if (alias.confidence >= CONSTANTS.ALIAS_CONFIDENCE_THRESHOLD) {
        addAlias(live.aliases, alias)
      }
    }

    updateSessionStatus(session.id, "ready")
    logger.info("ensureConnected complete", { sessionId: session.id, tables: schema.tables.size })
    return live
  } catch (err) {
    const mcpErr = err instanceof McpError ? err : toMcpError(err, "DB_CONNECT_FAILED")
    updateSessionStatus(session.id, "error", mcpErr.message)
    throw mcpErr
  }
}

/** Resolve the database URL from all possible sources, in priority order. */
async function resolveUrl(token?: string, url?: string): Promise<string | undefined> {
  if (url) return url

  const t = token ?? getRequestAccessToken()
  if (t && isConnectionStoreEnabled()) {
    try {
      return await resolveDatabaseUrlFromToken(t)
    } catch (err) {
      logger.warn("Access token resolution failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const fromRequest = getRequestDatabaseUrl()
  if (fromRequest) return fromRequest

  if (!isConnectionStoreEnabled()) {
    return process.env.DATABASE_URL
  }

  return undefined
}

/**
 * Resolve a ready session for any tool call.
 * Single auth param: either access_token (Vercel/hosted) or database_url (local/direct).
 */
export async function resolveSessionForTool(
  accessToken?: string,
  databaseUrl?: string,
): Promise<SessionState | McpToolResult> {
  const url = await resolveUrl(accessToken, databaseUrl)

  if (url) {
    try {
      return await ensureConnected(url)
    } catch (err) {
      const msg = err instanceof McpError ? err.message : String(err)
      return toolError(`Database connection failed: ${msg}`)
    }
  }

  if (isConnectionStoreEnabled()) {
    return toolError(
      "No session. Call connect with database_url first — it returns access_token. Pass access_token on every subsequent tool call.",
    )
  }

  return toolError(
    "No session. Call connect with database_url, or pass DATABASE_URL on every request header.",
  )
}

export function getReadySessionId(session: SessionState): string {
  return session.id
}

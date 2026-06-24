import { getOrCreatePool, normalizeDatabaseUrl } from "../db/connector.js"
import { buildSchemaStore } from "../rag/schema-pipeline.js"
import { inferAliases, addAlias } from "./alias-store.js"
import { createSession, getSession, getSessionForDatabaseUrl, updateSessionStatus } from "./manager.js"
import { CONSTANTS } from "../config/index.js"
import { getRequestAccessToken, getRequestDatabaseUrl } from "../context.js"
import { resolveDatabaseUrlFromToken } from "../store/connection-store.js"
import { resolveDatabaseUrlFromEnv } from "../config/postgres-url.js"
import { logger } from "../utils/logger.js"
import { McpError, toMcpError } from "../utils/error.js"
import type { SessionState } from "../db/types.js"
import type { McpToolResult } from "../tools/core/types.js"
import { toolError } from "../tools/core/response.js"

/** Connect to a database, load schema, and cache the session. Idempotent. */
export async function ensureConnected(databaseUrl: string): Promise<SessionState> {
  const normalized = normalizeDatabaseUrl(databaseUrl)

  const existing = getSessionForDatabaseUrl(normalized)
  if (existing?.status === "ready") {
    existing.lastUsedAt = Date.now()
    existing.databaseUrl = normalized
    return existing
  }

  const session = existing ?? createSession(normalized)

  try {
    updateSessionStatus(session.id, "connecting")
    const pool = await getOrCreatePool(normalized)
    updateSessionStatus(session.id, "schema_load")
    const schema = await buildSchemaStore(pool)

    const live = getSession(session.id)!
    live.schema = schema
    live.databaseUrl = normalized

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

/**
 * Resolve the DB URL from all possible sources, in priority order.
 * Returns [url, errorMessage] — url is set on success, errorMessage on token error.
 */
async function resolveUrl(
  token?: string,
  explicitUrl?: string,
): Promise<{ url?: string; tokenError?: string }> {
  if (explicitUrl) return { url: normalizeDatabaseUrl(explicitUrl) }

  const t = token ?? getRequestAccessToken()
  if (t && process.env.JWT_SECRET) {
    try {
      const url = await resolveDatabaseUrlFromToken(t)
      return { url }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn("Token resolution failed", { error: msg })
      return { tokenError: msg }
    }
  }

  const fromRequest = getRequestDatabaseUrl()
  if (fromRequest) return { url: normalizeDatabaseUrl(fromRequest) }

  // Fallback for local/stdio mode without JWT
  const fromEnv = resolveDatabaseUrlFromEnv()
  if (fromEnv) return { url: fromEnv }

  return {}
}

/**
 * Resolve a ready session for any tool call.
 * Surfaces real error messages — no silent failures.
 */
export async function resolveSessionForTool(
  accessToken?: string,
  databaseUrl?: string,
): Promise<SessionState | McpToolResult> {
  const { url, tokenError } = await resolveUrl(accessToken, databaseUrl)

  if (url) {
    try {
      return await ensureConnected(url)
    } catch (err) {
      const msg = err instanceof McpError ? err.message : String(err)
      return toolError(`Database connection failed: ${msg}`)
    }
  }

  if (tokenError) {
    return toolError(
      `Access token error: ${tokenError}\n\nCall connect again with database_url to get a fresh token.`,
    )
  }

  if (accessToken) {
    return toolError(
      "Could not resolve database URL from access_token. " +
        "The token may be from an older format. Call connect again with database_url.",
    )
  }

  return toolError(
    process.env.JWT_SECRET
      ? "No database session. Call connect() with no args (uses QUERYGATE_STORE_URL from server env), or pass access_token."
      : "No database session. Set QUERYGATE_STORE_URL in env or call connect with database_url.",
  )
}

export function getReadySessionId(session: SessionState): string {
  return session.id
}

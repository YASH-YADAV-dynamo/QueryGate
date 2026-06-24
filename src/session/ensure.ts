import { getOrCreatePool } from "../db/connector.js"
import { buildSchemaStore } from "../rag/schema-pipeline.js"
import { inferAliases, addAlias } from "./alias-store.js"
import {
  createSession,
  getSession,
  getSessionForDatabaseUrl,
  updateSessionStatus,
} from "./manager.js"
import { CONSTANTS } from "../config/index.js"
import { getRequestAccessToken, getRequestDatabaseUrl } from "../context.js"
import { runWithDatabaseUrlAsync } from "../context.js"
import {
  isConnectionStoreEnabled,
  resolveDatabaseUrlFromToken,
} from "../store/connection-store.js"
import { logger } from "../utils/logger.js"
import { McpError, toMcpError } from "../utils/error.js"
import type { SessionState } from "../db/types.js"
import type { McpToolResult } from "../tools/core/types.js"
import { toolError } from "../tools/core/response.js"

/** Load schema for DATABASE_URL — shared by connect and serverless auto-reconnect. */
export async function ensureConnected(databaseUrl: string): Promise<SessionState> {
  return runWithDatabaseUrlAsync(databaseUrl, async () => {
    const existing = getSessionForDatabaseUrl(databaseUrl)
    if (existing?.status === "ready" && existing.schema.tables.size > 0) {
      existing.lastUsedAt = Date.now()
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

      const inferred = inferAliases(schema)
      for (const alias of inferred) {
        if (alias.confidence >= CONSTANTS.ALIAS_CONFIDENCE_THRESHOLD) {
          addAlias(live.aliases, alias)
        }
      }

      updateSessionStatus(session.id, "ready")
      logger.info("ensureConnected complete", {
        sessionId: session.id,
        tables: schema.tables.size,
      })
      return live
    } catch (err) {
      const mcpErr = err instanceof McpError ? err : toMcpError(err, "DB_CONNECT_FAILED")
      updateSessionStatus(session.id, "error", mcpErr.message)
      throw mcpErr
    }
  })
}

async function resolveUrlFromAccessToken(accessToken: string): Promise<string | undefined> {
  if (!isConnectionStoreEnabled()) return undefined
  try {
    return await resolveDatabaseUrlFromToken(accessToken)
  } catch (err) {
    logger.warn("Access token resolution failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  }
}

async function resolveDatabaseUrlFromContext(
  explicitUrl?: string,
  explicitToken?: string,
): Promise<string | undefined> {
  if (explicitUrl) return explicitUrl

  const token = explicitToken ?? getRequestAccessToken()
  if (token) {
    const fromToken = await resolveUrlFromAccessToken(token)
    if (fromToken) return fromToken
  }

  const fromRequest = getRequestDatabaseUrl()
  if (fromRequest) return fromRequest

  // Hosted mode: user DB URL comes from JWT only — not server env
  if (!isConnectionStoreEnabled()) {
    const envUrl = process.env.DATABASE_URL
    if (envUrl) return envUrl
  }

  return undefined
}

function hasDurableCredentials(
  databaseUrl?: string,
  accessToken?: string,
): boolean {
  return Boolean(
    accessToken || databaseUrl || getRequestAccessToken() || getRequestDatabaseUrl(),
  )
}

/**
 * Resolve a ready session for tool calls.
 * On Vercel/serverless: access_token (JWT) is the source of truth — session_id is RAM-only cache.
 */
export async function resolveSessionForTool(
  sessionId?: string,
  databaseUrl?: string,
  accessToken?: string,
): Promise<SessionState | McpToolResult> {
  const storeEnabled = isConnectionStoreEnabled()

  // JWT / explicit URL first when provided; else try same-lambda RAM session
  if (hasDurableCredentials(databaseUrl, accessToken) || !storeEnabled) {
    const url = await resolveDatabaseUrlFromContext(databaseUrl, accessToken)
    if (url) {
      try {
        const session = await ensureConnected(url)
        if (sessionId && session.id !== sessionId) {
          logger.info("Session recovered via durable credential (serverless)", {
            requested: sessionId,
            active: session.id,
          })
        }
        return session
      } catch (err) {
        const msg = err instanceof McpError ? err.message : String(err)
        return toolError(`Database connection failed: ${msg}`)
      }
    }
  }

  if (sessionId) {
    const byId = getSession(sessionId)
    if (byId) {
      if (byId.status === "ready") return byId
      return toolError(
        `Session not ready (status: ${byId.status}). Wait for connect to finish or call connect again.`,
      )
    }
  }

  if (!storeEnabled) {
    const url = await resolveDatabaseUrlFromContext(databaseUrl, accessToken)
    if (url) {
      try {
        return await ensureConnected(url)
      } catch (err) {
        const msg = err instanceof McpError ? err.message : String(err)
        return toolError(`Database connection failed: ${msg}`)
      }
    }
  }

  if (sessionId || accessToken) {
    return toolError(
      storeEnabled
        ? "Session not found on this server instance. You MUST pass access_token from connect on every tool call (session_id alone does not work on Vercel). Copy the Access token from the connect response."
        : "Session expired or not found on this server instance. Call connect again with database_url (your Postgres connection string).",
    )
  }

  return toolError(
    storeEnabled
      ? "No database session. Call connect with database_url once — it returns access_token. Pass access_token on schema_reader, execute_sql, customer_analytics, etc."
      : "No database session. Call connect with database_url, or send DATABASE_URL on every MCP request header.",
  )
}

export function getReadySessionId(session: SessionState): string {
  return session.id
}

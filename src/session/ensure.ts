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

  const envUrl = process.env.DATABASE_URL
  if (envUrl) return envUrl

  return undefined
}

/**
 * Resolve a ready session for tool calls.
 * On Vercel/serverless: use access_token (JWT) or DATABASE_URL to reconnect across lambdas.
 */
export async function resolveSessionForTool(
  sessionId?: string,
  databaseUrl?: string,
  accessToken?: string,
): Promise<SessionState | McpToolResult> {
  if (sessionId) {
    const byId = getSession(sessionId)
    if (byId) {
      if (byId.status === "ready") return byId
      return toolError(
        `Session not ready (status: ${byId.status}). Wait for connect to finish or call connect again.`,
      )
    }
  }

  const url = await resolveDatabaseUrlFromContext(databaseUrl, accessToken)
  if (!url) {
    if (sessionId || accessToken) {
      return toolError(
        isConnectionStoreEnabled()
          ? "Session expired on this server instance. Pass access_token from connect, or Authorization: Bearer <token> header."
          : "Session expired or not found on this server instance. Call connect again with database_url (your Postgres connection string).",
      )
    }
    return toolError(
      isConnectionStoreEnabled()
        ? "No database session. Call connect with database_url once — it returns an access_token. Use that token on all later tool calls."
        : "No database session. Call connect with database_url, or send DATABASE_URL on every MCP request header.",
    )
  }

  try {
    const session = await ensureConnected(url)
    if (sessionId && session.id !== sessionId) {
      logger.info("Session recovered (serverless)", {
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

export function getReadySessionId(session: SessionState): string {
  return session.id
}

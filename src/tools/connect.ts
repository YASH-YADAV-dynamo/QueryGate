import { z } from "zod"
import { ensureConnected, getReadySessionId } from "../session/ensure.js"
import { inferAliases, addAlias } from "../session/alias-store.js"
import { getSession } from "../session/manager.js"
import { config, CONSTANTS } from "../config/index.js"
import { runWithDatabaseUrlAsync } from "../context.js"
import {
  createStoredConnection,
  isConnectionStoreEnabled,
} from "../store/connection-store.js"
import { logger } from "../utils/logger.js"
import { McpError, toMcpError } from "../utils/error.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

const ConnectInputSchema = z.object({
  database_url: z
    .string()
    .optional()
    .describe(
      "User's full Postgres URL — required once. Server encrypts and stores it; returns access_token for later calls.",
    ),
})

type ConnectInput = z.infer<typeof ConnectInputSchema>

function resolveDatabaseUrl(args: ConnectInput): string | undefined {
  if (args.database_url) return args.database_url
  try {
    return config.DATABASE_URL
  } catch {
    return undefined
  }
}

async function handleConnect(args: ConnectInput): Promise<McpToolResult> {
  const databaseUrl = resolveDatabaseUrl(args)
  if (!databaseUrl) {
    return toolError(
      "database_url is required on first connect. Pass the user's full Postgres connection string — QueryGate connects server-side and returns an access_token.",
    )
  }

  try {
    let stored: { connectionId: string; accessToken: string } | undefined
    if (isConnectionStoreEnabled()) {
      stored = await createStoredConnection(databaseUrl)
    }

    const session = await ensureConnected(databaseUrl)
    const schema = session.schema
    const liveSession = getSession(session.id)!

    let autoApplied = 0
    const inferred = inferAliases(schema)
    for (const alias of inferred) {
      if (alias.confidence >= CONSTANTS.ALIAS_CONFIDENCE_THRESHOLD) {
        const result = addAlias(liveSession.aliases, alias)
        if (result.ok) autoApplied++
      }
    }

    const tableList = Array.from(schema.tables.keys())
    const preview = tableList.slice(0, 15).join(", ")
    const overflow = tableList.length > 15 ? ` … +${tableList.length - 15} more` : ""

    logger.info("Connect complete", {
      sessionId: session.id,
      tables: schema.tables.size,
      stored: Boolean(stored),
    })

    const lines = [
      `Connected to: ${schema.dbName} (PostgreSQL ${schema.version.split(" ")[0]})`,
      `Session ID: ${getReadySessionId(session)}`,
      "",
      `Tables (${schema.tables.size}): ${preview}${overflow}`,
      `PII-flagged tables: ${schema.piiTables.size}`,
      `Auto-inferred aliases: ${autoApplied}`,
    ]

    if (stored) {
      lines.push(
        "",
        `Connection ID: ${stored.connectionId}`,
        `Access token: ${stored.accessToken}`,
        "",
        "Use access_token on all later tool calls (or Authorization: Bearer header).",
        "Do NOT send database_url again — the server decrypts your URL from Postgres using this token.",
      )
    } else {
      lines.push(
        "",
        "Use session_id for schema_reader and execute_sql.",
        "On hosted Vercel, set QUERYGATE_STORE_URL + JWT_SECRET + ENCRYPTION_KEY for JWT-based reconnect.",
      )
    }

    return toolOk(lines.join("\n"))
  } catch (err) {
    const mcpErr = err instanceof McpError ? err : toMcpError(err, "DB_CONNECT_FAILED")
    const hint =
      mcpErr.code === "SCHEMA_BUILD_FAILED"
        ? "\n\nEnsure tables exist in Neon and the project is not suspended."
        : "\n\nUse Neon pooled URL with ?sslmode=require"
    return toolError(`Connection failed: ${mcpErr.message}${hint}`)
  }
}

export const connectTool = defineTool({
  name: "connect",
  description: `Connect QueryGate to the user's PostgreSQL database (server-side).

Pass database_url ONCE with the user's full connection string.
The server encrypts the URL in Postgres and returns an access_token (JWT with connection id only).

After connect, use access_token on schema_reader, execute_sql, insight, etc.
ChatGPT should store the token — never send the raw database URL again.`,
  inputSchema: {
    type: "object",
    properties: {
      database_url: {
        type: "string",
        description:
          "Full Postgres URL (first connect only): postgres://user:password@host.neon.tech/dbname?sslmode=require",
      },
    },
    required: [],
  },
  handler: handleConnect,
})

export { handleConnect }

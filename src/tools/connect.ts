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
import { toolOk, toolError, toolOkStructured } from "./core/response.js"
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
    // Connect to user DB first — schema load must succeed even if metadata store is slow
    const session = await ensureConnected(databaseUrl)
    const schema = session.schema
    const liveSession = getSession(session.id)!

    let stored: { connectionId: string; accessToken: string } | undefined
    if (isConnectionStoreEnabled()) {
      try {
        stored = await createStoredConnection(databaseUrl)
      } catch (storeErr) {
        logger.error("Connection store failed (JWT unavailable this request)", {
          error: storeErr instanceof Error ? storeErr.message : String(storeErr),
        })
      }
    }

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

    const structured = {
      access_token: stored?.accessToken ?? null,
      connection_id: stored?.connectionId ?? null,
      session_id: getReadySessionId(session),
      database: schema.dbName,
      tables: tableList,
      store_enabled: isConnectionStoreEnabled(),
      hosted_note: stored
        ? "REQUIRED: pass access_token on ALL later tools (schema_reader, execute_sql, customer_analytics). session_id does NOT work across Vercel requests."
        : "Set QUERYGATE_STORE_URL on server for JWT tokens. Until then pass database_url on every tool call.",
    }

    logger.info("Connect complete", {
      sessionId: session.id,
      tables: schema.tables.size,
      stored: Boolean(stored),
    })

    const lines: string[] = []

    if (stored) {
      lines.push(
        "=== ACCESS TOKEN (use on every later tool call) ===",
        stored.accessToken,
        "",
        `Connection ID: ${stored.connectionId}`,
        "⚠ session_id below is NOT reliable on hosted Vercel — always pass access_token",
        "",
      )
    }

    lines.push(
      `Connected to: ${schema.dbName} (PostgreSQL ${schema.version.split(" ")[0]})`,
      `Session ID (ephemeral): ${getReadySessionId(session)}`,
      "",
      `Tables (${schema.tables.size}): ${preview}${overflow}`,
      `PII-flagged tables: ${schema.piiTables.size}`,
      `Auto-inferred aliases: ${autoApplied}`,
    )

    if (stored) {
      lines.push(
        "",
        "Next: schema_reader({ access_token: \"<token above>\" }) then execute_sql({ access_token, sql }).",
      )
    } else {
      lines.push(
        "",
        "Hosted Vercel: enable QUERYGATE_STORE_URL + JWT_SECRET + ENCRYPTION_KEY for access_token.",
        "Until then: pass database_url on every tool call.",
      )
    }

    return toolOkStructured(lines.join("\n"), structured)
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

Pass database_url ONCE. Server encrypts it in Postgres and returns access_token (JWT).
Use access_token on ALL subsequent calls — execute_sql, schema_reader, customer_analytics.
Do NOT pass database_url again after getting access_token.`,
  inputSchema: {
    type: "object",
    properties: {
      database_url: {
        type: "string",
        description:
          "Full Postgres URL (first time only): postgres://user:password@host/dbname?sslmode=require",
      },
    },
    required: [],
  },
  meta: { "x-openai-isConsequential": false },
  handler: handleConnect,
})

export { handleConnect }

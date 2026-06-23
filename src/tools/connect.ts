import { z } from "zod"
import { ensureConnected, getReadySessionId } from "../session/ensure.js"
import { inferAliases, addAlias } from "../session/alias-store.js"
import { getSession } from "../session/manager.js"
import { config, CONSTANTS } from "../config/index.js"
import { runWithDatabaseUrlAsync } from "../context.js"
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
      "REQUIRED for ChatGPT/hosted: user's full Postgres URL (postgres://user:pass@host/db?sslmode=require). Server connects and loads schema from this URL.",
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
      "database_url is required. Pass the user's full Postgres connection string in this tool call — QueryGate connects server-side (Neon/Vercel) using that URL.",
    )
  }

  try {
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
    })

    return toolOk(
      `Connected to: ${schema.dbName} (PostgreSQL ${schema.version.split(" ")[0]})\n` +
        `Session ID: ${getReadySessionId(session)}\n` +
        `\nTables (${schema.tables.size}): ${preview}${overflow}\n` +
        `PII-flagged tables: ${schema.piiTables.size}\n` +
        `Auto-inferred aliases: ${autoApplied}\n` +
        `\nServer connected directly to your database. Use this session_id for schema_reader and execute_sql.`,
    )
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

ALWAYS pass database_url with the user's full connection string when using ChatGPT/hosted MCP.
The server (Vercel) connects to Neon/Postgres — not the user's browser.

Returns session_id for schema_reader, execute_sql, insight, customer_analytics.`,
  inputSchema: {
    type: "object",
    properties: {
      database_url: {
        type: "string",
        description:
          "Full Postgres URL: postgres://user:password@host.neon.tech/dbname?sslmode=require",
      },
    },
    required: [],
  },
  handler: handleConnect,
})

export { handleConnect }

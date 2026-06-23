import { z } from "zod"
import { getOrCreatePool } from "../db/connector.js"
import { buildSchemaStore } from "../rag/schema-pipeline.js"
import { inferAliases, addAlias } from "../session/alias-store.js"
import { createSession, updateSessionStatus, getSession } from "../session/manager.js"
import { config, CONSTANTS } from "../config/index.js"
import { runWithDatabaseUrlAsync } from "../context.js"
import { logger } from "../utils/logger.js"
import { toMcpError, McpError } from "../utils/error.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

const ConnectInputSchema = z.object({
  database_url: z
    .string()
    .optional()
    .describe(
      "PostgreSQL connection string (postgres://user:pass@host:5432/db). Required when DATABASE_URL is not in env/headers.",
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
      "No database configured. Ask the user for their Postgres connection string, then call connect again with database_url (postgres://user:pass@host:5432/db).",
    )
  }

  return runWithDatabaseUrlAsync(databaseUrl, async () => {
    const session = createSession(databaseUrl)

    try {
      updateSessionStatus(session.id, "connecting")
      const pool = await getOrCreatePool(databaseUrl)

      updateSessionStatus(session.id, "schema_load")
      const schema = await buildSchemaStore(pool)

      const liveSession = getSession(session.id)!
      liveSession.schema = schema

      const inferred = inferAliases(schema)
      let autoApplied = 0
      for (const alias of inferred) {
        if (alias.confidence >= CONSTANTS.ALIAS_CONFIDENCE_THRESHOLD) {
          const result = addAlias(liveSession.aliases, alias)
          if (result.ok) autoApplied++
        }
      }

      updateSessionStatus(session.id, "ready")

      const tableList = Array.from(schema.tables.keys())
      const preview = tableList.slice(0, 15).join(", ")
      const overflow = tableList.length > 15 ? ` … +${tableList.length - 15} more` : ""

      logger.info("Connect complete", {
        sessionId: session.id,
        tables: schema.tables.size,
        piiTables: schema.piiTables.size,
      })

      return toolOk(
        `Connected to: ${schema.dbName} (PostgreSQL ${schema.version.split(" ")[0]})\n` +
          `Session ID: ${session.id}\n` +
          `\nTables (${schema.tables.size}): ${preview}${overflow}\n` +
          `PII-flagged tables: ${schema.piiTables.size}\n` +
          `Auto-inferred aliases: ${autoApplied}\n` +
          `\nNext steps:\n` +
          `  → Call schema_reader to explore table structures\n` +
          `  → Call execute_sql with SELECT queries\n` +
          `  → Call set_alias to map friendly names to real table names`,
      )
    } catch (err) {
      const mcpErr = err instanceof McpError ? err : toMcpError(err, "DB_CONNECT_FAILED")
      updateSessionStatus(session.id, "error", mcpErr.message)
      const hint =
        mcpErr.code === "SCHEMA_BUILD_FAILED"
          ? "\n\nNeon: wake project in console, run seed/demo.sql if empty, retry connect with database_url."
          : mcpErr.code === "DB_CONNECT_FAILED"
            ? "\n\nUse postgres://USER:PASS@HOST/DB?sslmode=require (Neon pooled URL recommended)."
            : ""
      return toolError(`Connection failed: ${mcpErr.message}${hint}`)
    }
  })
}

export const connectTool = defineTool({
  name: "connect",
  description: `Connect to a PostgreSQL database and load its schema into memory.

Provide database_url when the user gives you their Postgres connection string in chat.
If DATABASE_URL is already in env (stdio) or headers (HTTP), you can omit database_url.

Returns:
- session_id: pass this to all subsequent tool calls
- List of tables found
- PII-flagged table count
- Auto-inferred aliases

Call this once at the start of a conversation.`,
  inputSchema: {
    type: "object",
    properties: {
      database_url: {
        type: "string",
        description:
          "postgres://user:password@host:5432/database — from the user when not pre-configured",
      },
    },
    required: [],
  },
  handler: handleConnect,
})

export { handleConnect }

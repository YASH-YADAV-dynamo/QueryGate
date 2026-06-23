import { getOrCreatePool } from "../db/connector.js"
import { buildSchemaStore } from "../rag/schema-pipeline.js"
import { inferAliases, addAlias } from "../session/alias-store.js"
import { createSession, updateSessionStatus, getSession } from "../session/manager.js"
import { config, CONSTANTS } from "../config/index.js"
import { logger } from "../utils/logger.js"
import { toMcpError } from "../utils/error.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

async function handleConnect(_args: Record<string, never>): Promise<McpToolResult> {
  const databaseUrl = config.DATABASE_URL
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
    const mcpErr = toMcpError(err, "DB_CONNECT_FAILED")
    updateSessionStatus(session.id, "error", mcpErr.message)
    return toolError(`Connection failed: ${mcpErr.message}`)
  }
}

export const connectTool = defineTool({
  name: "connect",
  description: `Connect to the configured PostgreSQL database and load its schema into memory.

DATABASE_URL is configured in mcp.json — you don't need to pass it here.

Returns:
- session_id: pass this to all subsequent tool calls
- List of tables found
- PII-flagged table count
- Auto-inferred aliases

Call this once at the start of a conversation. The schema stays in RAM for the session.`,
  inputSchema: { type: "object", properties: {}, required: [] },
  handler: handleConnect,
})

export { handleConnect }

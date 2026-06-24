import { z } from "zod"
import { ensureConnected, getReadySessionId } from "../session/ensure.js"
import { inferAliases, addAlias } from "../session/alias-store.js"
import { getSession } from "../session/manager.js"
import { CONSTANTS } from "../config/index.js"
import { normalizeDatabaseUrl } from "../db/connector.js"
import { createStoredConnection, isConnectionStoreEnabled } from "../store/connection-store.js"
import { logger } from "../utils/logger.js"
import { McpError, toMcpError } from "../utils/error.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError, toolOkStructured } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

const ConnectInputSchema = z.object({
  database_url: z
    .string()
    .optional()
    .describe("Postgres connection URL. Required on first call — returns access_token for all later calls."),
})

type ConnectInput = z.infer<typeof ConnectInputSchema>

async function handleConnect(args: ConnectInput): Promise<McpToolResult> {
  const raw = args.database_url ?? process.env.DATABASE_URL
  if (!raw) {
    return toolError(
      "database_url is required. Pass the full Postgres URL: " +
        "postgres://user:password@host/dbname?sslmode=require\n\n" +
        "QueryGate connects server-side — the URL never leaves the server.",
    )
  }

  // Normalize immediately — strips channel_binding and other pooler-breaking params.
  const databaseUrl = normalizeDatabaseUrl(raw)

  try {
    const session = await ensureConnected(databaseUrl)
    const schema = session.schema
    const liveSession = getSession(session.id)!

    // Always issue a JWT when JWT_SECRET is configured (Vercel / hosted mode).
    let stored: { connectionId: string; accessToken: string } | undefined
    if (isConnectionStoreEnabled()) {
      try {
        stored = await createStoredConnection(databaseUrl)
      } catch (storeErr) {
        logger.error("JWT signing failed", {
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

    logger.info("Connect complete", {
      sessionId: getReadySessionId(session),
      tables: schema.tables.size,
      tokenIssued: Boolean(stored),
    })

    const lines: string[] = []

    if (stored) {
      lines.push(
        "╔══════════════════════════════════════════════════════╗",
        "║  ACCESS TOKEN — copy and pass on every tool call     ║",
        "╚══════════════════════════════════════════════════════╝",
        stored.accessToken,
        "",
      )
    }

    lines.push(
      `✓ Connected: ${schema.dbName} (PostgreSQL ${schema.version.split(" ")[0]})`,
      `  Tables (${schema.tables.size}): ${preview}${overflow}`,
      `  PII-flagged: ${schema.piiTables.size}  Auto-aliases: ${autoApplied}`,
    )

    if (stored) {
      lines.push(
        "",
        "Next steps:",
        '  query({ access_token: "<token>", action: "schema" })       ← list all tables',
        '  query({ access_token: "<token>", action: "sql", sql: "SELECT NOW()" })  ← smoke test',
        '  analytics({ access_token: "<token>", action: "dashboard" }) ← customer analytics',
      )
    } else {
      lines.push(
        "",
        "Set JWT_SECRET on the server to get a persistent access_token.",
        "Until then pass database_url on every tool call.",
      )
    }

    return toolOkStructured(lines.join("\n"), {
      access_token: stored?.accessToken ?? null,
      connection_id: stored?.connectionId ?? null,
      database: schema.dbName,
      tables: tableList,
      token_issued: Boolean(stored),
      note: stored
        ? "Pass access_token on every tool call — it is self-contained, no Prisma lookup needed."
        : "JWT_SECRET not set — pass database_url on every tool call instead.",
    })
  } catch (err) {
    const mcpErr = err instanceof McpError ? err : toMcpError(err, "DB_CONNECT_FAILED")
    const isNeon = databaseUrl.includes("neon.tech")
    const hint = isNeon
      ? "\n\nNeon tips:\n• Use the pooled connection string from the Neon dashboard\n• Add ?sslmode=require\n• Do NOT include channel_binding=require\n• Ensure the project is not suspended"
      : "\n\nEnsure the server is reachable and SSL settings are correct."
    return toolError(`Connection failed: ${mcpErr.message}${hint}`)
  }
}

export const connectTool = defineTool({
  name: "connect",
  description: `Connect to the user's PostgreSQL database. Call ONCE with database_url — returns access_token.

Pass access_token on ALL subsequent calls (query, analytics). No need to call connect again.
The token is self-contained — works across serverless cold starts without any Prisma lookup.`,
  inputSchema: {
    type: "object",
    properties: {
      database_url: {
        type: "string",
        description:
          "Full Postgres URL: postgres://user:password@host/dbname?sslmode=require\n" +
          "Use pooled connection string for Neon. Do NOT include channel_binding=require.",
      },
    },
    required: [],
  },
  meta: { "x-openai-isConsequential": false },
  handler: handleConnect,
})

export { handleConnect }

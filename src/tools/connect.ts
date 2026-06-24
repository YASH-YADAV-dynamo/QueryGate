import { z } from "zod"
import { ensureConnected, getReadySessionId } from "../session/ensure.js"
import { inferAliases, addAlias } from "../session/alias-store.js"
import { getSession } from "../session/manager.js"
import { CONSTANTS } from "../config/index.js"
import { normalizeDatabaseUrl } from "../db/connector.js"
import { createStoredConnection, isConnectionStoreEnabled } from "../store/connection-store.js"
import { resolveDatabaseUrlFromEnv } from "../config/postgres-url.js"
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
  const raw = args.database_url ?? resolveDatabaseUrlFromEnv()
  if (!raw) {
    return toolError(
      "No database URL available.\n\n" +
        "Set QUERYGATE_STORE_URL in server env (your .env / Vercel), or pass database_url once.\n" +
        "Example: postgresql://user:pass@host.neon.tech/neondb?sslmode=require",
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

    // Extract host/db/code from underlying pg error for max-signal diagnostics
    const cause = err instanceof Error ? err : undefined
    const pgCode = (cause as { code?: string })?.code
    const safeUrl = redactPassword(databaseUrl)
    const parsed = parseUrl(databaseUrl)

    const lines = [
      `ERROR: Connection failed.`,
      "",
      `Reason: ${mcpErr.message}`,
      pgCode ? `pg code: ${pgCode}` : "",
      "",
      `Host:     ${parsed.host ?? "?"}`,
      `Database: ${parsed.database ?? "?"}`,
      `SSL:      ${parsed.sslmode ?? "(not set)"}`,
      `URL:      ${safeUrl}`,
      "",
      databaseUrl.includes("neon.tech")
        ? [
            "Neon checklist:",
            "  • Use the POOLED connection string (Neon dashboard → Connection string → Pooled)",
            "  • Must include ?sslmode=require",
            "  • Must NOT include channel_binding=require (we strip it but the source URL still matters)",
            "  • Project must be active (suspended Neon projects refuse connections)",
            "  • Verify the password — Neon sometimes rotates after long idle",
          ].join("\n")
        : [
            "Direct Postgres checklist:",
            "  • Host is reachable from Vercel (no IP allowlist blocking)",
            "  • SSL is enabled (?sslmode=require)",
            "  • User/password are correct",
            "  • Database name exists",
          ].join("\n"),
      "",
      "Quick local sanity check:",
      `  psql "${redactPassword(databaseUrl)}"`,
    ]
      .filter(Boolean)
      .join("\n")

    return toolError(lines)
  }
}

/** Strip the password from a Postgres URL for safe display in error messages. */
function redactPassword(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = "***"
    return u.toString()
  } catch {
    return url.replace(/:([^:@/]+)@/, ":***@")
  }
}

function parseUrl(url: string): { host?: string; database?: string; sslmode?: string } {
  try {
    const u = new URL(url)
    const sslmode = u.searchParams.get("sslmode")
    const out: { host?: string; database?: string; sslmode?: string } = {
      host: u.host,
      database: u.pathname.replace(/^\//, ""),
    }
    if (sslmode) out.sslmode = sslmode
    return out
  } catch {
    return {}
  }
}

export const connectTool = defineTool({
  name: "connect",
  description: `Connect to PostgreSQL. Returns access_token for later tool calls.

If QUERYGATE_STORE_URL is set on the server (.env / Vercel), call connect with NO args — it uses that URL automatically.
Otherwise pass database_url once. channel_binding=require is stripped automatically.`,
  inputSchema: {
    type: "object",
    properties: {
      database_url: {
        type: "string",
        description:
          "Optional when QUERYGATE_STORE_URL is set on the server. " +
          "Otherwise pass full Postgres URL once: postgres://user:pass@host.neondb?sslmode=require",
      },
    },
    required: [],
  },
  meta: { "x-openai-isConsequential": false },
  handler: handleConnect,
})

export { handleConnect }

import { z } from "zod"

// DATABASE_URL comes from mcp.json env block — never a .env file
// The MCP client (Claude Desktop, Cursor, ChatGPT) injects it at startup
const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL must be set in mcp.json env block"),
  MCP_SESSION_TTL_MS: z.coerce.number().default(7_200_000),
  MCP_MAX_ROWS: z.coerce.number().default(500),
  MCP_QUERY_TIMEOUT_MS: z.coerce.number().default(10_000),
  MCP_RATE_LIMIT: z.coerce.number().default(30),
})

function loadConfig() {
  const result = ConfigSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.errors.map((e) => e.message).join(", ")
    // Write to stderr — MCP stdout must stay clean for protocol messages
    process.stderr.write(`[db-mcp] Config error: ${missing}\n`)
    process.exit(1)
  }
  return result.data
}

export const config = loadConfig()

export const CONSTANTS = {
  SCHEMA_CACHE_TTL_MS: 30 * 60 * 1000,
  SCHEMA_CACHE_MAX_BYTES: 200 * 1024 * 1024,
  QUERY_CACHE_TTL_MS: 5 * 60 * 1000,
  QUERY_CACHE_MAX_BYTES: 50 * 1024 * 1024,
  EMBED_CACHE_MAX_BYTES: 50 * 1024 * 1024,
  MAX_SESSIONS: 10,
  HISTORY_RING_SIZE: 50,
  RAG_TOP_K: 5,
  ALIAS_CONFIDENCE_THRESHOLD: 0.7,
  MAX_ALIASES: 200,
} as const

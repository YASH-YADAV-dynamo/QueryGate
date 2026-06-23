import { z } from "zod"
import { getRequestDatabaseUrl } from "../context.js"

const SettingsSchema = z.object({
  DATABASE_URL: z.string().optional(),
  MCP_SESSION_TTL_MS: z.coerce.number().default(7_200_000),
  MCP_MAX_ROWS: z.coerce.number().default(500),
  MCP_QUERY_TIMEOUT_MS: z.coerce.number().default(10_000),
  MCP_RATE_LIMIT: z.coerce.number().default(30),
  /** Set MCP_SCHEMA_SAMPLES=1 to fetch example cell values at connect (default: off). */
  MCP_SCHEMA_SAMPLES: z
    .union([z.literal("0"), z.literal("1"), z.literal("true"), z.literal("false")])
    .optional(),
})

export const settings = SettingsSchema.parse(process.env)

export function getDatabaseUrl(): string {
  const fromRequest = getRequestDatabaseUrl()
  if (fromRequest) return fromRequest

  const envUrl = settings.DATABASE_URL ?? process.env.DATABASE_URL
  if (envUrl) return envUrl

  throw new Error(
    "DATABASE_URL must be set in the MCP env block (stdio) or DATABASE_URL / X-Database-Url header (HTTP)",
  )
}

/** Lazy config — DATABASE_URL may come from per-request headers on Vercel. */
export const config = {
  get DATABASE_URL() {
    return getDatabaseUrl()
  },
  get MCP_SESSION_TTL_MS() {
    return settings.MCP_SESSION_TTL_MS
  },
  get MCP_MAX_ROWS() {
    return settings.MCP_MAX_ROWS
  },
  get MCP_QUERY_TIMEOUT_MS() {
    return settings.MCP_QUERY_TIMEOUT_MS
  },
  get MCP_RATE_LIMIT() {
    return settings.MCP_RATE_LIMIT
  },
  get MCP_SCHEMA_SAMPLES() {
    const v = settings.MCP_SCHEMA_SAMPLES ?? process.env.MCP_SCHEMA_SAMPLES
    return v === "1" || v === "true"
  },
}

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

export function requireEnvDatabaseUrl(): void {
  // No-op — DATABASE_URL is resolved per request (headers) or via connect tool (database_url).
}

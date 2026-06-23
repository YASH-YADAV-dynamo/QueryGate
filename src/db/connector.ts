import pg from "pg"
import { createHash } from "crypto"
import { McpError } from "../utils/error.js"
import { logger } from "../utils/logger.js"

const pools = new Map<string, pg.Pool>()

/** Hash the connection string so we never store raw credentials */
export function connId(databaseUrl: string): string {
  return createHash("sha256").update(databaseUrl).digest("hex").slice(0, 16)
}

function isLocalHost(databaseUrl: string): boolean {
  return databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
}

/** Neon/serverless-friendly pool options */
function buildPoolConfig(databaseUrl: string): pg.PoolConfig {
  const isLocal = isLocalHost(databaseUrl)
  return {
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: isLocal ? 10_000 : 25_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  }
}

export async function getOrCreatePool(databaseUrl: string): Promise<pg.Pool> {
  const id = connId(databaseUrl)
  const existing = pools.get(id)
  if (existing) return existing

  const pool = new pg.Pool(buildPoolConfig(databaseUrl.trim()))

  try {
    const client = await pool.connect()
    client.release()
    pools.set(id, pool)
    logger.info("DB pool created", { connId: id })
    return pool
  } catch (err) {
    await pool.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    const hint = databaseUrl.includes("neon.tech")
      ? " Neon tip: use the pooled connection string from the Neon dashboard, ensure the project is not suspended, and add ?sslmode=require if needed."
      : ""
    throw new McpError("DB_CONNECT_FAILED", `Cannot connect to database: ${msg}.${hint}`)
  }
}

export async function closePool(databaseUrl: string): Promise<void> {
  const id = connId(databaseUrl)
  const pool = pools.get(id)
  if (!pool) return
  await pool.end()
  pools.delete(id)
  logger.info("DB pool closed", { connId: id })
}

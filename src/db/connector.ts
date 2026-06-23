import pg from "pg"
import { createHash } from "crypto"
import { McpError } from "../utils/error.js"
import { logger } from "../utils/logger.js"

const pools = new Map<string, pg.Pool>()

/** Hash the connection string so we never store raw credentials */
export function connId(databaseUrl: string): string {
  return createHash("sha256").update(databaseUrl).digest("hex").slice(0, 16)
}

export async function getOrCreatePool(databaseUrl: string): Promise<pg.Pool> {
  const id = connId(databaseUrl)
  const existing = pools.get(id)
  if (existing) return existing

  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  })

  // Verify connectivity immediately
  try {
    const client = await pool.connect()
    client.release()
    pools.set(id, pool)
    logger.info("DB pool created", { connId: id })
    return pool
  } catch (err) {
    await pool.end().catch(() => {})
    throw new McpError(
      "DB_CONNECT_FAILED",
      `Cannot connect to database: ${err instanceof Error ? err.message : String(err)}`,
    )
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

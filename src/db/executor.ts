import type pg from "pg"
import { config } from "../config/index.js"
import { McpError } from "../utils/error.js"
import { logger } from "../utils/logger.js"

export interface ExecuteResult {
  rows: unknown[]
  rowCount: number
  durationMs: number
  truncated: boolean
}

export async function executeQuery(
  pool: pg.Pool,
  sql: string,
  timeoutMs = config.MCP_QUERY_TIMEOUT_MS,
  maxRows = config.MCP_MAX_ROWS,
): Promise<ExecuteResult> {
  const start = Date.now()
  const client = await pool.connect()

  try {
    // Enforce read-only at the transaction level — belt AND suspenders
    await client.query("BEGIN TRANSACTION READ ONLY")
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`)

    const result = await client.query({
      text: sql,
      rowMode: "array",
    })

    await client.query("COMMIT")

    const allRows = result.rows as unknown[]
    const truncated = allRows.length > maxRows
    const rows = truncated ? allRows.slice(0, maxRows) : allRows

    // Re-attach field names so rows are [{col: val}] not [val]
    const named = rows.map((row) => {
      const obj: Record<string, unknown> = {}
      ;(result.fields ?? []).forEach((f, i) => {
        obj[f.name] = (row as unknown[])[i]
      })
      return obj
    })

    const durationMs = Date.now() - start
    logger.info("Query executed", { rowCount: named.length, durationMs, truncated })

    return { rows: named, rowCount: named.length, durationMs, truncated }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)

    if (msg.includes("statement timeout")) {
      throw new McpError("DB_TIMEOUT", `Query exceeded ${timeoutMs}ms timeout`)
    }
    throw new McpError("DB_QUERY_FAILED", msg)
  } finally {
    client.release()
  }
}

/** Fetch a few sample values for a column — used during schema build */
export async function fetchSampleValues(
  pool: pg.Pool,
  schema: string,
  table: string,
  column: string,
  limit = 3,
): Promise<string[]> {
  try {
    const sql = `
      SELECT DISTINCT "${column}"::text AS v
      FROM "${schema}"."${table}"
      WHERE "${column}" IS NOT NULL
      LIMIT ${limit}
    `
    const result = await pool.query<{ v: string }>(sql)
    return result.rows.map((r) => r.v)
  } catch {
    return []
  }
}

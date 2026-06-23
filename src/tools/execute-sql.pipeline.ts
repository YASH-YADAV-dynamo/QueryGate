/**
 * SQL execution pipeline — validates, executes, caches, and masks PII.
 */

import { createHash, randomUUID } from "crypto"
import type { SessionState, QueryCacheEntry } from "../db/types.js"
import { validateSql, tickRateLimit } from "../security/validator.js"
import { executeQuery } from "../db/executor.js"
import { getOrCreatePool } from "../db/connector.js"
import { maskIfPii } from "../security/pii-detector.js"
import { getRateLimit } from "../session/manager.js"
import { logger } from "../utils/logger.js"
import { McpError } from "../utils/error.js"
import { config } from "../config/index.js"

function queryCacheKey(sessionId: string, sql: string): string {
  return createHash("sha256")
    .update(sessionId + sql.trim().toLowerCase())
    .digest("hex")
    .slice(0, 20)
}

export interface ExecuteToolResult {
  rows: unknown[]
  rowCount: number
  cached: boolean
  truncated: boolean
  durationMs: number
  pipelineId: string
  sql: string
}

export async function executeSqlPipeline(
  sql: string,
  sessionId: string,
  session: SessionState,
): Promise<ExecuteToolResult> {
  const pipelineId = randomUUID()
  const startedAt = Date.now()
  const cacheKey = queryCacheKey(sessionId, sql)

  const hit = session.cache.query.get(cacheKey)
  if (hit) {
    logger.info("Query cache hit", { sessionId, key: cacheKey })
    session.stats.cacheHits++
    return {
      rows: hit.rows,
      rowCount: hit.rowCount,
      cached: true,
      truncated: false,
      durationMs: Date.now() - startedAt,
      pipelineId,
      sql: hit.sql,
    }
  }

  const rateLimit = getRateLimit(sessionId)
  const validation = validateSql(sql, {
    schema: session.schema,
    rateLimit,
    sessionId,
  })

  if (!validation.passed) {
    throw new McpError("VALIDATION_BLOCKED", validation.blocked.join("; "))
  }
  tickRateLimit(rateLimit)

  const pool = await getOrCreatePool(config.DATABASE_URL)
  const execResult = await executeQuery(
    pool,
    sql,
    config.MCP_QUERY_TIMEOUT_MS,
    config.MCP_MAX_ROWS,
  )

  const piiColumnMap = new Map<string, "high" | "low" | "none">()
  for (const table of session.schema.tables.values()) {
    for (const col of table.columns) {
      piiColumnMap.set(col.name, col.piiRisk)
    }
  }

  const cleanRows = execResult.rows.map((row) => {
    if (typeof row !== "object" || row === null) return row
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = maskIfPii(v, piiColumnMap.get(k) ?? "none")
    }
    return out
  })

  const entry: QueryCacheEntry = {
    question: sql,
    sql,
    rows: cleanRows,
    rowCount: cleanRows.length,
    executedAt: Date.now(),
    durationMs: execResult.durationMs,
    cacheKey,
  }
  session.cache.query.set(cacheKey, entry)

  session.stats.totalQueries++
  session.stats.totalRows += cleanRows.length
  session.stats.avgDurationMs =
    (session.stats.avgDurationMs * (session.stats.totalQueries - 1) + execResult.durationMs) /
    session.stats.totalQueries

  session.history.push({
    id: pipelineId,
    question: sql,
    sql,
    status: "ok",
    rowCount: cleanRows.length,
    durationMs: execResult.durationMs,
    ts: Date.now(),
  })

  return {
    rows: cleanRows,
    rowCount: cleanRows.length,
    cached: false,
    truncated: execResult.truncated,
    durationMs: execResult.durationMs,
    pipelineId,
    sql,
  }
}

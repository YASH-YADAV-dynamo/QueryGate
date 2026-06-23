import type pg from "pg"
import type { TableMeta } from "./types.js"
import { logger } from "../utils/logger.js"

/** Run inspect query — failure returns fallback instead of aborting connect (Neon/serverless). */
export async function safeInspectQuery<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  label: string,
  sql: string,
  fallback: T[],
): Promise<T[]> {
  try {
    const result = await pool.query<T>(sql)
    return result.rows
  } catch (err) {
    logger.warn("Schema inspect query failed", {
      label,
      error: err instanceof Error ? err.message : String(err),
    })
    return fallback
  }
}

export interface SampleFetchLimits {
  maxTables: number
  maxColumnsPerTable: number
  concurrency: number
}

export const DEFAULT_SAMPLE_LIMITS: SampleFetchLimits = {
  maxTables: 25,
  maxColumnsPerTable: 4,
  concurrency: 6,
}

/** Fetch column samples with caps — avoids Neon/Vercel timeout on wide schemas. */
export async function fetchSamplesBounded(
  pool: pg.Pool,
  tables: TableMeta[],
  fetchSample: (
    pool: pg.Pool,
    schema: string,
    table: string,
    column: string,
  ) => Promise<string[]>,
  limits: SampleFetchLimits = DEFAULT_SAMPLE_LIMITS,
): Promise<void> {
  type Job = { schema: string; table: string; column: string; setSamples: (v: string[]) => void }
  const jobs: Job[] = []

  for (const table of tables.slice(0, limits.maxTables)) {
    let cols = 0
    for (const col of table.columns) {
      if (col.piiRisk !== "none") {
        col.sampleValues = ["[masked]"]
        continue
      }
      if (cols >= limits.maxColumnsPerTable) {
        col.sampleValues = []
        continue
      }
      cols++
      jobs.push({
        schema: table.schema,
        table: table.name,
        column: col.name,
        setSamples: (v) => {
          col.sampleValues = v
        },
      })
    }
  }

  for (let i = 0; i < jobs.length; i += limits.concurrency) {
    const batch = jobs.slice(i, i + limits.concurrency)
    await Promise.all(
      batch.map(async (job) => {
        const samples = await fetchSample(pool, job.schema, job.table, job.column)
        job.setSamples(samples)
      }),
    )
  }
}

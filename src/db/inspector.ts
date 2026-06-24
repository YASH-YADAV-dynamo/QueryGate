import type pg from "pg"
import type { ColumnMeta, TableMeta } from "./types.js"
import { PII_PATTERNS } from "../security/pii-detector.js"
import { safeInspectQuery } from "./schema-samples.js"

const INSPECT_COLUMNS_SQL = `
  SELECT
    c.table_schema,
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    tc.constraint_type
  FROM information_schema.columns c
  LEFT JOIN information_schema.key_column_usage kcu
    ON kcu.table_schema = c.table_schema
    AND kcu.table_name  = c.table_name
    AND kcu.column_name = c.column_name
  LEFT JOIN information_schema.table_constraints tc
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema   = c.table_schema
  WHERE c.table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
    AND c.table_schema NOT LIKE 'pg_temp%'
    AND c.table_schema NOT LIKE 'pg_toast_temp%'
  ORDER BY c.table_schema, c.table_name, c.ordinal_position
`

const INSPECT_FK_SQL = `
  SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_name  AS foreign_table,
    ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
    AND kcu.table_schema   = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema   = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema NOT IN ('pg_catalog','information_schema')
`

/**
 * Use GREATEST(n_live_tup, reltuples) so we get a non-zero estimate even if ANALYZE
 * has never run (n_live_tup=0) but the table was created with rows (reltuples > 0).
 */
const INSPECT_ROWCOUNTS_SQL = `
  SELECT
    n.nspname  AS table_schema,
    c.relname  AS table_name,
    GREATEST(COALESCE(s.n_live_tup, 0), c.reltuples::bigint, 0) AS row_estimate
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s
    ON s.schemaname = n.nspname AND s.relname = c.relname
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
    AND n.nspname NOT LIKE 'pg_temp%'
`

const INSPECT_INDEXES_SQL = `
  SELECT
    schemaname AS table_schema,
    tablename  AS table_name,
    indexname  AS index_name,
    indexdef
  FROM pg_indexes
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
`

export interface RawSchema {
  columns: RawColumn[]
  fks: RawFK[]
  rowCounts: Map<string, number>
  indexes: RawIndex[]
  dbName: string
  version: string
}

interface RawColumn {
  table_schema: string
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  constraint_type: string | null
}

interface RawFK {
  table_schema: string
  table_name: string
  column_name: string
  foreign_table: string
  foreign_column: string
}

interface RawIndex {
  table_schema: string
  table_name: string
  index_name: string
  indexdef: string
}

/** Real COUNT(*) for tables whose pg_stat estimate is 0 — bounded to avoid slow scans. */
const MAX_REAL_COUNTS = 50
const COUNT_TIMEOUT_MS = 3000

async function fillMissingCounts(
  pool: pg.Pool,
  rowCounts: Map<string, number>,
  knownTables: Set<string>,
): Promise<void> {
  const zeroTables = Array.from(knownTables).filter((fqn) => (rowCounts.get(fqn) ?? 0) === 0)
  if (zeroTables.length === 0) return

  const targets = zeroTables.slice(0, MAX_REAL_COUNTS)
  await Promise.all(
    targets.map(async (fqn) => {
      try {
        const [schema, table] = fqn.split(".")
        if (!schema || !table) return
        const client = await pool.connect()
        try {
          await client.query(`SET LOCAL statement_timeout = ${COUNT_TIMEOUT_MS}`)
          const result = await client.query<{ c: string }>(
            `SELECT COUNT(*)::text AS c FROM "${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`,
          )
          const count = Number(result.rows[0]?.c ?? 0)
          if (count > 0) rowCounts.set(fqn, count)
        } finally {
          client.release()
        }
      } catch {
        // ignore — keep the 0 estimate; user can still query the table
      }
    }),
  )
}

export async function inspectSchema(pool: pg.Pool): Promise<RawSchema> {
  const [cols, fks, rows, idxs, dbMetaRows] = await Promise.all([
    safeInspectQuery<RawColumn>(pool, "columns", INSPECT_COLUMNS_SQL, []),
    safeInspectQuery<RawFK>(pool, "foreign_keys", INSPECT_FK_SQL, []),
    safeInspectQuery<{ table_schema: string; table_name: string; row_estimate: string }>(
      pool,
      "row_counts",
      INSPECT_ROWCOUNTS_SQL,
      [],
    ),
    safeInspectQuery<RawIndex>(pool, "indexes", INSPECT_INDEXES_SQL, []),
    safeInspectQuery<{ db: string; ver: string }>(
      pool,
      "db_meta",
      "SELECT current_database() AS db, version() AS ver",
      [{ db: "unknown", ver: "unknown" }],
    ),
  ])

  const rowCounts = new Map<string, number>()
  for (const r of rows) {
    rowCounts.set(`${r.table_schema}.${r.table_name}`, Number(r.row_estimate))
  }

  // Real COUNT(*) for any table still showing 0 — fixes "ANALYZE never ran" empty estimates.
  const knownTables = new Set(cols.map((c) => `${c.table_schema}.${c.table_name}`))
  await fillMissingCounts(pool, rowCounts, knownTables)

  return {
    columns: cols,
    fks,
    rowCounts,
    indexes: idxs,
    dbName: dbMetaRows[0]?.db ?? "unknown",
    version: dbMetaRows[0]?.ver ?? "unknown",
  }
}

/** Build normalized TableMeta[] from raw inspection data (pure, no DB calls) */
export function normalizeSchema(raw: RawSchema): TableMeta[] {
  const tableMap = new Map<string, TableMeta>()

  // Group FK refs by table.column
  const fkMap = new Map<string, { table: string; column: string }>()
  for (const fk of raw.fks) {
    fkMap.set(
      `${fk.table_schema}.${fk.table_name}.${fk.column_name}`,
      { table: fk.foreign_table, column: fk.foreign_column },
    )
  }

  // Group indexes by table
  const idxMap = new Map<string, { name: string; columns: string[] }[]>()
  for (const idx of raw.indexes) {
    const key = `${idx.table_schema}.${idx.table_name}`
    const cols = idx.indexdef.match(/\(([^)]+)\)/)?.[1]?.split(",").map((s) => s.trim()) ?? []
    const arr = idxMap.get(key) ?? []
    arr.push({ name: idx.index_name, columns: cols })
    idxMap.set(key, arr)
  }

  for (const col of raw.columns) {
    const fqn = `${col.table_schema}.${col.table_name}`
    let table = tableMap.get(fqn)
    if (!table) {
      table = {
        schema: col.table_schema,
        name: col.table_name,
        fullyQualified: fqn,
        rowEstimate: raw.rowCounts.get(fqn) ?? 0,
        columns: [],
        indexes: idxMap.get(fqn) ?? [],
        embedding: [],
        embeddingText: "",
        ingestedAt: Date.now(),
      }
      tableMap.set(fqn, table)
    }

    const piiRisk = PII_PATTERNS.some((p) => p.test(col.column_name)) ? "high" : "none"
    const fkRef = fkMap.get(`${fqn}.${col.column_name}`) ?? null

    const column: ColumnMeta = {
      name: col.column_name,
      dataType: col.data_type,
      nullable: col.is_nullable === "YES",
      isPrimaryKey: col.constraint_type === "PRIMARY KEY",
      isForeignKey: col.constraint_type === "FOREIGN KEY",
      references: fkRef,
      piiRisk,
      sampleValues: [], // filled later by executor
    }
    table.columns.push(column)
  }

  return Array.from(tableMap.values())
}

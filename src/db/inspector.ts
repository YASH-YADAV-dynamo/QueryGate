import type pg from "pg"
import type { ColumnMeta, TableMeta } from "./types.js"
import { PII_PATTERNS } from "../security/pii-detector.js"

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

const INSPECT_ROWCOUNTS_SQL = `
  SELECT
    schemaname AS table_schema,
    tablename  AS table_name,
    n_live_tup AS row_estimate
  FROM pg_stat_user_tables
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

export async function inspectSchema(pool: pg.Pool): Promise<RawSchema> {
  const [cols, fks, rows, idxs, dbMeta] = await Promise.all([
    pool.query<RawColumn>(INSPECT_COLUMNS_SQL),
    pool.query<RawFK>(INSPECT_FK_SQL),
    pool.query<{ table_schema: string; table_name: string; row_estimate: string }>(
      INSPECT_ROWCOUNTS_SQL,
    ),
    pool.query<RawIndex>(INSPECT_INDEXES_SQL),
    pool.query<{ db: string; ver: string }>(
      "SELECT current_database() AS db, version() AS ver",
    ),
  ])

  const rowCounts = new Map<string, number>()
  for (const r of rows.rows) {
    rowCounts.set(`${r.table_schema}.${r.table_name}`, Number(r.row_estimate))
  }

  return {
    columns: cols.rows,
    fks: fks.rows,
    rowCounts,
    indexes: idxs.rows,
    dbName: dbMeta.rows[0]?.db ?? "unknown",
    version: dbMeta.rows[0]?.ver ?? "unknown",
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

import type pg from "pg"
import type { SchemaStore, TableMeta } from "../db/types.js"
import { inspectSchema, normalizeSchema } from "../db/inspector.js"
import { fetchSamplesBounded } from "../db/schema-samples.js"
import { fetchSampleValues } from "../db/executor.js"
import { detectPii } from "../security/pii-detector.js"
import { embedTexts } from "../rag/embedder.js"
import { logger } from "../utils/logger.js"
import { McpError } from "../utils/error.js"
import { config } from "../config/index.js"

function buildEmbeddingText(table: TableMeta): string {
  const cols = table.columns.map((c) => c.name).join(" ")
  return `${table.name} ${cols}`
}

function buildFkGraph(tables: TableMeta[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.references) {
        const from = table.fullyQualified
        // Find the target table's fully qualified name
        const targetFqn = Array.from(
          new Map(tables.map((t) => [t.name, t.fullyQualified])).entries(),
        ).find(([name]) => name === col.references!.table)?.[1]

        if (targetFqn) {
          const existing = graph.get(from) ?? []
          if (!existing.includes(targetFqn)) existing.push(targetFqn)
          graph.set(from, existing)

          // Bidirectional — so both sides show up in retrieval expansion
          const reverse = graph.get(targetFqn) ?? []
          if (!reverse.includes(from)) reverse.push(from)
          graph.set(targetFqn, reverse)
        }
      }
    }
  }
  return graph
}

export async function buildSchemaStore(
  pool: pg.Pool,
  dialect: "postgres" | "mysql" | "sqlite" = "postgres",
): Promise<SchemaStore> {
  logger.info("Schema pipeline started")

  try {
    // Step 1: inspect
    const raw = await inspectSchema(pool)
    logger.info("Schema inspected", { tableCount: raw.columns.length })

    if (raw.columns.length === 0) {
      throw new McpError(
        "SCHEMA_BUILD_FAILED",
        "No tables found in this database. Create tables first (e.g. run seed/demo.sql in Neon SQL editor), then call connect again.",
      )
    }

    // Step 2: normalize
    const tables = normalizeSchema(raw)
    logger.info("Schema normalized", { tableCount: tables.length })

    // Step 3: PII flags; optional sample values (off by default — metadata only)
    for (const table of tables) {
      for (const col of table.columns) {
        col.piiRisk = detectPii(col.name)
        if (!config.MCP_SCHEMA_SAMPLES) {
          col.sampleValues = col.piiRisk === "high" ? ["[masked]"] : []
        }
      }
    }
    if (config.MCP_SCHEMA_SAMPLES) {
      await fetchSamplesBounded(
        pool,
        tables,
        (p, schema, table, column) => fetchSampleValues(p, schema, table, column),
      )
    }

    // Step 4: build FK graph
    const fkGraph = buildFkGraph(tables)

    // Step 5: identify PII tables
    const piiTables = new Set(
      tables
        .filter((t) => t.columns.some((c) => c.piiRisk === "high"))
        .map((t) => t.fullyQualified),
    )

    // Step 6: embed all tables (batched)
    const embeddingTexts = tables.map(buildEmbeddingText)
    const embeddings = await embedTexts(embeddingTexts)
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i]
      const vec = embeddings[i]
      if (table && vec) {
        table.embedding = vec
        table.embeddingText = embeddingTexts[i] ?? ""
      }
    }

    // Step 7: freeze into SchemaStore
    const store: SchemaStore = Object.freeze({
      tables: new Map(tables.map((t) => [t.fullyQualified, t])),
      fkGraph,
      piiTables,
      dbName: raw.dbName,
      dialect,
      version: raw.version,
      builtAt: Date.now(),
    })

    logger.info("Schema pipeline complete", {
      tables: store.tables.size,
      piiTables: store.piiTables.size,
    })

    return store
  } catch (err) {
    if (err instanceof McpError) throw err
    throw new McpError(
      "SCHEMA_BUILD_FAILED",
      `Schema pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

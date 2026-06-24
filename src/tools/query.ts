import { z } from "zod"
import { resolveSessionForTool, getReadySessionId } from "../session/ensure.js"
import { executeSqlPipeline } from "./execute-sql.pipeline.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError, toolOkStructured, isSessionOrError } from "./core/response.js"
import { ACCESS_TOKEN_SCHEMA } from "./core/access-token.js"
import type { McpToolResult } from "./core/types.js"

export const QueryInputSchema = z.object({
  access_token: z.string().optional(),
  database_url: z.string().optional(),
  action: z.enum(["sql", "schema", "stats"]).default("sql"),
  // sql action
  sql: z.string().optional(),
  // schema action
  filter: z.string().optional(),
  // stats action
  topic: z
    .enum(["cache_stats", "query_history", "session_stats", "pii_report", "schema_summary"])
    .optional(),
})

export type QueryInput = z.infer<typeof QueryInputSchema>

async function handleQuery(args: QueryInput): Promise<McpToolResult> {
  const resolved = await resolveSessionForTool(args.access_token, args.database_url)
  if (isSessionOrError(resolved)) return resolved
  const session = resolved

  // ── sql ─────────────────────────────────────────────────────────────────────
  if (args.action === "sql") {
    if (!args.sql) return toolError("'sql' is required for action='sql'")
    try {
      const result = await executeSqlPipeline(args.sql, getReadySessionId(session), session)
      const header = result.cached
        ? `✓ Cached (${result.durationMs}ms)`
        : `✓ ${result.durationMs}ms · ${result.rowCount} row${result.rowCount !== 1 ? "s" : ""}${result.truncated ? " (truncated)" : ""}`
      return toolOk(`${header}\n\n${JSON.stringify(result.rows, null, 2)}`)
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err))
    }
  }

  // ── schema ───────────────────────────────────────────────────────────────────
  if (args.action === "schema") {
    const schema = session.schema
    const tables = Array.from(schema.tables.values()).filter(
      (t) => !args.filter || t.fullyQualified.includes(args.filter),
    )

    if (tables.length === 0) {
      return toolOk("No tables found" + (args.filter ? ` matching "${args.filter}"` : "") + ".")
    }

    const lines: string[] = [
      `Database: ${schema.dbName} (${schema.dialect})`,
      `Schema loaded: ${new Date(schema.builtAt).toISOString()}`,
      `Tables: ${schema.tables.size}${args.filter ? ` (showing ${tables.length} matching "${args.filter}")` : ""}`,
      `PII-flagged: ${schema.piiTables.size}`,
      "",
    ]

    for (const table of tables) {
      const isPii = schema.piiTables.has(table.fullyQualified)
      lines.push(`TABLE: ${table.fullyQualified}${isPii ? " ⚠️ [PII]" : ""}`)
      lines.push(`  Rows (est): ${table.rowEstimate.toLocaleString()}`)
      lines.push(`  Columns:`)

      for (const col of table.columns) {
        const flags = [
          col.isPrimaryKey ? "PK" : null,
          col.isForeignKey && col.references
            ? `FK→${col.references.table}.${col.references.column}`
            : null,
          col.nullable ? "nullable" : null,
          col.piiRisk === "high" ? "⚠️ PII" : null,
        ]
          .filter(Boolean)
          .join(" | ")
        const sample =
          col.sampleValues.length > 0 && col.piiRisk !== "high"
            ? ` (e.g. ${col.sampleValues.join(", ")})`
            : ""
        lines.push(`    ${col.name}: ${col.dataType}${flags ? `  [${flags}]` : ""}${sample}`)
      }

      const related = schema.fkGraph.get(table.fullyQualified) ?? []
      if (related.length > 0) lines.push(`  Related: ${related.join(", ")}`)
      if (table.indexes.length > 0) {
        lines.push(
          `  Indexes: ${table.indexes.map((i) => `${i.name}(${i.columns.join(",")})`).join(", ")}`,
        )
      }
      lines.push("")
    }

    const aliases = session.aliases
    if (aliases.byFrom.size > 0) {
      lines.push(`Aliases: ${aliases.byFrom.size}`)
      for (const [from, alias] of aliases.byFrom) {
        lines.push(`  "${from}" → "${alias.to}" [${alias.kind}, ${alias.source}]`)
      }
    }

    return toolOk(lines.join("\n"))
  }

  // ── stats ────────────────────────────────────────────────────────────────────
  const topic = args.topic ?? "session_stats"

  if (topic === "cache_stats") {
    const qs = session.cache.query.stats()
    const es = session.cache.embed.stats()
    return toolOk(
      [
        "=== CACHE STATS ===",
        "",
        "Query cache:",
        `  Items: ${qs.items}  Bytes: ${(qs.bytes / 1024).toFixed(1)} KB`,
        `  Hit rate: ${(qs.hitRate * 100).toFixed(1)}%  Evictions: ${qs.evictions}`,
        "",
        "Embed cache:",
        `  Items: ${es.items}  MB: ${(es.bytes / 1024 / 1024).toFixed(1)}  Hit rate: ${(es.hitRate * 100).toFixed(1)}%`,
      ].join("\n"),
    )
  }

  if (topic === "query_history") {
    const history = session.history.last(20)
    if (history.length === 0) return toolOk("No queries run yet.")
    const lines = ["=== QUERY HISTORY (last 20) ===", ""]
    for (const h of history) {
      lines.push(
        `[${new Date(h.ts).toISOString()}] ${h.status.toUpperCase()} ${h.durationMs}ms ${h.rowCount} rows`,
      )
      lines.push(`  SQL: ${h.sql.slice(0, 120)}${h.sql.length > 120 ? "..." : ""}`)
      lines.push("")
    }
    return toolOk(lines.join("\n"))
  }

  if (topic === "pii_report") {
    const schema = session.schema
    if (schema.piiTables.size === 0) return toolOk("No PII-flagged tables detected.")
    const lines = [`=== PII REPORT ===`, `${schema.piiTables.size} tables with high-risk columns:`, ""]
    for (const fqn of schema.piiTables) {
      const table = schema.tables.get(fqn)
      if (!table) continue
      lines.push(`Table: ${fqn}`)
      for (const col of table.columns.filter((c) => c.piiRisk === "high")) {
        lines.push(`  ⚠️  ${col.name} (${col.dataType})`)
      }
      lines.push("")
    }
    lines.push("These columns are automatically masked in query results.")
    return toolOk(lines.join("\n"))
  }

  if (topic === "schema_summary") {
    const schema = session.schema
    const tables = Array.from(schema.tables.values())
    return toolOk(
      [
        "=== SCHEMA SUMMARY ===",
        `Database: ${schema.dbName}  Dialect: ${schema.dialect} ${schema.version.split(" ")[0]}`,
        `Tables: ${tables.length}  Columns: ${tables.reduce((s, t) => s + t.columns.length, 0)}`,
        `Rows (est): ${tables.reduce((s, t) => s + t.rowEstimate, 0).toLocaleString()}`,
        `PII tables: ${schema.piiTables.size}  Aliases: ${session.aliases.byFrom.size}`,
        `Built at: ${new Date(schema.builtAt).toISOString()}`,
      ].join("\n"),
    )
  }

  // session_stats (default)
  const s = session.stats
  return toolOkStructured(
    [
      "=== SESSION STATS ===",
      `Status: ${session.status}  Created: ${new Date(session.createdAt).toISOString()}`,
      `Queries: ${s.totalQueries}  Cache hits: ${s.cacheHits}  Rows: ${s.totalRows}`,
      `Avg duration: ${s.avgDurationMs.toFixed(1)}ms  Errors: ${s.errorCount}`,
    ].join("\n"),
    {
      session_id: session.id,
      status: session.status,
      queries: s.totalQueries,
      cache_hits: s.cacheHits,
      total_rows: s.totalRows,
      avg_ms: s.avgDurationMs,
      errors: s.errorCount,
    },
  )
}

export { handleQuery }

export const queryTool = defineTool({
  name: "query",
  description: `Run SQL queries, read schema, or get session stats.

action="sql"    → execute a SELECT query. Requires: sql
action="schema" → list all tables/columns/types/FK links. Optional: filter (substring)
action="stats"  → session/cache/PII/history info. Optional: topic (default: session_stats)

Pass access_token from connect on every call (hosted Vercel).`,
  inputSchema: {
    type: "object",
    properties: {
      access_token: ACCESS_TOKEN_SCHEMA,
      database_url: { type: "string", description: "Postgres URL (local/direct mode only)" },
      action: {
        type: "string",
        enum: ["sql", "schema", "stats"],
        description: "What to do: run sql, read schema, or get stats",
      },
      sql: { type: "string", description: "SELECT query — required when action=sql" },
      filter: { type: "string", description: "Table name filter — for action=schema" },
      topic: {
        type: "string",
        enum: ["cache_stats", "query_history", "session_stats", "pii_report", "schema_summary"],
        description: "Stats topic — for action=stats (default: session_stats)",
      },
    },
    required: ["action"],
  },
  meta: {
    "x-openai-isConsequential": false,
    "openai/toolInvocation/invoking": "Running query…",
    "openai/toolInvocation/invoked": "Query complete.",
  },
  handler: handleQuery,
})

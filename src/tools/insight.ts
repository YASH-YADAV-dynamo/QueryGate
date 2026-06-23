import { z } from "zod"
import { resolveSessionForTool } from "../session/ensure.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError, isSessionOrError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

export const InsightInputSchema = z.object({
  session_id: z.string().optional(),
  topic: z
    .enum(["cache_stats", "query_history", "session_stats", "pii_report", "schema_summary"])
    .describe("What kind of insight to return"),
  database_url: z.string().optional(),
})

export type InsightInput = z.infer<typeof InsightInputSchema>

const inputSchema = {
  type: "object" as const,
  properties: {
    session_id: { type: "string" },
    topic: {
      type: "string",
      enum: ["cache_stats", "query_history", "session_stats", "pii_report", "schema_summary"],
    },
    database_url: { type: "string" },
  },
  required: ["topic"],
}

export async function handleInsight(args: InsightInput): Promise<McpToolResult> {
  const resolved = await resolveSessionForTool(args.session_id, args.database_url)
  if (isSessionOrError(resolved)) return resolved
  const session = resolved

  switch (args.topic) {
    case "cache_stats": {
      const qs = session.cache.query.stats()
      const es = session.cache.embed.stats()
      return toolOk(
        [
          "=== CACHE STATS ===",
          "",
          "Query cache:",
          `  Items:    ${qs.items}`,
          `  Bytes:    ${(qs.bytes / 1024).toFixed(1)} KB`,
          `  Hits:     ${qs.hits}`,
          `  Misses:   ${qs.misses}`,
          `  Hit rate: ${(qs.hitRate * 100).toFixed(1)}%`,
          `  Evictions:${qs.evictions}`,
          "",
          "Embed cache:",
          `  Items:    ${es.items}`,
          `  Bytes:    ${(es.bytes / 1024 / 1024).toFixed(1)} MB`,
          `  Hit rate: ${(es.hitRate * 100).toFixed(1)}%`,
        ].join("\n"),
      )
    }

    case "query_history": {
      const history = session.history.last(20)
      if (history.length === 0) return toolOk("No queries run yet.")
      const lines = ["=== QUERY HISTORY (last 20, newest first) ===", ""]
      for (const h of history) {
        lines.push(`[${new Date(h.ts).toISOString()}] ${h.status.toUpperCase()} ${h.durationMs}ms ${h.rowCount} rows`)
        lines.push(`  Q: ${h.question}`)
        lines.push(`  SQL: ${h.sql.slice(0, 120)}${h.sql.length > 120 ? "..." : ""}`)
        lines.push("")
      }
      return toolOk(lines.join("\n"))
    }

    case "session_stats": {
      const s = session.stats
      return toolOk(
        [
          "=== SESSION STATS ===",
          `Session ID:      ${session.id}`,
          `Status:          ${session.status}`,
          `Created:         ${new Date(session.createdAt).toISOString()}`,
          `Last used:       ${new Date(session.lastUsedAt).toISOString()}`,
          `Expires:         ${new Date(session.expiresAt).toISOString()}`,
          "",
          `Total queries:   ${s.totalQueries}`,
          `Cache hits:      ${s.cacheHits} (${s.totalQueries > 0 ? ((s.cacheHits / s.totalQueries) * 100).toFixed(1) : 0}%)`,
          `Total rows:      ${s.totalRows}`,
          `Avg duration:    ${s.avgDurationMs.toFixed(1)}ms`,
          `Errors:          ${s.errorCount}`,
        ].join("\n"),
      )
    }

    case "pii_report": {
      const schema = session.schema
      if (schema.piiTables.size === 0) return toolOk("No PII-flagged tables detected.")
      const lines = [
        `=== PII REPORT ===`,
        `${schema.piiTables.size} tables contain high-risk columns:`,
        "",
      ]
      for (const fqn of schema.piiTables) {
        const table = schema.tables.get(fqn)
        if (!table) continue
        lines.push(`Table: ${fqn}`)
        const piiCols = table.columns.filter((c) => c.piiRisk === "high")
        for (const col of piiCols) {
          lines.push(`  ⚠️  ${col.name} (${col.dataType})`)
        }
        lines.push("")
      }
      lines.push("These columns are automatically masked in query results.")
      return toolOk(lines.join("\n"))
    }

    case "schema_summary": {
      const schema = session.schema
      const tables = Array.from(schema.tables.values())
      const totalRows = tables.reduce((s, t) => s + t.rowEstimate, 0)
      const totalCols = tables.reduce((s, t) => s + t.columns.length, 0)
      return toolOk(
        [
          "=== SCHEMA SUMMARY ===",
          `Database:   ${schema.dbName}`,
          `Dialect:    ${schema.dialect} ${schema.version.split(" ")[0]}`,
          `Tables:     ${tables.length}`,
          `Columns:    ${totalCols} total`,
          `Rows (est): ${totalRows.toLocaleString()} total`,
          `PII tables: ${schema.piiTables.size}`,
          `FK links:   ${Array.from(schema.fkGraph.values()).reduce((s, v) => s + v.length, 0) / 2} relationships`,
          `Aliases:    ${session.aliases.byFrom.size} active`,
          `Built at:   ${new Date(schema.builtAt).toISOString()}`,
        ].join("\n"),
      )
    }
  }
}

export const insightTool = defineTool({
  name: "insight",
  description:
    "Get insights from the current session — cache performance, query history, PII report, session stats. Reads from RAM only.",
  inputSchema,
  handler: handleInsight,
})

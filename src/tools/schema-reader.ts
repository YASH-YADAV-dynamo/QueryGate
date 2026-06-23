import { z } from "zod"
import { getSession } from "../session/manager.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

export const SchemaReaderInputSchema = z.object({
  session_id: z.string(),
  filter: z.string().optional().describe("Optional substring to filter table names"),
})

export type SchemaReaderInput = z.infer<typeof SchemaReaderInputSchema>

const inputSchema = {
  type: "object" as const,
  properties: {
    session_id: { type: "string" },
    filter: { type: "string", description: "Substring filter for table names" },
  },
  required: ["session_id"],
}

export async function handleSchemaReader(args: SchemaReaderInput): Promise<McpToolResult> {
  const session = getSession(args.session_id)
  if (!session) return toolError("Session not found. Call 'connect' first.")

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
    `Total tables: ${schema.tables.size}${args.filter ? ` (showing ${tables.length} matching "${args.filter}")` : ""}`,
    `PII-flagged tables: ${schema.piiTables.size}`,
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
        col.isForeignKey && col.references ? `FK→${col.references.table}.${col.references.column}` : null,
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
    if (related.length > 0) {
      lines.push(`  Related tables: ${related.join(", ")}`)
    }

    if (table.indexes.length > 0) {
      lines.push(`  Indexes: ${table.indexes.map((i) => `${i.name}(${i.columns.join(",")})`).join(", ")}`)
    }
    lines.push("")
  }

  const aliases = session.aliases
  if (aliases.byFrom.size > 0) {
    lines.push(`Active aliases: ${aliases.byFrom.size}`)
    for (const [from, alias] of aliases.byFrom) {
      lines.push(`  "${from}" → "${alias.to}" [${alias.kind}, ${alias.source}]`)
    }
  }

  return toolOk(lines.join("\n"))
}

export const schemaReaderTool = defineTool({
  name: "schema_reader",
  description:
    "Read the database schema from RAM — no DB call. Returns table names, columns, types, PK/FK relationships, PII flags, and row estimates.",
  inputSchema,
  handler: handleSchemaReader,
})

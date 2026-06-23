import { z } from "zod"
import { resolveSessionForTool } from "../session/ensure.js"
import { ACCESS_TOKEN_SCHEMA } from "./core/access-token.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError, isSessionOrError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

export const SchemaReaderInputSchema = z.object({
  session_id: z.string().optional(),
  access_token: z.string().optional(),
  filter: z.string().optional().describe("Optional substring to filter table names"),
  database_url: z.string().optional(),
})

export type SchemaReaderInput = z.infer<typeof SchemaReaderInputSchema>

const inputSchema = {
  type: "object" as const,
  properties: {
    session_id: { type: "string" },
    access_token: ACCESS_TOKEN_SCHEMA,
    filter: { type: "string", description: "Substring filter for table names" },
    database_url: { type: "string" },
  },
  required: [],
}

export async function handleSchemaReader(args: SchemaReaderInput): Promise<McpToolResult> {
  const resolved = await resolveSessionForTool(
    args.session_id,
    args.database_url,
    args.access_token,
  )
  if (isSessionOrError(resolved)) return resolved
  const session = resolved

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

import { z } from "zod"
import { resolveSessionForTool } from "../session/ensure.js"
import { addAlias, removeAlias } from "../session/alias-store.js"
import type { AliasKind } from "../db/types.js"
import { defineTool } from "./core/define-tool.js"
import { ACCESS_TOKEN_SCHEMA } from "./core/access-token.js"
import { toolOk, toolError, isSessionOrError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

export const SetAliasInputSchema = z.object({
  session_id: z.string().optional(),
  access_token: z.string().optional(),
  action: z.enum(["add", "remove", "list"]),
  from: z.string().optional().describe("The term user will say (e.g. 'orders')"),
  to: z.string().optional().describe("The canonical DB name (e.g. 'order_line_items')"),
  kind: z
    .enum(["table", "column", "schema", "expression"])
    .optional()
    .default("table"),
})

export type SetAliasInput = z.infer<typeof SetAliasInputSchema>

const inputSchema = {
  type: "object" as const,
  properties: {
    session_id: { type: "string" },
    access_token: ACCESS_TOKEN_SCHEMA,
    action: { type: "string", enum: ["add", "remove", "list"] },
    from: { type: "string", description: "Term the user says (e.g. 'orders')" },
    to: { type: "string", description: "Real DB table/column name" },
    kind: { type: "string", enum: ["table", "column", "schema", "expression"] },
  },
  required: ["action"],
}

export async function handleSetAlias(args: SetAliasInput): Promise<McpToolResult> {
  const resolved = await resolveSessionForTool(args.session_id, undefined, args.access_token)
  if (isSessionOrError(resolved)) return resolved
  const session = resolved

  const store = session.aliases

  if (args.action === "list") {
    if (store.byFrom.size === 0) return toolOk("No aliases set.")
    const lines = ["Active aliases:"]
    for (const [from, alias] of store.byFrom) {
      lines.push(
        `  "${from}" → "${alias.to}" [${alias.kind}, ${alias.source}, confidence: ${alias.confidence.toFixed(2)}]`,
      )
    }
    return toolOk(lines.join("\n"))
  }

  if (args.action === "remove") {
    if (!args.from) return toolError("'from' is required for remove")
    const removed = removeAlias(store, args.from)
    if (!removed) return toolOk(`Alias "${args.from}" not found.`)

    const invalidated = session.cache.query.invalidatePrefix("")
    return toolOk(`Removed alias "${args.from}". Invalidated ${invalidated} cached queries.`)
  }

  if (!args.from || !args.to) return toolError("'from' and 'to' are required for add")

  const result = addAlias(store, {
    from: args.from,
    to: args.to,
    kind: (args.kind ?? "table") as AliasKind,
    source: "user",
    confidence: 1.0,
    scope: "session",
    createdAt: Date.now(),
  })

  if (!result.ok) {
    if (result.conflict) {
      return toolError(
        `Alias "${args.from}" already exists → "${result.conflict.to}" (user-defined). Remove it first.`,
      )
    }
    return toolError("Alias limit reached.")
  }

  const invalidated = session.cache.query.invalidatePrefix("")
  return toolOk(
    `Alias added: "${args.from}" → "${args.to}" [${args.kind}]\n` +
      `Invalidated ${invalidated} cached queries.`,
  )
}

export const setAliasTool = defineTool({
  name: "set_alias",
  description:
    "Add, remove, or list aliases that map user-friendly terms to real DB names. Adding an alias invalidates the query cache to prevent stale SQL.",
  inputSchema,
  handler: handleSetAlias,
})

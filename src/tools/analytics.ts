import { z } from "zod"
import { resolveSessionForTool } from "../session/ensure.js"
import { buildCustomerAnalyticsDashboard } from "../analytics/customer-metrics.js"
import { CUSTOMER_ANALYTICS_WIDGET_URI } from "../widgets/customer-analytics-widget.js"
import { addAlias, removeAlias } from "../session/alias-store.js"
import { ACCESS_TOKEN_SCHEMA } from "./core/access-token.js"
import { defineTool } from "./core/define-tool.js"
import { toolOk, toolError, toolOkStructured, isSessionOrError } from "./core/response.js"
import type { AliasKind } from "../db/types.js"
import type { McpToolResult } from "./core/types.js"

export const AnalyticsInputSchema = z.object({
  access_token: z.string().optional(),
  database_url: z.string().optional(),
  action: z
    .enum(["dashboard", "alias_add", "alias_remove", "alias_list"])
    .default("dashboard"),
  from: z.string().optional().describe("Alias source term (e.g. 'orders')"),
  to: z.string().optional().describe("Real DB name (e.g. 'order_line_items')"),
  kind: z
    .enum(["table", "column", "schema", "expression"])
    .optional()
    .default("table"),
})

export type AnalyticsInput = z.infer<typeof AnalyticsInputSchema>

async function handleAnalytics(args: AnalyticsInput): Promise<McpToolResult> {
  const resolved = await resolveSessionForTool(args.access_token, args.database_url)
  if (isSessionOrError(resolved)) return resolved
  const session = resolved

  // ── dashboard ────────────────────────────────────────────────────────────────
  if (args.action === "dashboard") {
    const dashboard = await buildCustomerAnalyticsDashboard(session)
    return toolOkStructured(
      dashboard.textSummary,
      dashboard as unknown as Record<string, unknown>,
      {
        ui: { resourceUri: CUSTOMER_ANALYTICS_WIDGET_URI },
        "openai/outputTemplate": CUSTOMER_ANALYTICS_WIDGET_URI,
      },
    )
  }

  // ── alias_list ────────────────────────────────────────────────────────────────
  if (args.action === "alias_list") {
    const store = session.aliases
    if (store.byFrom.size === 0) return toolOk("No aliases set.")
    const lines = ["Active aliases:"]
    for (const [from, alias] of store.byFrom) {
      lines.push(
        `  "${from}" → "${alias.to}" [${alias.kind}, ${alias.source}, confidence: ${alias.confidence.toFixed(2)}]`,
      )
    }
    return toolOk(lines.join("\n"))
  }

  // ── alias_remove ──────────────────────────────────────────────────────────────
  if (args.action === "alias_remove") {
    if (!args.from) return toolError("'from' is required for alias_remove")
    const removed = removeAlias(session.aliases, args.from)
    if (!removed) return toolOk(`Alias "${args.from}" not found.`)
    const invalidated = session.cache.query.invalidatePrefix("")
    return toolOk(`Removed alias "${args.from}". Invalidated ${invalidated} cached queries.`)
  }

  // ── alias_add ─────────────────────────────────────────────────────────────────
  if (!args.from || !args.to) return toolError("'from' and 'to' are required for alias_add")

  const result = addAlias(session.aliases, {
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
        `Alias "${args.from}" already exists → "${result.conflict.to}". Use alias_remove first.`,
      )
    }
    return toolError("Alias limit reached.")
  }

  const invalidated = session.cache.query.invalidatePrefix("")
  return toolOk(
    `Alias added: "${args.from}" → "${args.to}" [${args.kind}]\nInvalidated ${invalidated} cached queries.`,
  )
}

export { handleAnalytics }

export const analyticsTool = defineTool({
  name: "analytics",
  description: `Customer analytics dashboard and alias management.

action="dashboard"    → dark-card KPI dashboard (total customers, growth, segments, recent)
action="alias_add"    → map a friendly name to a real table/column. Requires: from, to
action="alias_remove" → remove an alias. Requires: from
action="alias_list"   → show all active aliases

Pass access_token from connect on every call (hosted Vercel).`,
  inputSchema: {
    type: "object",
    properties: {
      access_token: ACCESS_TOKEN_SCHEMA,
      database_url: { type: "string", description: "Postgres URL (local/direct mode only)" },
      action: {
        type: "string",
        enum: ["dashboard", "alias_add", "alias_remove", "alias_list"],
        description: "What to do (default: dashboard)",
      },
      from: { type: "string", description: "Alias source term — for alias_add/remove" },
      to: { type: "string", description: "Real DB name — for alias_add" },
      kind: {
        type: "string",
        enum: ["table", "column", "schema", "expression"],
        description: "Alias kind (default: table) — for alias_add",
      },
    },
    required: ["action"],
  },
  meta: {
    "x-openai-isConsequential": false,
    ui: { resourceUri: CUSTOMER_ANALYTICS_WIDGET_URI },
    "openai/outputTemplate": CUSTOMER_ANALYTICS_WIDGET_URI,
    "openai/toolInvocation/invoking": "Building analytics…",
    "openai/toolInvocation/invoked": "Analytics ready.",
  },
  handler: handleAnalytics,
})

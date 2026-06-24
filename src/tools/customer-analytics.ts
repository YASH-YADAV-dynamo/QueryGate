import { z } from "zod"
import { resolveSessionForTool } from "../session/ensure.js"
import { buildCustomerAnalyticsDashboard } from "../analytics/customer-metrics.js"
import { CUSTOMER_ANALYTICS_WIDGET_URI } from "../widgets/customer-analytics-widget.js"
import { ACCESS_TOKEN_SCHEMA } from "./core/access-token.js"
import { defineTool } from "./core/define-tool.js"
import { toolError, toolOkStructured, isSessionOrError } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

export const CustomerAnalyticsInputSchema = z.object({
  session_id: z.string().optional().describe("Session ID from connect"),
  access_token: z.string().optional(),
  database_url: z.string().optional(),
})

export type CustomerAnalyticsInput = z.infer<typeof CustomerAnalyticsInputSchema>

const inputSchema = {
  type: "object" as const,
  properties: {
    session_id: { type: "string", description: "Session ID from connect" },
    access_token: ACCESS_TOKEN_SCHEMA,
    database_url: { type: "string" },
  },
  required: [],
}

export async function handleCustomerAnalytics(
  args: CustomerAnalyticsInput,
): Promise<McpToolResult> {
  const resolved = await resolveSessionForTool(
    args.session_id,
    args.database_url,
    args.access_token,
  )
  if (isSessionOrError(resolved)) return resolved
  const session = resolved

  const dashboard = await buildCustomerAnalyticsDashboard(session)

  return toolOkStructured(dashboard.textSummary, dashboard as unknown as Record<string, unknown>, {
    ui: { resourceUri: CUSTOMER_ANALYTICS_WIDGET_URI },
    "openai/outputTemplate": CUSTOMER_ANALYTICS_WIDGET_URI,
  })
}

export const customerAnalyticsTool = defineTool({
  name: "customer_analytics",
  description: `Customer-focused analytics dashboard (dark card UI in ChatGPT).

REQUIRED on hosted Vercel: pass access_token from connect (NOT session_id).
Scans customer/subscription tables and returns KPI cards, segments, trends, recent customers.`,
  inputSchema,
  meta: {
    "x-openai-isConsequential": false,
    ui: { resourceUri: CUSTOMER_ANALYTICS_WIDGET_URI },
    "openai/outputTemplate": CUSTOMER_ANALYTICS_WIDGET_URI,
    "openai/toolInvocation/invoking": "Building customer dashboard…",
    "openai/toolInvocation/invoked": "Customer dashboard ready.",
  },
  handler: handleCustomerAnalytics,
})

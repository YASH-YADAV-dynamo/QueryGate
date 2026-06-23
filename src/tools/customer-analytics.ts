import { z } from "zod"
import { getSession } from "../session/manager.js"
import { buildCustomerAnalyticsDashboard } from "../analytics/customer-metrics.js"
import { CUSTOMER_ANALYTICS_WIDGET_URI } from "../widgets/customer-analytics-widget.js"
import { defineTool } from "./core/define-tool.js"
import { toolError, toolOkStructured } from "./core/response.js"
import type { McpToolResult } from "./core/types.js"

export const CustomerAnalyticsInputSchema = z.object({
  session_id: z.string().describe("Session ID from connect"),
})

export type CustomerAnalyticsInput = z.infer<typeof CustomerAnalyticsInputSchema>

const inputSchema = {
  type: "object" as const,
  properties: {
    session_id: { type: "string", description: "Session ID from connect" },
  },
  required: ["session_id"],
}

export async function handleCustomerAnalytics(
  args: CustomerAnalyticsInput,
): Promise<McpToolResult> {
  const session = getSession(args.session_id)
  if (!session) return toolError("Session not found. Call connect first.")
  if (session.status !== "ready") {
    return toolError(`Session not ready (${session.status}). Wait for connect to finish.`)
  }

  const dashboard = await buildCustomerAnalyticsDashboard(session)

  return toolOkStructured(dashboard.textSummary, dashboard as unknown as Record<string, unknown>, {
    ui: { resourceUri: CUSTOMER_ANALYTICS_WIDGET_URI },
    "openai/outputTemplate": CUSTOMER_ANALYTICS_WIDGET_URI,
  })
}

export const customerAnalyticsTool = defineTool({
  name: "customer_analytics",
  description: `Customer-focused analytics dashboard (Tableau-style UI in ChatGPT).

Call connect first. Scans for customer/user/client tables and returns:
- KPI cards (total customers, new signups, active cohort)
- Segment breakdown
- Monthly signup trend (6 months)
- Recent customers table

Renders an interactive dashboard in ChatGPT. If the widget fails to load, the text summary in chat is the fallback.`,
  inputSchema,
  meta: {
    ui: { resourceUri: CUSTOMER_ANALYTICS_WIDGET_URI },
    "openai/outputTemplate": CUSTOMER_ANALYTICS_WIDGET_URI,
    "openai/toolInvocation/invoking": "Building customer dashboard…",
    "openai/toolInvocation/invoked": "Customer dashboard ready.",
  },
  handler: handleCustomerAnalytics,
})

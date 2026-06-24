import type { McpToolDefinition } from "./core/types.js"
import { connectTool } from "./connect.js"
import { queryTool } from "./query.js"
import { analyticsTool } from "./analytics.js"

/** All MCP tools registered with the server. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: McpToolDefinition<any>[] = [
  connectTool,
  queryTool,
  analyticsTool,
]

export function getToolByName(name: string): McpToolDefinition<any> | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}

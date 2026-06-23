import type { McpToolDefinition, McpToolInputSchema, McpToolResult } from "./types.js"

/** Assembles a typed MCP tool definition from metadata + handler. */
export function defineTool<TArgs>(config: {
  name: string
  description: string
  inputSchema: McpToolInputSchema
  handler: (args: TArgs) => Promise<McpToolResult>
}): McpToolDefinition<TArgs> {
  return config
}

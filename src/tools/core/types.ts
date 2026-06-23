export interface McpToolResult {
  content: { type: string; text: string }[]
  isError?: boolean
}

export interface McpToolInputSchema {
  type: "object"
  properties: Record<string, unknown>
  required: string[]
}

export interface McpToolDefinition<TArgs = unknown> {
  name: string
  description: string
  inputSchema: McpToolInputSchema
  handler: (args: TArgs) => Promise<McpToolResult>
}

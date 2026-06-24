export interface McpToolResult {
  content: { type: string; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  _meta?: Record<string, unknown>
}

export interface McpToolMeta {
  ui?: { resourceUri?: string; visibility?: string[] }
  "openai/outputTemplate"?: string
  "openai/toolInvocation/invoking"?: string
  "openai/toolInvocation/invoked"?: string
  /** Tell ChatGPT this is a read-only tool — no confirmation prompt per call. */
  "x-openai-isConsequential"?: boolean
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
  meta?: McpToolMeta
  handler: (args: TArgs) => Promise<McpToolResult>
}

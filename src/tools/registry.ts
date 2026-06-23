import type { McpToolDefinition } from "./core/types.js"
import { connectTool } from "./connect.js"
import { executeSqlTool } from "./execute-sql.js"
import { schemaReaderTool } from "./schema-reader.js"
import { setAliasTool } from "./set-alias.js"
import { insightTool } from "./insight.js"

/** All MCP tools registered with the server, in call order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: McpToolDefinition<any>[] = [
  connectTool,
  executeSqlTool,
  schemaReaderTool,
  setAliasTool,
  insightTool,
]

export function getToolByName(name: string): McpToolDefinition<any> | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}

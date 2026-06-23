import type { McpToolResult } from "./types.js"

export function toolOk(text: string): McpToolResult {
  return { content: [{ type: "text", text }] }
}

export function toolError(text: string): McpToolResult {
  return { content: [{ type: "text", text: `ERROR: ${text}` }] }
}

export function getToolText(result: McpToolResult): string {
  return result.content[0]?.text ?? ""
}

export function isToolError(result: McpToolResult): boolean {
  return getToolText(result).startsWith("ERROR:")
}

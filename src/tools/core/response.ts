import type { McpToolResult } from "./types.js"

export function toolOk(text: string): McpToolResult {
  return { content: [{ type: "text", text }] }
}

export function toolOkStructured(
  text: string,
  structuredContent: Record<string, unknown>,
  meta?: Record<string, unknown>,
): McpToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    ...(meta ? { _meta: meta } : {}),
  }
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

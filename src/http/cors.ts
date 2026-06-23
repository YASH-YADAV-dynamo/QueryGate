import type { IncomingMessage, ServerResponse } from "node:http"

const ALLOWED_ORIGINS = new Set([
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://cdn.oaistatic.com",
])

export function applyCors(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined> },
  res: ServerResponse,
): void {
  const origin = req.headers.origin
  if (typeof origin === "string" && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Content-Type",
      "Accept",
      "MCP-Session-Id",
      "mcp-session-id",
      "DATABASE_URL",
      "X-Database-Url",
      "X-QueryGate-Token",
      "Authorization",
    ].join(", "),
  )
  res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id")
}

export function handlePreflight(res: ServerResponse): void {
  res.statusCode = 204
  res.end()
}

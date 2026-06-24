import type { IncomingMessage, ServerResponse } from "node:http"

/** Read-only server: open CORS so any ChatGPT/Claude/Cursor origin can connect. */
export function applyCors(
  req: IncomingMessage & { headers: Record<string, string | string[] | undefined> },
  res: ServerResponse,
): void {
  const origin = req.headers.origin

  // Echo back the request origin when present (required for credentialed requests).
  // Fall back to wildcard for server-to-server probes (no Origin header).
  if (typeof origin === "string" && origin.length > 0) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*")
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

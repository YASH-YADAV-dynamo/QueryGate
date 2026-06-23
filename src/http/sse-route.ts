import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { createMcpServer } from "../server.js"
import { runWithDatabaseUrlAsync } from "../context.js"
import { applyCors, handlePreflight } from "./cors.js"
import {
  type HttpReq,
  type HttpRes,
  resolveDatabaseUrl,
  sendMissingDatabaseUrl,
} from "./database-url.js"

const sseTransports = new Map<string, SSEServerTransport>()
const sessionDatabaseUrls = new Map<string, string>()

function getQuerySessionId(req: HttpReq): string | undefined {
  const raw = req.query?.sessionId
  if (typeof raw === "string") return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}

/** Legacy SSE transport — GET /sse (ChatGPT custom app). */
export async function handleSseRoute(req: HttpReq, res: HttpRes): Promise<void> {
  applyCors(req, res)

  if (req.method === "OPTIONS") {
    handlePreflight(res)
    return
  }

  if (req.method !== "GET") {
    res.statusCode = 405
    res.end("Method Not Allowed")
    return
  }

  const databaseUrl = resolveDatabaseUrl(req, sessionDatabaseUrls)
  if (!databaseUrl) {
    sendMissingDatabaseUrl(res)
    return
  }

  await runWithDatabaseUrlAsync(databaseUrl, async () => {
    const transport = new SSEServerTransport("/messages", res)
    sseTransports.set(transport.sessionId, transport)
    sessionDatabaseUrls.set(transport.sessionId, databaseUrl)

    transport.onclose = () => {
      sseTransports.delete(transport.sessionId)
      sessionDatabaseUrls.delete(transport.sessionId)
    }

    const server = createMcpServer()
    await server.connect(
      transport as unknown as import("@modelcontextprotocol/sdk/shared/transport.js").Transport,
    )
  })
}

/** Legacy SSE transport — POST /messages?sessionId=… */
export async function handleMessagesRoute(req: HttpReq, res: HttpRes): Promise<void> {
  applyCors(req, res)

  if (req.method === "OPTIONS") {
    handlePreflight(res)
    return
  }

  if (req.method !== "POST") {
    res.statusCode = 405
    res.end("Method Not Allowed")
    return
  }

  const sessionId = getQuerySessionId(req)
  if (!sessionId) {
    res.statusCode = 400
    res.end("Missing sessionId query parameter")
    return
  }

  const transport = sseTransports.get(sessionId)
  if (!transport) {
    res.statusCode = 404
    res.end("Session not found")
    return
  }

  const databaseUrl = sessionDatabaseUrls.get(sessionId)
  if (!databaseUrl) {
    sendMissingDatabaseUrl(res)
    return
  }

  await runWithDatabaseUrlAsync(databaseUrl, async () => {
    await transport.handlePostMessage(req, res, req.body)
  })
}

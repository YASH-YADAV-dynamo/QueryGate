import type { IncomingMessage, ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { createMcpServer } from "../server.js"
import {
  extractDatabaseUrlFromHeaders,
  runWithDatabaseUrlAsync,
} from "../context.js"
import { applyCors, handlePreflight } from "./cors.js"

type HttpReq = IncomingMessage & { body?: unknown }

type HttpRes = ServerResponse

const transports = new Map<string, StreamableHTTPServerTransport>()
const sessionDatabaseUrls = new Map<string, string>()

function getSessionId(req: HttpReq): string | undefined {
  const raw = req.headers["mcp-session-id"]
  if (typeof raw === "string") return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}

function resolveDatabaseUrl(req: HttpReq, sessionId?: string): string | undefined {
  const fromHeader = extractDatabaseUrlFromHeaders(req.headers)
  if (fromHeader) return fromHeader
  if (sessionId) return sessionDatabaseUrls.get(sessionId)
  return undefined
}

/** MCP Streamable HTTP — GET/POST/DELETE/OPTIONS on /mcp (ChatGPT custom app + remote clients). */
export async function handleMcpRoute(req: HttpReq, res: HttpRes): Promise<void> {
  applyCors(req, res)

  if (req.method === "OPTIONS") {
    handlePreflight(res)
    return
  }

  const sessionId = getSessionId(req)
  const databaseUrl = resolveDatabaseUrl(req, sessionId)

  if (!databaseUrl) {
    res.statusCode = 401
    res.setHeader("Content-Type", "application/json")
    res.end(
      JSON.stringify({
        error: "Missing DATABASE_URL header",
        hint: 'Send "DATABASE_URL" or "X-Database-Url" on initialize, or reuse MCP-Session-Id',
      }),
    )
    return
  }

  await runWithDatabaseUrlAsync(databaseUrl, async () => {
    let transport: StreamableHTTPServerTransport | undefined

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)
    } else if (
      !sessionId &&
      req.method === "POST" &&
      req.body !== undefined &&
      isInitializeRequest(req.body)
    ) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!)
          sessionDatabaseUrls.set(sid, databaseUrl)
        },
      })

      transport.onclose = () => {
        const sid = transport?.sessionId
        if (sid) {
          transports.delete(sid)
          sessionDatabaseUrls.delete(sid)
        }
      }

      const server = createMcpServer()
      await server.connect(
        transport as unknown as import("@modelcontextprotocol/sdk/shared/transport.js").Transport,
      )
    } else {
      res.statusCode = 400
      res.setHeader("Content-Type", "application/json")
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: POST initialize first, or send valid MCP-Session-Id",
          },
          id: null,
        }),
      )
      return
    }

    if (!transport) {
      res.statusCode = 404
      res.setHeader("Content-Type", "application/json")
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        }),
      )
      return
    }

    try {
      const body = req.method === "POST" && req.body !== undefined ? req.body : undefined
      await transport.handleRequest(req, res, body)
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader("Content-Type", "application/json")
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        )
      }
    }
  })
}

export function handleHealth(_req: HttpReq, res: HttpRes): void {
  res.statusCode = 200
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify({ ok: true, service: "querygate", transport: "streamable-http" }))
}

/** @deprecated Use handleMcpRoute */
export async function handleMcpHttpRequest(req: HttpReq, res: HttpRes): Promise<void> {
  return handleMcpRoute(req, res)
}

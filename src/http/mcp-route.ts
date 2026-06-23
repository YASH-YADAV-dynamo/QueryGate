import type { IncomingMessage, ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { createMcpServer } from "../server.js"
import {
  extractAccessTokenFromHeaders,
  extractDatabaseUrlFromHeaders,
  runWithAccessTokenAsync,
  runWithDatabaseUrlAsync,
} from "../context.js"
import {
  isConnectionStoreEnabled,
  resolveDatabaseUrlFromToken,
} from "../store/connection-store.js"
import { applyCors, handlePreflight } from "./cors.js"
import { type HttpReq, type HttpRes, resolveDatabaseUrl } from "./database-url.js"

const transports = new Map<string, StreamableHTTPServerTransport>()
const sessionDatabaseUrls = new Map<string, string>()
const sessionAccessTokens = new Map<string, string>()

function getSessionId(req: HttpReq): string | undefined {
  const raw = req.headers["mcp-session-id"]
  if (typeof raw === "string") return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}

function rememberCredentials(
  req: HttpReq,
  sessionId?: string,
): { databaseUrl?: string; accessToken?: string } {
  const headers = req.headers as Record<string, string | string[] | undefined>
  const accessToken = extractAccessTokenFromHeaders(headers)
  const fromHeader = extractDatabaseUrlFromHeaders(headers)

  if (accessToken && sessionId) {
    sessionAccessTokens.set(sessionId, accessToken)
  }
  if (fromHeader && sessionId) {
    sessionDatabaseUrls.set(sessionId, fromHeader)
  }

  const token =
    accessToken ?? (sessionId ? sessionAccessTokens.get(sessionId) : undefined)
  const databaseUrl =
    fromHeader ?? resolveDatabaseUrl(req, sessionDatabaseUrls, sessionId)

  return { databaseUrl, accessToken: token }
}

async function dispatchMcp(req: HttpReq, res: HttpRes): Promise<void> {
  const sessionId = getSessionId(req)
  let transport: StreamableHTTPServerTransport | undefined

  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId)
  } else if (
    !sessionId &&
    req.method === "POST" &&
    req.body !== undefined &&
    isInitializeRequest(req.body)
  ) {
    const headers = req.headers as Record<string, string | string[] | undefined>
    const headerUrl = extractDatabaseUrlFromHeaders(headers)
    const headerToken = extractAccessTokenFromHeaders(headers)

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport!)
        if (headerUrl) sessionDatabaseUrls.set(sid, headerUrl)
        if (headerToken) sessionAccessTokens.set(sid, headerToken)
      },
    })

    transport.onclose = () => {
      const sid = transport?.sessionId
      if (sid) {
        transports.delete(sid)
        sessionDatabaseUrls.delete(sid)
        sessionAccessTokens.delete(sid)
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
}

async function runWithRequestContext(
  creds: { databaseUrl?: string; accessToken?: string },
  fn: () => Promise<void>,
): Promise<void> {
  if (creds.accessToken && isConnectionStoreEnabled()) {
    try {
      const url = await resolveDatabaseUrlFromToken(creds.accessToken)
      await runWithAccessTokenAsync(creds.accessToken, () =>
        runWithDatabaseUrlAsync(url, fn),
      )
      return
    } catch {
      // Fall through to raw URL if token invalid but URL header present
    }
  }

  if (creds.databaseUrl) {
    await runWithDatabaseUrlAsync(creds.databaseUrl, fn)
    return
  }

  if (creds.accessToken) {
    await runWithAccessTokenAsync(creds.accessToken, fn)
    return
  }

  await fn()
}

/** MCP Streamable HTTP — GET/POST/DELETE/OPTIONS (ChatGPT /sse, Cursor /mcp). */
export async function handleMcpRoute(req: HttpReq, res: HttpRes): Promise<void> {
  applyCors(req, res)

  if (req.method === "OPTIONS") {
    handlePreflight(res)
    return
  }

  const sessionId = getSessionId(req)
  const creds = rememberCredentials(req, sessionId)
  await runWithRequestContext(creds, () => dispatchMcp(req, res))
}

export function handleHealth(_req: HttpReq, res: HttpRes): void {
  res.statusCode = 200
  res.setHeader("Content-Type", "application/json")
  res.end(
    JSON.stringify({
      ok: true,
      service: "querygate",
      connectionStore: isConnectionStoreEnabled(),
      endpoints: { chatgpt: "/sse", streamableHttp: "/mcp" },
    }),
  )
}

/** @deprecated Use handleMcpRoute */
export async function handleMcpHttpRequest(req: HttpReq, res: HttpRes): Promise<void> {
  return handleMcpRoute(req, res)
}

/** @deprecated Legacy SSE — use handleMcpRoute on /sse instead */
export { handleSseRoute, handleMessagesRoute } from "./sse-route.js"

import type { IncomingMessage, ServerResponse } from "node:http"
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import { handleHealth, handleMcpRoute } from "./mcp-route.js"

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void

function route(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): NodeHandler {
  return (req, res) => {
    void Promise.resolve(handler(req, res))
  }
}

export function createHttpApp() {
  const app = createMcpExpressApp({ host: "0.0.0.0" })

  app.get("/health", route(handleHealth))
  // ChatGPT custom app — Streamable HTTP at /sse (OpenAI convention)
  app.all("/sse", route(handleMcpRoute))
  // Cursor / Claude remote — Streamable HTTP at /mcp
  app.all("/mcp", route(handleMcpRoute))

  return app
}

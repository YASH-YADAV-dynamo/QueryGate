import type { IncomingMessage, ServerResponse } from "node:http"
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import { handleHealth, handleMcpRoute } from "./mcp-route.js"
import { handleMessagesRoute, handleSseRoute } from "./sse-route.js"

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
  app.get("/sse", route(handleSseRoute))
  app.post("/messages", route(handleMessagesRoute))
  app.all("/mcp", route(handleMcpRoute))

  return app
}

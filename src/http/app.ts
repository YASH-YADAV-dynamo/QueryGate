import type { IncomingMessage, ServerResponse } from "node:http"
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import { handleHealth, handleMcpRoute } from "./mcp-route.js"

export function createHttpApp() {
  const app = createMcpExpressApp({ host: "0.0.0.0" })

  app.get("/health", (req: IncomingMessage, res: ServerResponse) => handleHealth(req, res))
  app.all("/mcp", (req: IncomingMessage, res: ServerResponse) => {
    void handleMcpRoute(req, res)
  })

  return app
}

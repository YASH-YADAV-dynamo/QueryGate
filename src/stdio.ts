/**
 * stdio MCP entry — local use with Cursor / Claude Desktop.
 * DATABASE_URL is optional at startup (env block or connect tool database_url).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createMcpServer } from "./server.js"
import { printStartup } from "./utils/startup.js"

const server = createMcpServer()
const transport = new StdioServerTransport()
await server.connect(transport)

const dbHint = process.env.DATABASE_URL
  ? "DATABASE_URL loaded from mcp.json env"
  : "DATABASE_URL not set — paste Postgres URL in chat, then call connect"

printStartup([
  `stdio MCP ready (pid ${process.pid})`,
  "transport: stdin/stdout — no port (your MCP client spawns this process)",
  dbHint,
])

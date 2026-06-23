/**
 * stdio MCP entry — local use with Cursor / Claude Desktop.
 * DATABASE_URL is optional at startup (env block or connect tool database_url).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createMcpServer } from "./server.js"
import { logger } from "./utils/logger.js"

const server = createMcpServer()
const transport = new StdioServerTransport()
await server.connect(transport)

logger.info("querygate started (stdio)", {
  pid: process.pid,
  hint: process.env.DATABASE_URL
    ? "DATABASE_URL loaded from env"
    : "No DATABASE_URL in env — user can provide Postgres URL in chat, then call connect with database_url",
})

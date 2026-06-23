/**
 * stdio MCP entry — local use with Cursor / Claude Desktop.
 * Requires DATABASE_URL in mcp.json env block.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createMcpServer } from "./server.js"
import { requireEnvDatabaseUrl } from "./config/index.js"
import { logger } from "./utils/logger.js"

requireEnvDatabaseUrl()

const server = createMcpServer()
const transport = new StdioServerTransport()
await server.connect(transport)

logger.info("querygate started (stdio)", { pid: process.pid })

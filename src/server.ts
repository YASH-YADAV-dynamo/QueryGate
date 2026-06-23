import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { ALL_TOOLS, getToolByName } from "./tools/index.js"
import { logger } from "./utils/logger.js"

export function createMcpServer(): Server {
  const server = new Server(
    { name: "querygate", version: "2.0.0" },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const tool = getToolByName(name)

    if (!tool) {
      return {
        content: [{ type: "text", text: `ERROR: Unknown tool: ${name}` }],
        isError: true,
      }
    }

    logger.info("Tool called", { tool: name })

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await tool.handler(args as any)) as any
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("Tool error", { tool: name, error: msg })
      return {
        content: [{ type: "text", text: `ERROR: ${msg}` }],
        isError: true,
      }
    }
  })

  return server
}

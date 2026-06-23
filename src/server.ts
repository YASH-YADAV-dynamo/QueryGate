import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

import { ALL_TOOLS, getToolByName } from "./tools/index.js"
import { getWidgetByUri, WIDGET_RESOURCES } from "./widgets/index.js"
import { runWithDatabaseUrlAsync } from "./context.js"
import { logger } from "./utils/logger.js"

export function createMcpServer(): Server {
  const server = new Server(
    { name: "querygate", version: "2.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.meta ? { _meta: tool.meta } : {}),
    })),
  }))

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: WIDGET_RESOURCES.map((w) => ({
      uri: w.uri,
      name: w.name,
      description: w.description,
      mimeType: w.mimeType,
    })),
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const widget = getWidgetByUri(req.params.uri)
    if (!widget) {
      throw new Error(`Unknown resource: ${req.params.uri}`)
    }
    return {
      contents: [
        {
          uri: widget.uri,
          mimeType: widget.mimeType,
          text: widget.html,
          _meta: { ui: { prefersBorder: true, csp: { connectDomains: [] } } },
        },
      ],
    }
  })

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

    const runTool = async () => {
      const result = await tool.handler(args as never)
      const response: Record<string, unknown> = {
        content: result.content,
        ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        ...(result.isError ? { isError: true } : {}),
      }
      const meta = result._meta ?? tool.meta
      if (meta) response._meta = meta
      return response
    }

    try {
      const argUrl =
        args && typeof args === "object" && typeof (args as Record<string, unknown>).database_url === "string"
          ? ((args as Record<string, unknown>).database_url as string)
          : undefined

      if (argUrl) {
        return await runWithDatabaseUrlAsync(argUrl, runTool)
      }
      return await runTool()
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

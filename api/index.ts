import type { VercelRequest, VercelResponse } from "@vercel/node"

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const host = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://querygate.vercel.app"

  res.status(200).json({
    name: "QueryGate",
    description: "Read-only PostgreSQL MCP server",
    mcpUrl: `${host}/mcp`,
    setup: {
      mcpServers: {
        querygate: {
          url: `${host}/mcp`,
          headers: {
            DATABASE_URL: "postgres://user:password@host:5432/mydb",
          },
        },
      },
    },
  })
}

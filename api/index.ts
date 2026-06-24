import type { VercelRequest, VercelResponse } from "@vercel/node"

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const host = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://querygatev0.vercel.app"

  res.status(200).json({
    name: "QueryGate",
    description: "Read-only PostgreSQL MCP server",
    mcpUrl: `${host}/sse`,
    streamableHttpUrl: `${host}/mcp`,
    flow: [
      "1. Call connect with database_url once",
      "2. Server encrypts URL in Postgres, returns access_token (JWT with connection id only)",
      "3. Pass access_token on all later tool calls (or Authorization: Bearer header)",
    ],
    setup: {
      mcpServers: {
        querygate: {
          url: `${host}/sse`,
          headers: {
            Authorization: "Bearer <access_token from connect>",
          },
        },
      },
    },
    legacySetup: {
      note: "Without QUERYGATE_STORE_URL on the server, use DATABASE_URL header instead",
      mcpServers: {
        querygate: {
          url: `${host}/sse`,
          headers: {
            DATABASE_URL: "postgres://user:password@host:5432/mydb",
          },
        },
      },
    },
    vercelEnv: [
      "JWT_SECRET — signs access tokens (required)",
      "ENCRYPTION_KEY — encrypts URLs inside JWT (optional but recommended)",
      "QUERYGATE_STORE_URL — full Postgres URL for Prisma audit store",
      "OR split vars: DATABASE=neondb + PGHOST + PGUSER + PGPASSWORD (Neon / Vercel integration)",
    ],
  })
}

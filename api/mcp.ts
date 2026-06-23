import "./_load-env.js"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleMcpRoute } from "../dist/http/mcp-route.js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleMcpRoute(req, res)
}

export const config = {
  maxDuration: 60,
}

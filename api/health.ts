import "./_load-env.js"
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleHealth } from "../dist/http/mcp-route.js"

export default function handler(req: VercelRequest, res: VercelResponse) {
  handleHealth(req, res)
}

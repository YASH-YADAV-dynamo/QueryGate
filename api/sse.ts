import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleSseRoute } from "../dist/http/sse-route.js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleSseRoute(req, res)
}

export const config = {
  maxDuration: 60,
}

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleMessagesRoute } from "../dist/http/sse-route.js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await handleMessagesRoute(req, res)
}

export const config = {
  maxDuration: 60,
}

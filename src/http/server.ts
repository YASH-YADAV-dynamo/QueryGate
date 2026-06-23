import { createHttpApp } from "./app.js"
import { logger } from "../utils/logger.js"

export interface HttpServerOptions {
  port?: number
  host?: string
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env.PORT ?? 3000)
  const host = options.host ?? process.env.HOST ?? "0.0.0.0"
  const app = createHttpApp()

  await new Promise<void>((resolve, reject) => {
    app.listen(port, host, (err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })

  logger.info("querygate started (http)", {
    url: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/mcp`,
    health: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/health`,
    hint: "Use ngrok or deploy to Vercel for ChatGPT HTTPS custom app",
  })
}

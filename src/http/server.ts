import { createHttpApp } from "./app.js"
import { printStartup } from "../utils/startup.js"

export interface HttpServerOptions {
  port?: number
  host?: string
}

export async function startHttpServer(options: HttpServerOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env.PORT ?? 3000)
  const host = options.host ?? process.env.HOST ?? "0.0.0.0"
  const base = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`
  const app = createHttpApp()

  await new Promise<void>((resolve, reject) => {
    app.listen(port, host, (err?: Error) => {
      if (err) reject(err)
      else resolve()
    })
  })

  printStartup([
    `listening on port ${port} → ${base}`,
    `ChatGPT  → ${base}/sse`,
    `Cursor   → ${base}/mcp`,
    `health   → ${base}/health`,
    "tunnel for ChatGPT: ngrok http " + port,
  ])
}

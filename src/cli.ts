/**
 * QueryGate CLI — dual transport:
 *   querygate --stdio     local MCP (Cursor, Claude Desktop)
 *   querygate --http      HTTP server for ChatGPT custom app (use ngrok/Vercel for HTTPS)
 */

const args = process.argv.slice(2)

function hasFlag(flag: string): boolean {
  return args.includes(flag)
}

function getArgValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  if (i >= 0 && args[i + 1]) return args[i + 1]
  return undefined
}

const useHttp =
  hasFlag("--http") ||
  hasFlag("http") ||
  process.env.QUERYGATE_TRANSPORT === "http"

if (useHttp) {
  const port = Number(getArgValue("--port") ?? process.env.PORT ?? 3000)
  const { startHttpServer } = await import("./http/server.js")
  await startHttpServer({ port })
} else {
  await import("./stdio.js")
}

export {}

type LogLevel = "debug" | "info" | "warn" | "error"

const PII_KEYS = /password|secret|token|key|credential|dsn|url/i

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 4) return obj
  if (typeof obj !== "object" || obj === null) return obj
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = PII_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)
  }
  return out
}

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? (redact(meta) as object) : {}),
  }
  // MCP uses stdio — write logs to stderr to avoid polluting the MCP stream
  process.stderr.write(JSON.stringify(entry) + "\n")
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
}

export type ErrorCode =
  | "DB_CONNECT_FAILED"
  | "DB_QUERY_FAILED"
  | "DB_TIMEOUT"
  | "SCHEMA_BUILD_FAILED"
  | "VALIDATION_BLOCKED"
  | "RATE_LIMITED"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "ALIAS_CONFLICT"
  | "EMBED_FAILED"
  | "MAX_RETRIES_EXCEEDED"
  | "PIPELINE_FAILED"

export class McpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "McpError"
  }
}

export function isDbError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && "code" in err
}

export function toMcpError(err: unknown, fallback: ErrorCode): McpError {
  if (err instanceof McpError) return err
  const msg = err instanceof Error ? err.message : String(err)
  return new McpError(fallback, msg)
}

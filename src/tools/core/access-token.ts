/** Shared MCP tool property for JWT from connect. */
export const ACCESS_TOKEN_SCHEMA = {
  type: "string" as const,
  description:
    "JWT from connect — REQUIRED on hosted Vercel for every tool call. session_id alone will fail.",
}

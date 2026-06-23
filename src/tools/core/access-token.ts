/** Shared MCP tool property for JWT from connect. */
export const ACCESS_TOKEN_SCHEMA = {
  type: "string" as const,
  description:
    "JWT access token from connect — use on all later tool calls instead of database_url (hosted Vercel)",
}

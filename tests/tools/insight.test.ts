import { describe, expect, test } from "bun:test"
import { handleQuery } from "../../src/tools/query.js"
import { getToolText, isToolError } from "../../src/tools/core/response.js"
import { createReadySession } from "../helpers/session.js"
import { withoutDatabaseUrl } from "../helpers/env.js"
import { buildMockSchema } from "../helpers/fixtures.js"

describe("query handler (stats action)", () => {
  test("returns error when no session or credentials", async () => {
    await withoutDatabaseUrl(async () => {
      const result = await handleQuery({ action: "stats" })
      expect(isToolError(result)).toBe(true)
    })
  })

  test("cache_stats reports query and embed cache", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "cache_stats" }),
    )
    expect(text).toContain("=== CACHE STATS ===")
    expect(text).toContain("Query cache:")
    expect(text).toContain("Embed cache:")
  })

  test("query_history is empty initially", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "query_history" }),
    )
    expect(text).toBe("No queries run yet.")
  })

  test("query_history lists recent entries", async () => {
    const session = createReadySession()
    session.history.push({
      id: "q1",
      question: "count users",
      sql: "SELECT COUNT(*) FROM users",
      status: "ok",
      rowCount: 1,
      durationMs: 12,
      ts: Date.now(),
    })

    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "query_history" }),
    )
    expect(text).toContain("=== QUERY HISTORY")
    expect(text).toContain("SELECT COUNT(*) FROM users")
  })

  test("session_stats includes session metadata", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "session_stats" }),
    )
    expect(text).toContain("=== SESSION STATS ===")
    expect(text).toContain("ready")
  })

  test("pii_report lists flagged columns", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "pii_report" }),
    )
    expect(text).toContain("=== PII REPORT ===")
    expect(text).toContain("public.users")
    expect(text).toContain("email")
  })

  test("pii_report when no PII tables", async () => {
    const session = createReadySession({
      schema: buildMockSchema({ piiTables: new Set() }),
    })
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "pii_report" }),
    )
    expect(text).toBe("No PII-flagged tables detected.")
  })

  test("schema_summary aggregates counts", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "stats", topic: "schema_summary" }),
    )
    expect(text).toContain("=== SCHEMA SUMMARY ===")
    expect(text).toContain("Tables: 2")
    expect(text).toContain("testdb")
  })
})

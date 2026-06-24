import { describe, expect, test } from "bun:test"
import { handleQuery } from "../../src/tools/query.js"
import { getToolText, isToolError } from "../../src/tools/core/response.js"
import { createReadySession } from "../helpers/session.js"
import { withoutDatabaseUrl } from "../helpers/env.js"
import { buildMockSchema } from "../helpers/fixtures.js"

describe("query handler (schema action)", () => {
  test("returns error when no session or credentials", async () => {
    await withoutDatabaseUrl(async () => {
      const result = await handleQuery({ action: "schema" })
      expect(isToolError(result)).toBe(true)
      expect(getToolText(result)).toContain("No session")
    })
  })

  test("lists all tables with columns and metadata", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "schema" }),
    )

    expect(text).toContain("Database: testdb")
    expect(text).toContain("TABLE: public.users")
    expect(text).toContain("TABLE: public.orders")
    expect(text).toContain("email: varchar")
    expect(text).toContain("⚠️ PII")
    expect(text).toContain("Related:")
  })

  test("filters tables by substring", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "schema", filter: "orders" }),
    )

    expect(text).toContain("TABLE: public.orders")
    expect(text).not.toContain("TABLE: public.users")
    expect(text).toContain('matching "orders"')
  })

  test("reports no tables when filter matches nothing", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "schema", filter: "nope" }),
    )
    expect(text).toBe('No tables found matching "nope".')
  })

  test("shows active aliases when present", async () => {
    const session = createReadySession()
    session.aliases.byFrom.set("customers", {
      from: "customers",
      to: "public.users",
      kind: "table",
      source: "user",
      confidence: 1,
      scope: "session",
      createdAt: Date.now(),
    })

    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "schema" }),
    )
    expect(text).toContain("Aliases: 1")
    expect(text).toContain('"customers" → "public.users"')
  })

  test("handles empty schema", async () => {
    const session = createReadySession({
      schema: buildMockSchema({ tables: new Map(), piiTables: new Set(), fkGraph: new Map() }),
    })
    const text = getToolText(
      await handleQuery({ database_url: session.databaseUrl, action: "schema" }),
    )
    expect(text).toBe("No tables found.")
  })
})

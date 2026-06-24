import { describe, expect, test } from "bun:test"
import { handleAnalytics } from "../../src/tools/analytics.js"
import { getToolText, isToolError } from "../../src/tools/core/response.js"
import { createReadySession } from "../helpers/session.js"
import { withoutDatabaseUrl } from "../helpers/env.js"

describe("analytics handler (alias actions)", () => {
  test("returns error when no session or credentials", async () => {
    await withoutDatabaseUrl(async () => {
      const result = await handleAnalytics({ action: "alias_list" })
      expect(isToolError(result)).toBe(true)
    })
  })

  test("alias_list reports empty store", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleAnalytics({ database_url: session.databaseUrl, action: "alias_list" }),
    )
    expect(text).toBe("No aliases set.")
  })

  test("alias_add creates alias and reports cache invalidation", async () => {
    const session = createReadySession()
    session.cache.query.set("key", {
      question: "q",
      sql: "SELECT 1",
      rows: [],
      rowCount: 0,
      executedAt: Date.now(),
      durationMs: 1,
      cacheKey: "key",
    })

    const text = getToolText(
      await handleAnalytics({
        database_url: session.databaseUrl,
        action: "alias_add",
        from: "customers",
        to: "public.users",
        kind: "table",
      }),
    )

    expect(text).toContain('Alias added: "customers" → "public.users"')
    expect(text).toContain("Invalidated 1 cached queries")
    expect(session.aliases.byFrom.has("customers")).toBe(true)
  })

  test("alias_add requires from and to", async () => {
    const session = createReadySession()
    const result = await handleAnalytics({
      database_url: session.databaseUrl,
      action: "alias_add",
      from: "x",
    })
    expect(getToolText(result)).toContain("ERROR:")
    expect(getToolText(result)).toContain("'from' and 'to'")
  })

  test("alias_remove deletes alias", async () => {
    const session = createReadySession()
    await handleAnalytics({
      database_url: session.databaseUrl,
      action: "alias_add",
      from: "foo",
      to: "public.users",
    })

    const text = getToolText(
      await handleAnalytics({ database_url: session.databaseUrl, action: "alias_remove", from: "foo" }),
    )
    expect(text).toContain('Removed alias "foo"')
    expect(session.aliases.byFrom.has("foo")).toBe(false)
  })

  test("alias_remove reports when alias not found", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleAnalytics({
        database_url: session.databaseUrl,
        action: "alias_remove",
        from: "missing",
      }),
    )
    expect(text).toBe('Alias "missing" not found.')
  })

  test("alias_add overwrites previous user mapping", async () => {
    const session = createReadySession()
    await handleAnalytics({
      database_url: session.databaseUrl,
      action: "alias_add",
      from: "orders",
      to: "public.orders",
    })

    const text = getToolText(
      await handleAnalytics({
        database_url: session.databaseUrl,
        action: "alias_add",
        from: "orders",
        to: "public.other",
      }),
    )
    expect(text).toContain('Alias added: "orders" → "public.other"')
    expect(session.aliases.byFrom.get("orders")?.to).toBe("public.other")
  })
})

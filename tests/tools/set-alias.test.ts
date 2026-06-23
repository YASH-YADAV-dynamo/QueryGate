import { describe, expect, test } from "bun:test"
import { handleSetAlias } from "../../src/tools/set-alias.js"
import { getToolText, isToolError } from "../../src/tools/core/response.js"
import { createReadySession } from "../helpers/session.js"

describe("set-alias handler", () => {
  test("returns error when session is missing", async () => {
    const result = await handleSetAlias({ session_id: "bad", action: "list" })
    expect(isToolError(result)).toBe(true)
  })

  test("list reports empty store", async () => {
    const session = createReadySession()
    const text = getToolText(await handleSetAlias({ session_id: session.id, action: "list" }))
    expect(text).toBe("No aliases set.")
  })

  test("add creates alias and reports cache invalidation", async () => {
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
      await handleSetAlias({
        session_id: session.id,
        action: "add",
        from: "customers",
        to: "public.users",
        kind: "table",
      }),
    )

    expect(text).toContain('Alias added: "customers" → "public.users"')
    expect(text).toContain("Invalidated 1 cached queries")
    expect(session.aliases.byFrom.has("customers")).toBe(true)
  })

  test("add requires from and to", async () => {
    const session = createReadySession()
    const result = await handleSetAlias({ session_id: session.id, action: "add", from: "x" })
    expect(getToolText(result)).toContain("ERROR:")
    expect(getToolText(result)).toContain("'from' and 'to'")
  })

  test("remove deletes alias", async () => {
    const session = createReadySession()
    await handleSetAlias({
      session_id: session.id,
      action: "add",
      from: "foo",
      to: "public.users",
    })

    const text = getToolText(
      await handleSetAlias({ session_id: session.id, action: "remove", from: "foo" }),
    )
    expect(text).toContain('Removed alias "foo"')
    expect(session.aliases.byFrom.has("foo")).toBe(false)
  })

  test("remove reports when alias not found", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleSetAlias({ session_id: session.id, action: "remove", from: "missing" }),
    )
    expect(text).toBe('Alias "missing" not found.')
  })

  test("user alias overrides previous user mapping", async () => {
    const session = createReadySession()
    await handleSetAlias({
      session_id: session.id,
      action: "add",
      from: "orders",
      to: "public.orders",
    })

    const text = getToolText(
      await handleSetAlias({
        session_id: session.id,
        action: "add",
        from: "orders",
        to: "public.other",
      }),
    )
    expect(text).toContain('Alias added: "orders" → "public.other"')
    expect(session.aliases.byFrom.get("orders")?.to).toBe("public.other")
  })
})

import { describe, expect, test } from "bun:test"
import {
  makeAliasStore,
  addAlias,
  removeAlias,
  resolveAliases,
  inferAliases,
} from "../../src/session/alias-store.js"
import { buildMockSchema } from "../helpers/fixtures.js"

describe("alias-store", () => {
  test("addAlias stores mapping and supports reverse lookup", () => {
    const store = makeAliasStore()
    const result = addAlias(store, {
      from: "customers",
      to: "public.users",
      kind: "table",
      source: "user",
      confidence: 1,
      scope: "session",
      createdAt: Date.now(),
    })
    expect(result.ok).toBe(true)
    expect(store.byFrom.get("customers")?.to).toBe("public.users")
    expect(store.byTo.get("public.users")).toHaveLength(1)
  })

  test("user alias blocks inferred override", () => {
    const store = makeAliasStore()
    addAlias(store, {
      from: "orders",
      to: "public.orders",
      kind: "table",
      source: "user",
      confidence: 1,
      scope: "session",
      createdAt: Date.now(),
    })
    const conflict = addAlias(store, {
      from: "orders",
      to: "public.other",
      kind: "table",
      source: "inferred",
      confidence: 0.9,
      scope: "session",
      createdAt: Date.now(),
    })
    expect(conflict.ok).toBe(false)
    expect(conflict.conflict?.to).toBe("public.orders")
  })

  test("removeAlias deletes mapping", () => {
    const store = makeAliasStore()
    addAlias(store, {
      from: "foo",
      to: "bar",
      kind: "table",
      source: "user",
      confidence: 1,
      scope: "session",
      createdAt: Date.now(),
    })
    expect(removeAlias(store, "foo")).toBe(true)
    expect(store.byFrom.has("foo")).toBe(false)
    expect(removeAlias(store, "missing")).toBe(false)
  })

  test("resolveAliases replaces terms longest-first", () => {
    const store = makeAliasStore()
    addAlias(store, {
      from: "order",
      to: "public.orders",
      kind: "table",
      source: "user",
      confidence: 1,
      scope: "session",
      createdAt: Date.now(),
    })
    addAlias(store, {
      from: "orders",
      to: "public.orders",
      kind: "table",
      source: "user",
      confidence: 1,
      scope: "session",
      createdAt: Date.now(),
    })
    const { resolved, replacements } = resolveAliases("show me orders by order total", store)
    expect(resolved).toContain("public.orders")
    expect(replacements.length).toBeGreaterThan(0)
  })

  test("inferAliases suggests variants from schema", () => {
    const schema = buildMockSchema()
    const inferred = inferAliases(schema)
    expect(inferred.length).toBeGreaterThan(0)
    expect(inferred.every((a) => a.confidence >= 0 && a.confidence <= 1)).toBe(true)
  })
})

import { describe, expect, test } from "bun:test"
import { validateSql, makeRateLimitState, tickRateLimit } from "../../src/security/validator.js"
import { buildValidationSchema } from "../helpers/fixtures.js"

function ctx(overrides?: { rateLimitCount?: number }) {
  const schema = buildValidationSchema()
  const rateLimit = makeRateLimitState()
  rateLimit.limit = 5
  if (overrides?.rateLimitCount !== undefined) {
    rateLimit.count = overrides.rateLimitCount
  }
  return { schema, rateLimit, sessionId: "test-session" }
}

describe("validateSql", () => {
  test("allows safe SELECT on known tables", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("SELECT id, name FROM users LIMIT 10", {
      schema,
      rateLimit,
      sessionId,
    })
    expect(result.passed).toBe(true)
    expect(result.isReadOnly).toBe(true)
    expect(result.blocked).toHaveLength(0)
  })

  test("blocks INSERT statements", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("INSERT INTO users (name) VALUES ('x')", {
      schema,
      rateLimit,
      sessionId,
    })
    expect(result.passed).toBe(false)
    expect(result.blocked.some((b) => b.includes("write_op_block"))).toBe(true)
  })

  test("blocks UPDATE and DELETE", () => {
    const { schema, rateLimit, sessionId } = ctx()
    expect(validateSql("UPDATE users SET name = 'x'", { schema, rateLimit, sessionId }).passed).toBe(false)
    expect(validateSql("DELETE FROM users", { schema, rateLimit, sessionId }).passed).toBe(false)
  })

  test("blocks DDL operations", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("DROP TABLE users", { schema, rateLimit, sessionId })
    expect(result.passed).toBe(false)
    expect(result.blocked.some((b) => b.includes("ddl_block"))).toBe(true)
  })

  test("blocks stacked queries after semicolon", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("SELECT 1; DROP TABLE users", { schema, rateLimit, sessionId })
    expect(result.passed).toBe(false)
    expect(result.blocked.some((b) => b.includes("semicolon_chain"))).toBe(true)
  })

  test("blocks references to tables not in schema", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("SELECT * FROM invoices", { schema, rateLimit, sessionId })
    expect(result.passed).toBe(false)
    expect(result.blocked.some((b) => b.includes("hallucinated_table"))).toBe(true)
  })

  test("accepts schema-qualified table names", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("SELECT * FROM public.orders LIMIT 5", {
      schema,
      rateLimit,
      sessionId,
    })
    expect(result.passed).toBe(true)
  })

  test("flags PII when query touches PII tables", () => {
    const { schema, rateLimit, sessionId } = ctx()
    const result = validateSql("SELECT email FROM users", { schema, rateLimit, sessionId })
    expect(result.passed).toBe(true)
    expect(result.hasPii).toBe(true)
  })

  test("enforces rate limit", () => {
    const { schema, rateLimit, sessionId } = ctx({ rateLimitCount: 5 })
    const result = validateSql("SELECT 1", { schema, rateLimit, sessionId })
    expect(result.passed).toBe(false)
    expect(result.blocked.some((b) => b.includes("rate_limit"))).toBe(true)
  })
})

describe("tickRateLimit", () => {
  test("increments count within the same window", () => {
    const state = makeRateLimitState()
    state.count = 0
    tickRateLimit(state)
    expect(state.count).toBe(1)
    tickRateLimit(state)
    expect(state.count).toBe(2)
  })
})

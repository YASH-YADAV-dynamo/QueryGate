import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import { getToolText, isToolError } from "../../src/tools/core/response.js"
import { createReadySession } from "../helpers/session.js"
import { withoutDatabaseUrl } from "../helpers/env.js"
import { updateSessionStatus } from "../../src/session/manager.js"

const mockPipeline = mock(() =>
  Promise.resolve({
    rows: [{ id: 1, name: "Alice" }],
    rowCount: 1,
    cached: false,
    truncated: false,
    durationMs: 5,
    pipelineId: "pipe-1",
    sql: "SELECT id, name FROM users LIMIT 1",
  }),
)

mock.module("../../src/tools/execute-sql.pipeline.js", () => ({
  executeSqlPipeline: mockPipeline,
}))

const { handleExecuteSql } = await import("../../src/tools/execute-sql.js")

describe("execute-sql handler", () => {
  beforeEach(() => {
    mockPipeline.mockImplementation(() =>
      Promise.resolve({
        rows: [{ id: 1, name: "Alice" }],
        rowCount: 1,
        cached: false,
        truncated: false,
        durationMs: 5,
        pipelineId: "pipe-1",
        sql: "SELECT id, name FROM users LIMIT 1",
      }),
    )
  })

  afterEach(() => {
    mockPipeline.mockClear()
  })

  test("returns error when session is missing", async () => {
    await withoutDatabaseUrl(async () => {
      const result = await handleExecuteSql({
        session_id: "missing",
        sql: "SELECT 1",
      })
      expect(isToolError(result)).toBe(true)
      expect(getToolText(result)).toContain("Session expired or not found")
    })
  })

  test("returns error when session is not ready", async () => {
    const session = createReadySession()
    updateSessionStatus(session.id, "connecting")

    const result = await handleExecuteSql({
      session_id: session.id,
      sql: "SELECT 1",
    })
    expect(isToolError(result)).toBe(true)
    expect(getToolText(result)).toContain("Session not ready")
  })

  test("delegates to pipeline and formats JSON rows", async () => {
    const session = createReadySession()
    const text = getToolText(
      await handleExecuteSql({
        session_id: session.id,
        sql: "SELECT id, name FROM users LIMIT 1",
      }),
    )

    expect(mockPipeline).toHaveBeenCalledTimes(1)
    expect(text).toContain("✓ Executed in 5ms")
    expect(text).toContain("1 row")
    expect(text).toContain('"name": "Alice"')
  })

  test("shows cached result label", async () => {
    mockPipeline.mockImplementation(() =>
      Promise.resolve({
        rows: [{ n: 1 }],
        rowCount: 1,
        cached: true,
        truncated: false,
        durationMs: 0,
        pipelineId: "pipe-2",
        sql: "SELECT 1",
      }),
    )

    const session = createReadySession()
    const text = getToolText(
      await handleExecuteSql({ session_id: session.id, sql: "SELECT 1" }),
    )
    expect(text).toContain("✓ Cached result")
  })

  test("surfaces pipeline errors", async () => {
    mockPipeline.mockImplementation(() => {
      throw new Error("[hallucinated_table] Table not found")
    })

    const session = createReadySession()
    const result = await handleExecuteSql({
      session_id: session.id,
      sql: "SELECT * FROM fake",
    })
    expect(isToolError(result)).toBe(true)
    expect(getToolText(result)).toContain("Table not found")
  })
})

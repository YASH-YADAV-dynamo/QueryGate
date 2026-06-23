import { describe, expect, test } from "bun:test"
import { ALL_TOOLS, getToolByName } from "../../src/tools/index.js"

describe("tools registry", () => {
  test("exports six tools in stable order", () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual([
      "connect",
      "execute_sql",
      "schema_reader",
      "set_alias",
      "insight",
      "customer_analytics",
    ])
  })

  test("each tool has name, description, inputSchema, and handler", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema.type).toBe("object")
      expect(typeof tool.handler).toBe("function")
    }
  })

  test("getToolByName resolves registered tools", () => {
    expect(getToolByName("execute_sql")?.name).toBe("execute_sql")
    expect(getToolByName("missing")).toBeUndefined()
  })
})

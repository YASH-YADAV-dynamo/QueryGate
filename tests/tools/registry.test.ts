import { describe, expect, test } from "bun:test"
import { ALL_TOOLS, getToolByName } from "../../src/tools/index.js"

describe("tools registry", () => {
  test("exports three tools in stable order", () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual(["connect", "query", "analytics"])
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
    expect(getToolByName("query")?.name).toBe("query")
    expect(getToolByName("analytics")?.name).toBe("analytics")
    expect(getToolByName("missing")).toBeUndefined()
  })
})

import { describe, expect, test } from "bun:test"
import { toolOk, toolError, getToolText, isToolError } from "../../../src/tools/core/response.js"

describe("tools/core/response", () => {
  test("toolOk wraps text in MCP content", () => {
    const result = toolOk("hello")
    expect(result.content).toEqual([{ type: "text", text: "hello" }])
    expect(getToolText(result)).toBe("hello")
    expect(isToolError(result)).toBe(false)
  })

  test("toolError prefixes message with ERROR:", () => {
    const result = toolError("something broke")
    expect(getToolText(result)).toBe("ERROR: something broke")
    expect(isToolError(result)).toBe(true)
  })
})

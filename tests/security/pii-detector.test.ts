import { describe, expect, test } from "bun:test"
import { detectPii, maskIfPii } from "../../src/security/pii-detector.js"

describe("pii-detector", () => {
  test("detectPii flags sensitive column names", () => {
    expect(detectPii("email")).toBe("high")
    expect(detectPii("user_email")).toBe("high")
    expect(detectPii("phone_number")).toBe("high")
    expect(detectPii("total_amount")).toBe("none")
  })

  test("maskIfPii redacts high-risk values", () => {
    expect(maskIfPii("alice@example.com", "high")).toBe("al*************om")
    expect(maskIfPii("abc", "high")).toBe("***")
    expect(maskIfPii(null, "high")).toBe(null)
    expect(maskIfPii("visible", "none")).toBe("visible")
  })
})

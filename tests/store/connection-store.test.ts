import { describe, expect, test } from "bun:test"
import { encryptSecret, decryptSecret } from "../../src/crypto/encrypt.js"
import { signConnectionToken, verifyConnectionToken } from "../../src/auth/jwt.js"

describe("crypto + jwt", () => {
  test("encrypt/decrypt roundtrip", () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-unit-tests"
    const url = "postgres://user:pass@host.neon.tech/db?sslmode=require"
    const encrypted = encryptSecret(url)
    expect(encrypted).not.toContain("pass")
    expect(decryptSecret(encrypted)).toBe(url)
  })

  test("JWT contains cid only", async () => {
    process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests"
    const token = await signConnectionToken("conn_test123")
    const { cid } = await verifyConnectionToken(token)
    expect(cid).toBe("conn_test123")
    expect(token.split(".")).toHaveLength(3)
    expect(token).not.toContain("postgres")
  })
})

import { describe, expect, test } from "bun:test"
import { encryptSecret, decryptSecret } from "../../src/crypto/encrypt.js"
import { signConnectionToken, verifyConnectionToken, signUrlToken, verifyUrlToken } from "../../src/auth/jwt.js"

describe("crypto + jwt", () => {
  test("encrypt/decrypt roundtrip", () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-unit-tests"
    const url = "postgres://user:pass@host.neon.tech/db?sslmode=require"
    const encrypted = encryptSecret(url)
    expect(encrypted).not.toContain("pass")
    expect(decryptSecret(encrypted)).toBe(url)
  })

  test("legacy JWT contains cid only", async () => {
    process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests"
    const token = await signConnectionToken("conn_test123")
    const { cid } = await verifyConnectionToken(token)
    expect(cid).toBe("conn_test123")
    expect(token.split(".")).toHaveLength(3)
    expect(token).not.toContain("postgres")
  })

  test("self-contained token roundtrip (encrypted)", async () => {
    process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests"
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-unit-tests"
    const url = "postgres://user:pass@host.neon.tech/db?sslmode=require"
    const token = await signUrlToken(url)
    const decoded = await verifyUrlToken(token)
    expect(decoded).toBe(url)
    // URL should not appear in raw token (it's encrypted in the eu claim)
    expect(token).not.toContain("neon.tech")
  })

  test("self-contained token roundtrip (plaintext fallback)", async () => {
    process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests"
    delete process.env.ENCRYPTION_KEY
    const url = "postgres://user:pass@host.neon.tech/db?sslmode=require"
    const token = await signUrlToken(url)
    const decoded = await verifyUrlToken(token)
    expect(decoded).toBe(url)
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-unit-tests"
  })

  test("verifyUrlToken returns null for legacy cid tokens", async () => {
    process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests"
    const token = await signConnectionToken("conn_test123")
    const result = await verifyUrlToken(token)
    expect(result).toBeNull()
  })
})

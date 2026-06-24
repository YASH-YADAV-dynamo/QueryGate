import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import {
  buildPostgresUrlFromParts,
  ensureDatabaseInUrl,
  resolveDatabaseUrlFromEnv,
  resolvePostgresUrlFromEnv,
} from "../../src/config/postgres-url.js"

describe("postgres-url env resolver", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of [
      "DATABASE_URL",
      "QUERYGATE_STORE_URL",
      "DATABASE",
      "PGHOST",
      "PGUSER",
      "PGPASSWORD",
    ]) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
  })

  test("appends DATABASE=neondb when URL has no path", () => {
    const url = "postgresql://user:pass@ep-host.neon.tech?sslmode=require"
    expect(ensureDatabaseInUrl(url, "neondb")).toBe(
      "postgresql://user:pass@ep-host.neon.tech/neondb?sslmode=require",
    )
  })

  test("builds full URL from split Vercel vars", () => {
    process.env.PGHOST = "ep-host.neon.tech"
    process.env.PGUSER = "neondb_owner"
    process.env.PGPASSWORD = "secret"
    process.env.DATABASE = "neondb"

    const url = buildPostgresUrlFromParts()
    expect(url).toContain("ep-host.neon.tech/neondb")
    expect(url).toContain("sslmode=require")
    expect(url).toContain("neondb_owner")
  })

  test("resolveDatabaseUrlFromEnv uses QUERYGATE_STORE_URL when only store env is set", () => {
    process.env.QUERYGATE_STORE_URL =
      "postgresql://u:p@host.neon.tech/neondb?sslmode=require&channel_binding=require"

    const url = resolveDatabaseUrlFromEnv()
    expect(url).toContain("/neondb")
    expect(url).not.toContain("channel_binding")
  })

  test("resolvePostgresUrlFromEnv prefers QUERYGATE_STORE_URL with DATABASE fill", () => {
    process.env.QUERYGATE_STORE_URL =
      "postgresql://u:p@host.neon.tech?sslmode=require"
    process.env.DATABASE = "neondb"

    const url = resolvePostgresUrlFromEnv({ preferStore: true })
    expect(url).toContain("/neondb")
    expect(url).not.toContain("channel_binding")
  })
})

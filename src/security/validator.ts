import type { ValidationResult, SchemaStore, RateLimitState } from "../db/types.js"
import { config } from "../config/index.js"

const WRITE_OPS = /^\s*(insert|update|delete|merge)\b/i
const DDL_OPS = /^\s*(create|alter|drop|truncate|rename)\b/i
const COPY_OPS = /\bcopy\b.*(to|into)\b/i
const PG_CATALOG = /\b(pg_shadow|pg_roles|pg_authid|pg_hba_file_rules)\b/i
const SEMICOLON_CHAIN = /;[\s\S]*?(select|insert|update|delete|drop|create)/i
const COMMENT_INJECTION = /('|"|\b)\s*(--|\/\*)/i
const STACKED_UNION_ATTACK = /union\s+(all\s+)?select.*(password|secret|token)/i

interface SecurityContext {
  schema: SchemaStore
  rateLimit: RateLimitState
  sessionId: string
}

interface CheckResult {
  passed: boolean
  reason?: string
}

type Check = {
  name: string
  severity: "block" | "warn"
  test: (sql: string, ctx: SecurityContext) => CheckResult
}

const CHECKS: Check[] = [
  {
    name: "write_op_block",
    severity: "block",
    test: (sql) => ({ passed: !WRITE_OPS.test(sql), reason: "Write operations not permitted" }),
  },
  {
    name: "ddl_block",
    severity: "block",
    test: (sql) => ({ passed: !DDL_OPS.test(sql), reason: "DDL operations not permitted" }),
  },
  {
    name: "copy_to_file",
    severity: "block",
    test: (sql) => ({ passed: !COPY_OPS.test(sql), reason: "COPY operations not permitted" }),
  },
  {
    name: "pg_catalog_access",
    severity: "block",
    test: (sql) => ({ passed: !PG_CATALOG.test(sql), reason: "System catalog access not permitted" }),
  },
  {
    name: "semicolon_chain",
    severity: "block",
    test: (sql) => ({ passed: !SEMICOLON_CHAIN.test(sql), reason: "Stacked queries not permitted" }),
  },
  {
    name: "comment_injection",
    severity: "block",
    test: (sql) => ({ passed: !COMMENT_INJECTION.test(sql), reason: "Suspicious comment pattern detected" }),
  },
  {
    name: "union_attack",
    severity: "block",
    test: (sql) => ({ passed: !STACKED_UNION_ATTACK.test(sql), reason: "Suspicious UNION pattern detected" }),
  },
  {
    name: "rate_limit",
    severity: "block",
    test: (_sql, ctx) => {
      const now = Date.now()
      const rl = ctx.rateLimit
      const inWindow = now - rl.windowStart < 60_000
      const count = inWindow ? rl.count : 0
      return {
        passed: count < rl.limit,
        reason: `Rate limit exceeded: ${count}/${rl.limit} queries per minute`,
      }
    },
  },
  {
    name: "hallucinated_table",
    severity: "block",
    test: (sql, ctx) => {
      // Extract quoted or unquoted table-like identifiers after FROM/JOIN
      const refs = Array.from(
        sql.matchAll(/(?:from|join)\s+"?([a-z_][a-z0-9_.]*)"?/gi),
        (m) => m[1]?.toLowerCase() ?? "",
      ).filter(Boolean)

      for (const ref of refs) {
        // Could be schema.table or just table
        const hasSchema = ref.includes(".")
        if (hasSchema) {
          if (!ctx.schema.tables.has(ref)) {
            return { passed: false, reason: `Table not found in schema: ${ref}` }
          }
        } else {
          const found = Array.from(ctx.schema.tables.keys()).some(
            (k) => k.endsWith(`.${ref}`),
          )
          if (!found) {
            return { passed: false, reason: `Table not found in schema: ${ref}` }
          }
        }
      }
      return { passed: true }
    },
  },
]

export function validateSql(sql: string, ctx: SecurityContext): ValidationResult {
  const blocked: string[] = []
  let hasPii = false

  // Check if result touches PII tables
  for (const piiTable of ctx.schema.piiTables) {
    if (sql.toLowerCase().includes(piiTable.split(".")[1] ?? "")) {
      hasPii = true
      break
    }
  }

  for (const check of CHECKS) {
    const result = check.test(sql, ctx)
    if (!result.passed) {
      blocked.push(`[${check.name}] ${result.reason ?? "blocked"}`)
      if (check.severity === "block") {
        // Short-circuit on first hard block
        return {
          passed: false,
          isReadOnly: false,
          hasPii,
          blocked,
          syntaxOk: false,
        }
      }
    }
  }

  return {
    passed: blocked.length === 0,
    isReadOnly: true,
    hasPii,
    blocked,
    syntaxOk: true,
  }
}

/** Update rate limit state — mutates in place, call after validation passes */
export function tickRateLimit(state: RateLimitState): void {
  const now = Date.now()
  if (now - state.windowStart >= 60_000) {
    state.windowStart = now
    state.count = 1
  } else {
    state.count++
  }
}

export function makeRateLimitState(): RateLimitState {
  return {
    windowStart: Date.now(),
    count: 0,
    limit: config.MCP_RATE_LIMIT,
  }
}

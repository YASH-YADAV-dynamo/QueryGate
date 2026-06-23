import type { Alias, AliasKind, AliasStore, SchemaStore } from "../db/types.js"
import { CONSTANTS } from "../config/index.js"

export function makeAliasStore(): AliasStore {
  return {
    byFrom: new Map(),
    byTo: new Map(),
    exprs: new Map(),
  }
}

export function addAlias(store: AliasStore, alias: Alias): { ok: boolean; conflict?: Alias } {
  if (store.byFrom.size >= CONSTANTS.MAX_ALIASES) {
    return { ok: false }
  }
  const existing = store.byFrom.get(alias.from)
  if (existing && existing.source === "user" && alias.source !== "user") {
    return { ok: false, conflict: existing }
  }
  store.byFrom.set(alias.from, alias)

  const arr = store.byTo.get(alias.to) ?? []
  if (!arr.find((a) => a.from === alias.from)) arr.push(alias)
  store.byTo.set(alias.to, arr)

  if (alias.kind === "expression") {
    store.exprs.set(alias.from, alias.to)
  }
  return { ok: true }
}

export function removeAlias(store: AliasStore, from: string): boolean {
  const alias = store.byFrom.get(from)
  if (!alias) return false
  store.byFrom.delete(from)
  const arr = store.byTo.get(alias.to) ?? []
  store.byTo.set(
    alias.to,
    arr.filter((a) => a.from !== from),
  )
  if (alias.kind === "expression") store.exprs.delete(from)
  return true
}

/** Resolve user terms in a question using the alias store */
export function resolveAliases(
  question: string,
  store: AliasStore,
): { resolved: string; replacements: Alias[] } {
  const replacements: Alias[] = []
  let resolved = question

  // Sort longest-first to avoid partial replacements
  const entries = Array.from(store.byFrom.entries()).sort(
    ([a], [b]) => b.length - a.length,
  )

  for (const [from, alias] of entries) {
    if (resolved.toLowerCase().includes(from.toLowerCase())) {
      resolved = resolved.replace(new RegExp(from, "gi"), alias.to)
      replacements.push(alias)
    }
  }

  return { resolved, replacements }
}

/** Levenshtein distance for fuzzy alias inference */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
    }
  }
  return dp[m]![n]!
}

function similarity(a: string, b: string): number {
  const dist = editDistance(a.toLowerCase(), b.toLowerCase())
  return 1 - dist / Math.max(a.length, b.length, 1)
}

/** Auto-infer aliases by comparing column/table name variants */
export function inferAliases(schema: SchemaStore): Alias[] {
  const inferred: Alias[] = []
  const now = Date.now()

  for (const table of schema.tables.values()) {
    // Infer table aliases: "orders" for "order_line_items"
    const variants = generateNameVariants(table.name)
    for (const variant of variants) {
      if (variant === table.name) continue
      const conf = similarity(variant, table.name)
      if (conf >= CONSTANTS.ALIAS_CONFIDENCE_THRESHOLD) {
        inferred.push({
          from: variant,
          to: table.fullyQualified,
          kind: "table",
          source: "inferred",
          confidence: conf,
          scope: "session",
          createdAt: now,
        })
      }
    }

    // Infer column aliases within each table
    for (const col of table.columns) {
      const colVariants = generateNameVariants(col.name)
      for (const variant of colVariants) {
        if (variant === col.name) continue
        const conf = similarity(variant, col.name)
        if (conf >= CONSTANTS.ALIAS_CONFIDENCE_THRESHOLD) {
          inferred.push({
            from: variant,
            to: col.name,
            kind: "column",
            source: "inferred",
            confidence: conf,
            scope: "session",
            createdAt: now,
          })
        }
      }
    }
  }

  return inferred
}

function generateNameVariants(name: string): string[] {
  const variants = new Set<string>()
  // snake_case → remove underscores
  variants.add(name.replace(/_/g, ""))
  // Remove common suffixes
  for (const suffix of ["_id", "_at", "_by", "_ts", "s", "es"]) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      variants.add(name.slice(0, -suffix.length))
    }
  }
  // Plural: users → user
  if (name.endsWith("s")) variants.add(name.slice(0, -1))
  // Singular: user → users
  variants.add(name + "s")
  return Array.from(variants)
}

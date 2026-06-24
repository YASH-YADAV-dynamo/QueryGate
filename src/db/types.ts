import type { LRUCache } from "../cache/lru.js"
import type { RingBuffer } from "../cache/ring-buffer.js"

// ─── DB types ────────────────────────────────────────────────────────────────

export type Dialect = "postgres" | "mysql" | "sqlite"

export type PiiRisk = "high" | "low" | "none"

export interface ColumnMeta {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
  references: { table: string; column: string } | null
  piiRisk: PiiRisk
  sampleValues: string[]
}

export interface TableMeta {
  schema: string
  name: string
  fullyQualified: string // "schema.table"
  rowEstimate: number
  columns: ColumnMeta[]
  indexes: { name: string; columns: string[] }[]
  embedding: number[]
  embeddingText: string
  ingestedAt: number
}

export interface SchemaStore {
  readonly tables: Map<string, TableMeta>
  readonly fkGraph: Map<string, string[]>
  readonly piiTables: Set<string>
  readonly dbName: string
  readonly dialect: Dialect
  readonly version: string
  readonly builtAt: number
}

// ─── Alias types ─────────────────────────────────────────────────────────────

export type AliasKind = "table" | "column" | "schema" | "expression"
export type AliasSource = "user" | "inferred" | "schema"

export interface Alias {
  from: string
  to: string
  kind: AliasKind
  source: AliasSource
  confidence: number
  scope: "session" | "global"
  createdAt: number
}

export interface AliasStore {
  byFrom: Map<string, Alias>
  byTo: Map<string, Alias[]>
  exprs: Map<string, string> // name → SQL expression
}

// ─── Session types ────────────────────────────────────────────────────────────

export type SessionStatus =
  | "pending"
  | "connecting"
  | "schema_load"
  | "ready"
  | "error"
  | "expired"

export interface QueryHistoryEntry {
  id: string
  question: string
  sql: string
  status: "ok" | "error" | "cached"
  rowCount: number
  durationMs: number
  ts: number
}

export interface QueryCacheEntry {
  question: string
  sql: string
  rows: unknown[]
  rowCount: number
  executedAt: number
  durationMs: number
  cacheKey: string
}

export interface SessionStats {
  totalQueries: number
  cacheHits: number
  totalRows: number
  avgDurationMs: number
  errorCount: number
}

export interface SessionState {
  id: string
  connId: string // SHA256 of DATABASE_URL — never store raw URL
  databaseUrl: string // raw URL — in-memory only, never persisted
  status: SessionStatus
  createdAt: number
  lastUsedAt: number
  expiresAt: number
  schema: SchemaStore
  aliases: AliasStore
  cache: {
    query: LRUCache<string, QueryCacheEntry>
    embed: LRUCache<string, number[]>
  }
  history: RingBuffer<QueryHistoryEntry>
  activePipeline: PipelineState | null
  stats: SessionStats
  error?: string
}

// ─── Query pipeline types ─────────────────────────────────────────────────────

export type PipelineStep =
  | "cache_check"
  | "alias_resolve"
  | "rag_retrieve"
  | "clarify"
  | "plan"
  | "generate"
  | "validate"
  | "execute"
  | "retry"
  | "pii_strip"
  | "cache_write"
  | "done"

export interface ValidationResult {
  passed: boolean
  isReadOnly: boolean
  hasPii: boolean
  blocked: string[]
  syntaxOk: boolean
}

export interface PipelineState {
  id: string
  question: string
  resolved: string
  currentStep: PipelineStep
  retryCount: number
  startedAt: number
  relevantTables: TableMeta[]
  subQueries: string[]
  sql: string
  validationResult: ValidationResult | null
  rows: unknown[]
  error: string | null
  needsClarification: string | null // question to ask user
}

export type StepResult<T> =
  | { ok: true; value: T; next: PipelineStep }
  | { ok: false; error: string; next: "retry" | "done" }

// ─── Rate limit ───────────────────────────────────────────────────────────────

export interface RateLimitState {
  windowStart: number
  count: number
  limit: number
}

import { createHash, randomUUID } from "crypto"
import type { SessionState, SessionStatus } from "../db/types.js"
import { LRUCache } from "../cache/lru.js"
import { RingBuffer } from "../cache/ring-buffer.js"
import { makeAliasStore } from "./alias-store.js"
import { makeRateLimitState } from "../security/validator.js"
import { CONSTANTS, settings } from "../config/index.js"
import { logger } from "../utils/logger.js"

// Placeholder empty SchemaStore for initial state
const EMPTY_SCHEMA = Object.freeze({
  tables: new Map(),
  fkGraph: new Map(),
  piiTables: new Set<string>(),
  dbName: "",
  dialect: "postgres" as const,
  version: "",
  builtAt: 0,
})

// Module-level session store — LRU bounded, max 10 sessions
const connIndex = new Map<string, string>()

const sessionStore = new LRUCache<string, SessionState>({
  maxItems: CONSTANTS.MAX_SESSIONS,
  maxBytes: 10 * 1024 * 1024,
  defaultTTL: settings.MCP_SESSION_TTL_MS,
  onEvict: (id, _session, reason) => {
    logger.info("Session evicted", { sessionId: id, reason })
  },
})

// Per-session rate limit state (kept separate — not in LRU to avoid size issues)
const rateLimits = new Map<string, ReturnType<typeof makeRateLimitState>>()

export function makeConnId(databaseUrl: string): string {
  return createHash("sha256").update(databaseUrl).digest("hex").slice(0, 16)
}

export function getSessionForDatabaseUrl(databaseUrl: string): SessionState | undefined {
  const connId = makeConnId(databaseUrl)
  const sessionId = connIndex.get(connId)
  if (!sessionId) return undefined
  return getSession(sessionId)
}

export function createSession(databaseUrl: string): SessionState {
  const connId = makeConnId(databaseUrl)
  const existingId = connIndex.get(connId)
  if (existingId) {
    const existing = sessionStore.get(existingId)
    if (existing && existing.status === "ready" && Date.now() <= existing.expiresAt) {
      existing.lastUsedAt = Date.now()
      return existing
    }
  }

  const id = randomUUID()
  const now = Date.now()

  const session: SessionState = {
    id,
    connId,
    status: "pending",
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + settings.MCP_SESSION_TTL_MS,
    schema: EMPTY_SCHEMA,
    aliases: makeAliasStore(),
    cache: {
      query: new LRUCache({
        maxItems: 500,
        maxBytes: CONSTANTS.QUERY_CACHE_MAX_BYTES,
        defaultTTL: CONSTANTS.QUERY_CACHE_TTL_MS,
      }),
      embed: new LRUCache({
        maxItems: 500,
        maxBytes: 20 * 1024 * 1024,
        defaultTTL: 0,
        sizeOf: (v) => v.length * 8,
      }),
    },
    history: new RingBuffer(CONSTANTS.HISTORY_RING_SIZE),
    activePipeline: null,
    stats: {
      totalQueries: 0,
      cacheHits: 0,
      totalRows: 0,
      avgDurationMs: 0,
      errorCount: 0,
    },
  }

  sessionStore.set(id, session)
  rateLimits.set(id, makeRateLimitState())
  connIndex.set(connId, id)
  logger.info("Session created", { sessionId: id, connId })
  return session
}

export function getSession(id: string): SessionState | undefined {
  const session = sessionStore.get(id)
  if (!session) return undefined

  // Check TTL manually too
  if (Date.now() > session.expiresAt) {
    connIndex.delete(session.connId)
    sessionStore.delete(id)
    rateLimits.delete(id)
    return undefined
  }

  session.lastUsedAt = Date.now()
  return session
}

export function updateSessionStatus(id: string, status: SessionStatus, error?: string): void {
  const session = sessionStore.get(id)
  if (!session) return
  session.status = status
  if (error) session.error = error
}

export function getRateLimit(sessionId: string) {
  return rateLimits.get(sessionId) ?? makeRateLimitState()
}

export function destroySession(id: string): void {
  const session = sessionStore.get(id)
  if (session) connIndex.delete(session.connId)
  sessionStore.delete(id)
  rateLimits.delete(id)
  logger.info("Session destroyed", { sessionId: id })
}

export function getSessionStats() {
  return sessionStore.stats()
}

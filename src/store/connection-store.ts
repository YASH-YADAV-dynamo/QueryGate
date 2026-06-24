import { encryptSecret, decryptSecret } from "../crypto/encrypt.js"
import {
  signUrlToken,
  verifyUrlToken,
  verifyConnectionToken,
  getTokenTtlMs,
} from "../auth/jwt.js"
import { makeConnId } from "../session/manager.js"
import { normalizeDatabaseUrl } from "../db/connector.js"
import { getPrisma } from "./prisma.js"
import { logger } from "../utils/logger.js"

/**
 * JWT_SECRET is the only hard requirement.
 * QUERYGATE_STORE_URL + ENCRYPTION_KEY are optional (enable Prisma audit/revocation).
 */
export function isConnectionStoreEnabled(): boolean {
  return Boolean(process.env.JWT_SECRET)
}

function hasPrismaStore(): boolean {
  return Boolean(process.env.QUERYGATE_STORE_URL && process.env.ENCRYPTION_KEY)
}

export interface StoredConnection {
  connectionId: string
  accessToken: string
}

/**
 * Issue a self-contained JWT that carries the normalized DB URL.
 * Optionally also persists in Prisma for audit/revocation (best-effort — never throws).
 */
export async function createStoredConnection(databaseUrl: string): Promise<StoredConnection> {
  const normalized = normalizeDatabaseUrl(databaseUrl)
  const connId = makeConnId(normalized)

  // Always create a self-contained JWT — no Prisma required on any future tool call.
  const accessToken = await signUrlToken(normalized)

  // Persist in Prisma for audit/revocation — best-effort, never blocks the response.
  if (hasPrismaStore()) {
    try {
      const prisma = getPrisma()
      const expiresAt = new Date(Date.now() + getTokenTtlMs())

      const existing = await prisma.connection.findFirst({
        where: { connId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      })

      const connectionId = existing
        ? existing.id
        : (
            await prisma.connection.create({
              data: { encryptedUrl: encryptSecret(normalized), connId, expiresAt },
            })
          ).id

      logger.info("Connection stored/reused in Prisma", { connectionId, connId })
      return { connectionId, accessToken }
    } catch (err) {
      logger.warn("Prisma store unavailable — token is self-contained, continuing without audit", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { connectionId: connId, accessToken }
}

/**
 * Resolve DB URL from an access token.
 *
 * Priority:
 *  1. Self-contained token (eu/u claim) — fast, no Prisma.
 *  2. Legacy {cid} token — Prisma lookup + decrypt (backward compat).
 */
export async function resolveDatabaseUrlFromToken(accessToken: string): Promise<string> {
  // Fast path — self-contained token (new format)
  const fromToken = await verifyUrlToken(accessToken)
  if (fromToken) return fromToken

  // Slow path — legacy {cid} token that needs Prisma
  if (!hasPrismaStore()) {
    throw new Error(
      "Legacy token (connection ID only) requires QUERYGATE_STORE_URL, which is not set. " +
        "Call connect again with database_url to get a new self-contained token.",
    )
  }

  const { cid } = await verifyConnectionToken(accessToken)
  const prisma = getPrisma()
  const row = await prisma.connection.findUnique({ where: { id: cid } })

  if (!row) throw new Error("Connection not found. Call connect again with database_url.")
  if (row.revokedAt) throw new Error("Connection revoked. Call connect again with database_url.")
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Error("Connection expired. Call connect again with database_url.")
  }

  return decryptSecret(row.encryptedUrl)
}

export async function revokeConnection(connectionId: string): Promise<boolean> {
  if (!hasPrismaStore()) return false
  try {
    const prisma = getPrisma()
    const row = await prisma.connection.findUnique({ where: { id: connectionId } })
    if (!row || row.revokedAt) return false
    await prisma.connection.update({
      where: { id: connectionId },
      data: { revokedAt: new Date() },
    })
    logger.info("Connection revoked", { connectionId })
    return true
  } catch {
    return false
  }
}

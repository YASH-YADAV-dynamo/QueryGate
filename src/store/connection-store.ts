import { encryptSecret, decryptSecret } from "../crypto/encrypt.js"
import { signConnectionToken, verifyConnectionToken, getTokenTtlMs } from "../auth/jwt.js"
import { makeConnId } from "../session/manager.js"
import { getPrisma } from "./prisma.js"
import { logger } from "../utils/logger.js"

export function isConnectionStoreEnabled(): boolean {
  return Boolean(
    process.env.QUERYGATE_STORE_URL &&
      process.env.JWT_SECRET &&
      process.env.ENCRYPTION_KEY,
  )
}

export interface StoredConnection {
  connectionId: string
  accessToken: string
}

/** Encrypt URL, persist in Postgres, return signed JWT. Reuses active row for same DB URL. */
export async function createStoredConnection(databaseUrl: string): Promise<StoredConnection> {
  const prisma = getPrisma()
  const connId = makeConnId(databaseUrl)
  const expiresAt = new Date(Date.now() + getTokenTtlMs())

  const existing = await prisma.connection.findFirst({
    where: { connId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    const accessToken = await signConnectionToken(existing.id)
    logger.info("Connection reused", { connectionId: existing.id, connId })
    return { connectionId: existing.id, accessToken }
  }

  const encryptedUrl = encryptSecret(databaseUrl)
  const row = await prisma.connection.create({
    data: { encryptedUrl, connId, expiresAt },
  })

  const accessToken = await signConnectionToken(row.id)
  logger.info("Connection stored", { connectionId: row.id, connId })

  return { connectionId: row.id, accessToken }
}

/** Verify JWT → lookup connection → decrypt URL. */
export async function resolveDatabaseUrlFromToken(accessToken: string): Promise<string> {
  const { cid } = await verifyConnectionToken(accessToken)
  const prisma = getPrisma()
  const row = await prisma.connection.findUnique({ where: { id: cid } })

  if (!row) {
    throw new Error("Connection not found. Call connect again with database_url.")
  }
  if (row.revokedAt) {
    throw new Error("Connection revoked. Call connect again with database_url.")
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Error("Connection expired. Call connect again with database_url.")
  }

  return decryptSecret(row.encryptedUrl)
}

export async function revokeConnection(connectionId: string): Promise<boolean> {
  const prisma = getPrisma()
  const row = await prisma.connection.findUnique({ where: { id: connectionId } })
  if (!row || row.revokedAt) return false
  await prisma.connection.update({
    where: { id: connectionId },
    data: { revokedAt: new Date() },
  })
  logger.info("Connection revoked", { connectionId })
  return true
}

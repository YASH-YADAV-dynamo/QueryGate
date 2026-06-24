import { PrismaClient } from "@prisma/client"
import { ensureQuerygateStoreUrl } from "../config/postgres-url.js"

const globalForPrisma = globalThis as unknown as { querygatePrisma?: PrismaClient }

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.querygatePrisma) {
    ensureQuerygateStoreUrl()
    globalForPrisma.querygatePrisma = new PrismaClient()
  }
  return globalForPrisma.querygatePrisma
}

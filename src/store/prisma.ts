import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { querygatePrisma?: PrismaClient }

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.querygatePrisma) {
    globalForPrisma.querygatePrisma = new PrismaClient()
  }
  return globalForPrisma.querygatePrisma
}

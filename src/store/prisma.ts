import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { querygatePrisma?: PrismaClient }

/** Strip params that break pgbouncer/Neon pooler (channel_binding, etc.) from a Postgres URL. */
function normalizeStoreUrl(url: string): string {
  return url
    .trim()
    .replace(/([?&])channel_binding=[^&]*&?/g, "$1")
    .replace(/[?&]$/, "")
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.querygatePrisma) {
    // Normalize the store URL before Prisma reads it — strips channel_binding that breaks Neon pooler.
    const raw = process.env.QUERYGATE_STORE_URL
    if (raw) {
      process.env.QUERYGATE_STORE_URL = normalizeStoreUrl(raw)
    }
    globalForPrisma.querygatePrisma = new PrismaClient()
  }
  return globalForPrisma.querygatePrisma
}

#!/usr/bin/env node
/**
 * Generate Prisma client and push schema to QUERYGATE_STORE_URL.
 * Loads .env from project root (same as local dev + Vercel build).
 */
import { config } from "dotenv"
import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { ensureQuerygateStoreUrl } from "./resolve-postgres-env.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = resolve(root, ".env")
if (existsSync(envPath)) config({ path: envPath })

ensureQuerygateStoreUrl()

if (!process.env.QUERYGATE_STORE_URL) {
  console.warn("[db:setup] QUERYGATE_STORE_URL not set — skipping prisma db push")
  console.warn("[db:setup] Copy .env.example → .env and set your Neon metadata DB URL")
  process.exit(0)
}

function runPrisma(...args) {
  const prismaCli = resolve(root, "node_modules", "prisma", "build", "index.js")
  const r = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log("[db:setup] prisma generate…")
runPrisma("generate")

console.log("[db:setup] prisma db push…")
runPrisma("db", "push", "--skip-generate")

console.log("[db:setup] done — connections table ready")

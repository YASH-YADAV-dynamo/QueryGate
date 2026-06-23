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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = resolve(root, ".env")
if (existsSync(envPath)) config({ path: envPath })

if (!process.env.QUERYGATE_STORE_URL) {
  console.warn("[db:setup] QUERYGATE_STORE_URL not set — skipping prisma db push")
  console.warn("[db:setup] Copy .env.example → .env and set your Neon metadata DB URL")
  process.exit(0)
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log("[db:setup] prisma generate…")
run("npx", ["prisma", "generate"])

console.log("[db:setup] prisma db push…")
run("npx", ["prisma", "db push", "--skip-generate"])

console.log("[db:setup] done — connections table ready")

#!/usr/bin/env node
/** Vercel build: generate client, push schema (if QUERYGATE_STORE_URL set), compile. */
import { config } from "dotenv"
import { existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = resolve(root, ".env")
if (existsSync(envPath)) config({ path: envPath })

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32" })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log("[vercel-build] prisma generate…")
run("npx", ["prisma", "generate"])

if (process.env.QUERYGATE_STORE_URL) {
  console.log("[vercel-build] prisma db push (metadata store)…")
  run("npx", ["prisma", "db push", "--skip-generate"])
} else {
  console.warn("[vercel-build] QUERYGATE_STORE_URL not set — skipping db push (JWT store disabled)")
}

console.log("[vercel-build] tsc…")
run("npx", ["tsc"])

console.log("[vercel-build] done")

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

function runPrisma(...args) {
  const prismaCli = resolve(root, "node_modules", "prisma", "build", "index.js")
  const r = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, env: process.env })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log("[vercel-build] prisma generate…")
runPrisma("generate")

if (process.env.QUERYGATE_STORE_URL) {
  console.log("[vercel-build] prisma db push (metadata store)…")
  runPrisma("db", "push", "--skip-generate")
} else {
  console.warn("[vercel-build] QUERYGATE_STORE_URL not set — skipping db push (JWT store disabled)")
}

console.log("[vercel-build] tsc…")
const tscBin = resolve(root, "node_modules", "typescript", "bin", "tsc")
run(process.execPath, [tscBin])

console.log("[vercel-build] done")

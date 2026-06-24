import { config } from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { ensureQuerygateStoreUrl } from "../dist/config/postgres-url.js"

const envPath = resolve(process.cwd(), ".env")
if (existsSync(envPath)) {
  config({ path: envPath })
}

ensureQuerygateStoreUrl()

import { randomUUID } from "node:crypto"
import { createSession, getSession, updateSessionStatus } from "../../src/session/manager.js"
import { buildMockSchema } from "./fixtures.js"
import type { SessionState } from "../../src/db/types.js"

const TEST_DB_URL = "postgres://test:test@localhost:5432/testdb"

/** Create a session with mock schema loaded and status `ready`. */
export function createReadySession(overrides?: {
  schema?: ReturnType<typeof buildMockSchema>
}): SessionState {
  // Unique URL per test so connId session reuse does not leak state between tests
  const session = createSession(`${TEST_DB_URL}?_test=${randomUUID()}`)
  const live = getSession(session.id)!
  live.schema = overrides?.schema ?? buildMockSchema()
  updateSessionStatus(session.id, "ready")
  return getSession(session.id)!
}

export { TEST_DB_URL }

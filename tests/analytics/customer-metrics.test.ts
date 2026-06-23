import { describe, expect, test } from "bun:test"
import type { SchemaStore, TableMeta } from "../../src/db/types.js"
import { buildCustomerAnalyticsDashboard } from "../../src/analytics/customer-metrics.js"
import { createSession, updateSessionStatus } from "../../src/session/manager.js"

function makeTable(name: string, schema = "public"): TableMeta {
  return {
    schema,
    name,
    fullyQualified: `${schema}.${name}`,
    rowEstimate: 1000,
    columns: [
      {
        name: "id",
        dataType: "integer",
        nullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        references: null,
        piiRisk: "none",
        sampleValues: [],
      },
      {
        name: "created_at",
        dataType: "timestamp",
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        references: null,
        piiRisk: "none",
        sampleValues: [],
      },
      {
        name: "status",
        dataType: "text",
        nullable: true,
        isPrimaryKey: false,
        isForeignKey: false,
        references: null,
        piiRisk: "none",
        sampleValues: [],
      },
    ],
    indexes: [],
    embedding: [],
    embeddingText: "",
    ingestedAt: Date.now(),
  }
}

function makeSchema(tables: TableMeta[]): SchemaStore {
  const map = new Map(tables.map((t) => [t.fullyQualified, t]))
  return {
    tables: map,
    fkGraph: new Map(),
    piiTables: new Set(),
    dbName: "testdb",
    dialect: "postgres",
    version: "PostgreSQL 16",
    builtAt: Date.now(),
  }
}

describe("customer analytics", () => {
  test("returns fallback text when no customer table exists", async () => {
    const session = createSession(`postgres://ca-test-${Date.now()}@localhost:5432/x`)
    session.schema = makeSchema([
      makeTable("inventory"),
      makeTable("products"),
    ])
    updateSessionStatus(session.id, "ready")

    const dashboard = await buildCustomerAnalyticsDashboard(session)
    expect(dashboard.error).toContain("No customer-like table")
    expect(dashboard.textSummary).toContain("Customer Analytics")
    expect(dashboard.kpis).toHaveLength(0)
  })

  test("prefers customers table over users", async () => {
    const session = createSession(`postgres://ca-pick-${Date.now()}@localhost:5432/x`)
    session.schema = makeSchema([makeTable("users"), makeTable("customers")])
    updateSessionStatus(session.id, "ready")

    const dashboard = await buildCustomerAnalyticsDashboard(session)
    expect(dashboard.customerTable).toBe("public.customers")
  })
})

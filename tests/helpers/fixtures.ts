import type { ColumnMeta, SchemaStore, TableMeta } from "../../src/db/types.js"

function column(partial: Partial<ColumnMeta> & Pick<ColumnMeta, "name" | "dataType">): ColumnMeta {
  return {
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    references: null,
    piiRisk: "none",
    sampleValues: [],
    ...partial,
  }
}

function table(partial: Partial<TableMeta> & Pick<TableMeta, "name" | "fullyQualified">): TableMeta {
  return {
    schema: "public",
    rowEstimate: 100,
    columns: [],
    indexes: [],
    embedding: [],
    embeddingText: "",
    ingestedAt: Date.now(),
    ...partial,
  }
}

export function buildMockSchema(overrides: Partial<SchemaStore> = {}): SchemaStore {
  const users = table({
    name: "users",
    fullyQualified: "public.users",
    rowEstimate: 1200,
    columns: [
      column({ name: "id", dataType: "integer", isPrimaryKey: true, nullable: false }),
      column({ name: "email", dataType: "varchar", piiRisk: "high" }),
      column({ name: "name", dataType: "varchar", sampleValues: ["Alice", "Bob"] }),
    ],
    indexes: [{ name: "users_pkey", columns: ["id"] }],
  })

  const orders = table({
    name: "orders",
    fullyQualified: "public.orders",
    rowEstimate: 5400,
    columns: [
      column({ name: "id", dataType: "integer", isPrimaryKey: true, nullable: false }),
      column({
        name: "user_id",
        dataType: "integer",
        isForeignKey: true,
        references: { table: "users", column: "id" },
      }),
      column({ name: "total", dataType: "numeric" }),
      column({ name: "created_at", dataType: "timestamptz" }),
    ],
  })

  const tables = new Map<string, TableMeta>([
    [users.fullyQualified, users],
    [orders.fullyQualified, orders],
  ])

  const fkGraph = new Map<string, string[]>([
    ["public.orders", ["public.users"]],
    ["public.users", ["public.orders"]],
  ])

  const piiTables = new Set<string>(["public.users"])

  return {
    tables,
    fkGraph,
    piiTables,
    dbName: "testdb",
    dialect: "postgres",
    version: "PostgreSQL 16.2",
    builtAt: 1_700_000_000_000,
    ...overrides,
  }
}

export function buildValidationSchema(): SchemaStore {
  return buildMockSchema()
}

import type { SchemaStore, TableMeta } from "../db/types.js"
import { executeSqlPipeline } from "../tools/execute-sql.pipeline.js"
import type { SessionState } from "../db/types.js"

export interface CustomerAnalyticsKpi {
  label: string
  value: string
  hint?: string
  trend?: "up" | "down" | "flat"
}

export interface CustomerAnalyticsSegment {
  name: string
  count: number
}

export interface CustomerAnalyticsGrowthPoint {
  period: string
  count: number
}

export interface CustomerAnalyticsRow {
  id: string
  joined: string
  segment: string
}

export interface CustomerAnalyticsDashboard {
  title: string
  generatedAt: string
  database: string
  customerTable: string | null
  kpis: CustomerAnalyticsKpi[]
  segments: CustomerAnalyticsSegment[]
  growth: CustomerAnalyticsGrowthPoint[]
  recentCustomers: CustomerAnalyticsRow[]
  textSummary: string
  error?: string
}

const CUSTOMER_NAME_SCORE: Record<string, number> = {
  customers: 100,
  customer: 95,
  clients: 90,
  client: 88,
  members: 85,
  member: 83,
  accounts: 80,
  account: 78,
  users: 70,
  user: 68,
}

function scoreCustomerTable(table: TableMeta): number {
  const base = table.name.toLowerCase()
  let score = CUSTOMER_NAME_SCORE[base] ?? 0
  if (/customer|client|member/.test(base)) score += 10
  if (score === 0) return 0
  if (table.rowEstimate > 0) score += Math.min(20, Math.log10(table.rowEstimate + 1) * 5)
  return score
}

function pickCustomerTable(schema: SchemaStore): TableMeta | undefined {
  return Array.from(schema.tables.values())
    .filter((t) => scoreCustomerTable(t) > 0)
    .sort((a, b) => scoreCustomerTable(b) - scoreCustomerTable(a))[0]
}

function pickColumn(table: TableMeta, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const col = table.columns.find((c) => pattern.test(c.name))
    if (col) return col.name
  }
  return undefined
}

function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteFqn(table: TableMeta): string {
  return `${quoteId(table.schema)}.${quoteId(table.name)}`
}

async function runCount(
  session: SessionState,
  sql: string,
): Promise<number | null> {
  try {
    const result = await executeSqlPipeline(sql, session.id, session)
    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) return null
    const val = Object.values(row)[0]
    return typeof val === "number" ? val : Number(val)
  } catch {
    return null
  }
}

function formatNumber(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : "—"
}

function buildTextSummary(data: CustomerAnalyticsDashboard): string {
  const lines = [
    "=== Customer Analytics ===",
    `Database: ${data.database}`,
    data.customerTable ? `Source table: ${data.customerTable}` : "No customer table detected",
    "",
  ]

  for (const kpi of data.kpis) {
    lines.push(`${kpi.label}: ${kpi.value}${kpi.hint ? ` (${kpi.hint})` : ""}`)
  }

  if (data.segments.length > 0) {
    lines.push("", "Segments:")
    for (const s of data.segments.slice(0, 8)) {
      lines.push(`  ${s.name}: ${formatNumber(s.count)}`)
    }
  }

  if (data.growth.length > 0) {
    lines.push("", "Monthly signups:")
    for (const g of data.growth) {
      lines.push(`  ${g.period}: ${formatNumber(g.count)}`)
    }
  }

  if (data.recentCustomers.length > 0) {
    lines.push("", "Recent customers:")
    for (const r of data.recentCustomers.slice(0, 5)) {
      lines.push(`  #${r.id} · ${r.joined} · ${r.segment}`)
    }
  }

  if (data.error) lines.push("", `Note: ${data.error}`)

  return lines.join("\n")
}

export async function buildCustomerAnalyticsDashboard(
  session: SessionState,
): Promise<CustomerAnalyticsDashboard> {
  const schema = session.schema
  const table = pickCustomerTable(schema)

  const empty: CustomerAnalyticsDashboard = {
    title: "Customer Analytics",
    generatedAt: new Date().toISOString(),
    database: schema.dbName,
    customerTable: null,
    kpis: [],
    segments: [],
    growth: [],
    recentCustomers: [],
    textSummary: "",
    error: "No customer-like table found (customers, users, clients, members, accounts).",
  }

  if (!table) {
    empty.textSummary = buildTextSummary(empty)
    return empty
  }

  const fqn = quoteFqn(table)
  const createdCol = pickColumn(table, [
    /^created_at$/i,
    /^signup_at$/i,
    /^registered_at$/i,
    /^joined_at$/i,
    /created/i,
    /signup/i,
  ])
  const statusCol = pickColumn(table, [/^status$/i, /^tier$/i, /^plan$/i, /^state$/i, /status/i])
  const pkCol =
    table.columns.find((c) => c.isPrimaryKey)?.name ??
    table.columns.find((c) => /^id$/i.test(c.name))?.name ??
    table.columns[0]?.name

  if (!pkCol) {
    empty.customerTable = table.fullyQualified
    empty.error = `Could not identify a primary key on ${table.fullyQualified}.`
    empty.textSummary = buildTextSummary(empty)
    return empty
  }

  const total = (await runCount(session, `SELECT COUNT(*) AS c FROM ${fqn}`)) ?? 0
  const new30 = createdCol
    ? ((await runCount(
        session,
        `SELECT COUNT(*) AS c FROM ${fqn} WHERE ${quoteId(createdCol)} >= NOW() - INTERVAL '30 days'`,
      )) ?? 0)
    : null
  const new7 = createdCol
    ? ((await runCount(
        session,
        `SELECT COUNT(*) AS c FROM ${fqn} WHERE ${quoteId(createdCol)} >= NOW() - INTERVAL '7 days'`,
      )) ?? 0)
    : null

  const kpis: CustomerAnalyticsKpi[] = [
    { label: "Total customers", value: formatNumber(total) },
  ]
  if (new30 !== null) {
    const kpi: CustomerAnalyticsKpi = {
      label: "New (30 days)",
      value: formatNumber(new30),
      trend: new30 > 0 ? "up" : "flat",
    }
    if (total > 0) kpi.hint = `${((new30 / total) * 100).toFixed(1)}% of base`
    kpis.push(kpi)
  }
  if (new7 !== null) {
    kpis.push({ label: "New (7 days)", value: formatNumber(new7), trend: new7 > 0 ? "up" : "flat" })
  }
  if (createdCol && total > 0) {
    const active90 =
      (await runCount(
        session,
        `SELECT COUNT(*) AS c FROM ${fqn} WHERE ${quoteId(createdCol)} >= NOW() - INTERVAL '90 days'`,
      )) ?? 0
    kpis.push({
      label: "Active cohort (90d)",
      value: formatNumber(active90),
      hint: "joined in last 90 days",
    })
  }

  let segments: CustomerAnalyticsSegment[] = []
  if (statusCol) {
    try {
      const segResult = await executeSqlPipeline(
        `SELECT ${quoteId(statusCol)} AS segment, COUNT(*) AS count FROM ${fqn} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
        session.id,
        session,
      )
      segments = segResult.rows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          name: String(r.segment ?? "Unknown"),
          count: Number(r.count ?? 0),
        }
      })
    } catch {
      segments = []
    }
  }

  let growth: CustomerAnalyticsGrowthPoint[] = []
  if (createdCol) {
    try {
      const growthResult = await executeSqlPipeline(
        `SELECT TO_CHAR(DATE_TRUNC('month', ${quoteId(createdCol)}), 'YYYY-MM') AS period, COUNT(*) AS count FROM ${fqn} WHERE ${quoteId(createdCol)} >= NOW() - INTERVAL '6 months' GROUP BY 1 ORDER BY 1`,
        session.id,
        session,
      )
      growth = growthResult.rows.map((row) => {
        const r = row as Record<string, unknown>
        return { period: String(r.period ?? ""), count: Number(r.count ?? 0) }
      })
    } catch {
      growth = []
    }
  }

  let recentCustomers: CustomerAnalyticsRow[] = []
  if (createdCol) {
    try {
      const selectCols = [quoteId(pkCol), `${quoteId(createdCol)} AS joined`]
      if (statusCol) selectCols.push(`${quoteId(statusCol)} AS segment`)
      const recentResult = await executeSqlPipeline(
        `SELECT ${selectCols.join(", ")} FROM ${fqn} ORDER BY ${quoteId(createdCol)} DESC LIMIT 10`,
        session.id,
        session,
      )
      recentCustomers = recentResult.rows.map((row) => {
        const r = row as Record<string, unknown>
        const joinedRaw = r.joined
        const joined =
          joinedRaw instanceof Date
            ? joinedRaw.toISOString().slice(0, 10)
            : String(joinedRaw ?? "").slice(0, 10)
        return {
          id: String(r[pkCol] ?? r.id ?? "—"),
          joined: joined || "—",
          segment: String(r.segment ?? "—"),
        }
      })
    } catch {
      recentCustomers = []
    }
  }

  const dashboard: CustomerAnalyticsDashboard = {
    title: "Customer Analytics",
    generatedAt: new Date().toISOString(),
    database: schema.dbName,
    customerTable: table.fullyQualified,
    kpis,
    segments,
    growth,
    recentCustomers,
    textSummary: "",
  }
  dashboard.textSummary = buildTextSummary(dashboard)
  return dashboard
}

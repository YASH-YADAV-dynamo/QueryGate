# QueryGate

Read-only PostgreSQL MCP server. Your AI writes SQL — QueryGate validates, runs it safely, and masks PII.

No OpenAI or Anthropic API keys required.

---

## Quick start — pick one

### 1. Hosted (easiest — ChatGPT, no install)

Use the live server at **[querygate.vercel.app](https://querygate.vercel.app/)**.

| Client | Server URL |
|--------|------------|
| **ChatGPT** custom app | `https://querygate.vercel.app/sse` |
| **Cursor / Claude** remote | `https://querygate.vercel.app/mcp` |

In ChatGPT → **Settings → Apps → Create app** → paste the `/sse` URL → **No Auth**.

No database URL needed at app setup. **Recommended flow:**

1. Paste your Postgres URL in chat **once** — the AI calls `connect` with `database_url`
2. QueryGate encrypts the URL in Postgres and returns an **`access_token`** (JWT with connection id only)
3. ChatGPT uses `access_token` on all later tools — **never sends the raw URL again**

```
connect(database_url) → access_token
execute_sql(access_token, sql) → rows
```

Optional: set `Authorization: Bearer <access_token>` in the ChatGPT app headers after the first connect.

QueryGate runs all SQL **on the server** (Neon, Supabase, RDS, etc.). The AI client never connects to Postgres directly.

Copy-paste JSON: [querygate.vercel.app/setup](https://querygate.vercel.app/setup)

---

### 2. Local stdio (Cursor, Claude Desktop, Claude Code)

Clone, build, and point your MCP client at the stdio server with your **local Postgres URL**.

```bash
git clone https://github.com/YASH-YADAV-dynamo/QueryGate.git
cd QueryGate
npm install
npm run build
```

Add to your MCP config (`~/.cursor/mcp.json`, Claude Desktop config, etc.):

```json
{
  "mcpServers": {
    "querygate": {
      "command": "node",
      "args": ["C:\\path\\to\\QueryGate\\dist\\cli.js", "--stdio"],
      "env": {
        "DATABASE_URL": "postgres://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

Replace the path and `DATABASE_URL` with your values. On Mac/Linux use forward slashes in the path.

**Without `DATABASE_URL` in env:** paste your connection string in chat — the AI calls `connect` with `database_url`.

**Dev mode (Bun, no build):**

```json
"command": "bun",
"args": ["C:/path/to/QueryGate/src/cli.ts", "--stdio"]
```

Restart the client fully after saving.

| Client | Config file |
|--------|-------------|
| Cursor | `~/.cursor/mcp.json` or `.cursor/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) |
| Claude Code | `~/.claude/mcp.json` |

---

### 3. Local HTTP + tunnel (ChatGPT dev, self-hosted)

Run QueryGate on your machine and expose it with HTTPS via [ngrok](https://ngrok.com) (ChatGPT requires HTTPS).

```bash
npm run build
npm run start:http    # listens on http://localhost:3000
```

In another terminal:

```bash
ngrok http 3000
```

Use the ngrok HTTPS URL in ChatGPT:

```
https://YOUR-NGROK-ID.ngrok-free.app/sse
```

Or point Cursor/Claude at `/mcp` on the same tunnel URL.

Optional — pass your DB in headers instead of chat:

```json
{
  "mcpServers": {
    "querygate": {
      "url": "https://YOUR-NGROK-ID.ngrok-free.app/sse",
      "headers": {
        "DATABASE_URL": "postgres://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

---

## Connection string

```
postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

Example (local): `postgres://readonly:secret@localhost:5432/myapp`

Use a **read-only** Postgres user in production.

---

## Tools

| Tool | What it does |
|------|----------------|
| `connect` | Connect once — returns `access_token` + `session_id` |
| `schema_reader` | List tables, columns, foreign keys |
| `execute_sql` | Run a validated SELECT |
| `set_alias` | Map friendly names to table names |
| `insight` | Cache stats and query history |
| `customer_analytics` | Customer dashboard (ChatGPT UI + text fallback) |

Typical flow: `connect` with `database_url` once → use `access_token` on `schema_reader` → `execute_sql` → AI answers.

On **hosted Vercel**, use `access_token` (JWT) — not `session_id` alone. The JWT contains only a connection id; the encrypted URL lives in Postgres.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Prisma generate + compile to `dist/` |
| `npm run db:push` | Create/update metadata tables in Postgres |
| `npm start` | Stdio MCP (local clients) |
| `npm run start:http` | HTTP on port 3000 (`/sse`, `/mcp`) |
| `npm run dev` | HTTP on port **3000** (hot reload) |
| `npm run dev:stdio` | Stdio MCP (for Cursor/Claude subprocess testing) |
| `npm run dev:http` | Same as `npm run dev` |
| `npm test` | Run tests |

---

## Optional env vars

Add to the `env` block in your MCP config:

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_MAX_ROWS` | `500` | Max rows per query |
| `MCP_QUERY_TIMEOUT_MS` | `10000` | Query timeout |
| `MCP_RATE_LIMIT` | `30` | Queries per minute |

---

## Self-host on Vercel

Fork → import on [Vercel](https://vercel.com/new) → set these **server** env vars:

| Variable | Purpose |
|----------|---------|
| `QUERYGATE_STORE_URL` | Postgres for encrypted connection store (Prisma) — use a separate Neon DB |
| `JWT_SECRET` | Signs access tokens (long random string) |
| `ENCRYPTION_KEY` | Encrypts user DB URLs at rest (long random string) |

Then run `npm run db:push` locally against that URL once to create tables (or use Prisma migrate in CI).

Deploy → URLs: `https://YOUR-PROJECT.vercel.app/sse` and `/mcp`.

Without these env vars, hosted mode falls back to passing `DATABASE_URL` header on every request (legacy).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| ChatGPT connector fails | Use `/sse` URL, redeploy latest code, no auth required |
| Server not in client | Fully quit and reopen the MCP client |
| `Session not found` | Use `access_token` from connect, not `session_id` alone. Or set `Authorization: Bearer <token>` header. |
| ChatGPT can't query after connect | After first `connect`, pass `access_token` on every tool call. Server decrypts URL from Postgres — works across Vercel lambdas. |
| Connection store errors | Set `QUERYGATE_STORE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` on Vercel and run `npm run db:push` |
| Connection refused | Check Postgres is running and reachable from the host running QueryGate |

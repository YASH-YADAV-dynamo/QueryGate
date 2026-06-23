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

No database URL needed at setup. **Recommended for ChatGPT:** add a `DATABASE_URL` header in the app settings with your Postgres connection string so every MCP request can reconnect on the server.

Alternatively, paste your connection string in chat — the AI passes it via `connect` / `database_url`:

```
postgres://user:password@host:5432/mydb
```

QueryGate runs all SQL **on the server** using that URL (Neon, Supabase, RDS, etc.). The AI client never connects to Postgres directly.

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
| `connect` | Load schema, return `session_id` |
| `schema_reader` | List tables, columns, foreign keys |
| `execute_sql` | Run a validated SELECT |
| `set_alias` | Map friendly names to table names |
| `insight` | Cache stats and query history |
| `customer_analytics` | Customer dashboard (ChatGPT UI + text fallback) |

Typical flow: `connect` (or set `DATABASE_URL` header) → `schema_reader` → `execute_sql` → AI answers.

On **hosted Vercel**, `session_id` from `connect` may not survive the next request. Pass `DATABASE_URL` as an app header, or include `database_url` on tool calls — the server reconnects automatically.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile to `dist/` |
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

## Self-host on Vercel (optional)

Fork the repo → import on [Vercel](https://vercel.com/new) → deploy. Your URLs become `https://YOUR-PROJECT.vercel.app/sse` and `/mcp`. No server env vars needed — users bring their own database URL.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| ChatGPT connector fails | Use `/sse` URL, redeploy latest code, no auth required |
| Server not in client | Fully quit and reopen the MCP client |
| `Session not found` | On hosted Vercel: add `DATABASE_URL` header to the ChatGPT app, or pass `database_url` on every tool call. `session_id` alone does not persist across serverless requests. |
| ChatGPT can't query after connect | Set **DATABASE_URL** in app headers (recommended) so each request reconnects server-side. Tools run SQL on QueryGate's server using your URL — not in the browser. |
| Connection refused | Check Postgres is running and reachable from the host running QueryGate |

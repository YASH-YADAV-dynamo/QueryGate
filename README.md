# QueryGate

A read-only PostgreSQL MCP server. Your AI client (Cursor, Claude Desktop, Claude Code, ChatGPT) generates SQL — this server validates and executes it safely.

No OpenAI or Anthropic API keys required.

**Live hosted instance:** [querygate.vercel.app](https://querygate.vercel.app/) — no install required. Users paste their Postgres URL in chat; the app passes it as a `DATABASE_URL` header.

| Endpoint | URL | Used by |
|----------|-----|---------|
| **SSE (ChatGPT)** | `https://querygate.vercel.app/sse` | ChatGPT custom app |
| **Streamable HTTP** | `https://querygate.vercel.app/mcp` | Cursor, Claude remote MCP |
| Setup page | [querygate.vercel.app](https://querygate.vercel.app/) | Copy-paste config |
| JSON config | [querygate.vercel.app/setup](https://querygate.vercel.app/setup) | Ready-to-copy JSON |

**Local stdio:** Cursor / Claude Desktop — optional `DATABASE_URL` in `env`, or paste URL in chat.  
**Self-host:** fork and deploy to Vercel, or run `npm run start:http` locally.

---

## How it works

```
User asks a question
       │
       ▼  (AI client — Claude / GPT / Cursor)
Generates SELECT SQL using schema context
       │
       ▼  (this server)
 ┌─────────────────────────────────────┐
 │ 1. LRU cache check                  │
 │ 2. SQL validation (writes/DDL blocked)│
 │ 3. Execute READ ONLY (timeout + cap)  │
 │ 4. PII column masking               │
 │ 5. Cache write                      │
 └─────────────────────────────────────┘
       │
       ▼
  Returns rows as JSON → AI formats the answer
```

---

## Prerequisites

- **Node.js 18+** or **Bun**
- A PostgreSQL database you can connect to with a read-only user (recommended)

---

## 1. Install and build

```bash
git clone https://github.com/YASH-YADAV-dynamo/QueryGate.git
cd QueryGate
npm install
npm run build
```

For development with Bun (no build step):

```bash
bun install
```

---

## Transports

| Mode | Endpoint / command | Used by |
|------|-------------------|---------|
| **stdio** | `npm start` or `querygate --stdio` | Cursor, Claude Desktop, Claude Code |
| **HTTP** | `npm run start:http` → `/sse` + `/mcp` | Local dev, self-hosted |
| **HTTPS** | [querygate.vercel.app/sse](https://querygate.vercel.app/sse) | ChatGPT custom app |
| **HTTPS** | [querygate.vercel.app/mcp](https://querygate.vercel.app/mcp) | Cursor / Claude remote MCP |

Credentials come from `DATABASE_URL` in headers (HTTP/HTTPS), `env` (stdio), or the user pastes their connection string in chat and the AI calls `connect` with `database_url`.

---

## 2. MCP client setup

Use the **hosted endpoint** below — no install required. For local-only use, see [Local stdio](#local-stdio-cursor-claude-desktop).

### Hosted (recommended)

Point any remote MCP client at QueryGate. Every user uses the same URL — only their database credentials differ.

| URL | Purpose |
|-----|---------|
| `https://querygate.vercel.app/sse` | ChatGPT custom app (SSE transport) |
| `https://querygate.vercel.app/mcp` | Cursor / Claude remote (Streamable HTTP) |
| [querygate.vercel.app/setup](https://querygate.vercel.app/setup) | JSON config with the live URL |

**ChatGPT / remote clients:**

```json
{
  "mcpServers": {
    "querygate": {
      "url": "https://querygate.vercel.app/sse",
      "headers": {
        "DATABASE_URL": "postgres://user:password@host:5432/mydb"
      }
    }
  }
}
```

Users can also paste their Postgres URL in chat — the ChatGPT app forwards it as the `DATABASE_URL` header. Or call `connect` with `database_url` after the server starts.

**Cursor / Claude remote (Streamable HTTP):** use `https://querygate.vercel.app/mcp` instead of `/sse`.

For local development, run `npm run start:http` and tunnel with [ngrok](https://ngrok.com): `ngrok http 3000` — ChatGPT requires HTTPS.

---

### Local stdio (Cursor, Claude Desktop)

`DATABASE_URL` in the `env` block is optional — users can paste their connection string in chat and the AI calls `connect` with `database_url`.

```bash
npm run build
npm start          # stdio — default (starts without DATABASE_URL)
# or
npm run start:http # HTTP → /sse (ChatGPT) and /mcp (Streamable HTTP)
```

### Connection string format

```
postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

Example: `postgres://readonly:secret@localhost:5432/myapp`

---

### Local stdio MCP config

**Production (after `npm run build`):**

```json
{
  "mcpServers": {
    "querygate": {
      "command": "node",
      "args": ["/absolute/path/to/querygate/dist/cli.js", "--stdio"],
      "env": {
        "DATABASE_URL": "postgres://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

**Development with Bun (no build step):** change `command` to `"bun"` and point `args` at `src/cli.ts`:

```json
"command": "bun",
"args": ["/absolute/path/to/querygate/src/cli.ts", "--stdio"]
```

On Windows, use escaped backslashes in paths: `"C:\\Users\\YOU\\db-mcp-v2\\dist\\cli.js"`. On macOS/Linux, use forward slashes.

---

### Where to paste it

| Client | Config file |
|--------|-------------|
| **Cursor** (global) | `%USERPROFILE%\.cursor\mcp.json` (Win) · `~/.cursor/mcp.json` (Mac/Linux) |
| **Cursor** (project) | `.cursor/mcp.json` in repo root |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` (Win) · `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) |
| **Claude Code** | `~/.claude/mcp.json` |
| **ChatGPT Desktop** | Settings → Beta → MCP Servers → paste the JSON |
| **ChatGPT custom app** | Settings → Apps → Create app → `https://querygate.vercel.app/sse` + `DATABASE_URL` header |

For Claude Desktop, merge the `mcpServers` block into your existing config file if you already have other settings.

Restart the client after saving. Fully quit and reopen — a reload is not enough.

---

## Deploy your own (optional)

QueryGate is already live at [querygate.vercel.app](https://querygate.vercel.app/). To run your own instance:

1. Fork [github.com/YASH-YADAV-dynamo/QueryGate](https://github.com/YASH-YADAV-dynamo/QueryGate).
2. Import the project in [Vercel](https://vercel.com/new).
3. Use default settings — `vercel.json` handles the rest:
   - `npm run build` compiles TypeScript
   - `public/` satisfies static output
   - `/sse`, `/messages`, and `/mcp` route to serverless MCP handlers
4. Your ChatGPT URL will be `https://YOUR-PROJECT.vercel.app/sse`; Streamable HTTP at `/mcp`.

No `DATABASE_URL` env var needed on Vercel — each user passes it in the MCP client `headers` block.

---

## 3. Verify it works

1. Add the config above to your MCP client (see [Where to paste it](#where-to-paste-it)).
2. Restart the client (fully quit and reopen).
3. Open a new chat and ask the AI to call the `connect` tool.
4. You should see your database name, table list, and a `session_id`.
5. Ask a question like *"how many rows are in the users table?"* — the AI should call `schema_reader`, generate a SELECT, then call `execute_sql`.

If `connect` fails, the database URL is missing. For hosted clients, add `DATABASE_URL` to headers or paste the URL in chat. For stdio, add it to `env` or pass `database_url` to the `connect` tool.

---

## Tools

| Tool            | Description                              | Hits DB? |
|-----------------|------------------------------------------|----------|
| `connect`       | Load schema into memory, return session  | Once     |
| `execute_sql`   | Validate and run a SELECT query        | Per call |
| `schema_reader` | Browse tables, columns, foreign keys     | Never    |
| `set_alias`     | Map friendly names → real table names    | Never    |
| `insight`       | Cache stats, query history, PII report   | Never    |

### Typical flow

1. AI calls **`connect`** → gets `session_id`
2. User asks: *"how many orders last week?"*
3. AI calls **`schema_reader`** → finds `orders.created_at`
4. AI calls **`execute_sql`** with `SELECT COUNT(*) FROM orders WHERE …`
5. AI answers using the returned rows

---

## Optional settings

Add these to the `env` block in your MCP config:

| Variable               | Default   | Description                |
|------------------------|-----------|----------------------------|
| `MCP_SESSION_TTL_MS`   | `7200000` | Session lifetime (ms)      |
| `MCP_MAX_ROWS`         | `500`     | Max rows per query         |
| `MCP_QUERY_TIMEOUT_MS` | `10000`   | Query timeout (ms)         |
| `MCP_RATE_LIMIT`       | `30`      | Queries per minute/session |

---

## Security

- `DATABASE_URL` is injected by the MCP client at startup — never transmitted in tool arguments
- Every query runs in `BEGIN TRANSACTION READ ONLY`
- Blocklist checks: writes, DDL, `pg_catalog`, stacked queries, comment injection, UNION attacks, unknown tables
- PII columns (email, phone, SSN, etc.) are masked in results
- 30 queries/minute rate limit per session
- Results capped at 500 rows

Use a **read-only** PostgreSQL role in production:

```sql
CREATE ROLE mcp_readonly LOGIN PASSWORD 'strong-password';
GRANT CONNECT ON DATABASE mydb TO mcp_readonly;
GRANT USAGE ON SCHEMA public TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_readonly;
```

---

## Scripts

| Command             | Description                          |
|---------------------|--------------------------------------|
| `npm run build`     | Compile TypeScript → `dist/`         |
| `npm start`         | Run stdio transport (local MCP)      |
| `npm run start:http`| Run HTTP server on port 3000         |
| `npm run dev`       | Stdio with Bun watch mode            |
| `npm run dev:http`  | HTTP with Bun watch mode             |
| `npm test`          | Run test suite                       |
| `npm run typecheck` | Type-check without emit              |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server not listed in client | Restart the client after editing `mcp.json` |
| `Config error: DATABASE_URL` | Add `DATABASE_URL` to headers (remote), `env` (stdio), or call `connect` with `database_url` |
| `Session not found` | Call `connect` first; sessions expire after 2 hours by default |
| `Table not found in schema` | Call `schema_reader` — the AI may have hallucinated a table name |
| Connection refused | Check host, port, firewall, and that PostgreSQL accepts connections |

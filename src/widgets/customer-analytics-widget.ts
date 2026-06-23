export const CUSTOMER_ANALYTICS_WIDGET_URI = "ui://widget/customer-analytics.html"

/** Self-contained ChatGPT widget — dark card dashboard with text fallback. */
export const CUSTOMER_ANALYTICS_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root {
    --bg: #0c0e14;
    --bg-elevated: #13161f;
    --card: #181c27;
    --card-hover: #1e2330;
    --border: rgba(255, 255, 255, 0.08);
    --border-strong: rgba(255, 255, 255, 0.12);
    --text: #f1f5f9;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --accent: #6366f1;
    --accent-soft: rgba(99, 102, 241, 0.15);
    --accent-glow: rgba(99, 102, 241, 0.35);
    --success: #34d399;
    --radius-sm: 10px;
    --radius-md: 14px;
    --radius-lg: 18px;
    --space-xs: 8px;
    --space-sm: 12px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
    --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.35);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: var(--space-lg);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .fallback {
    display: none;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    font-size: 13px;
    white-space: pre-wrap;
    line-height: 1.6;
    color: var(--text-muted);
    box-shadow: var(--shadow-card);
  }
  .fallback.visible { display: block; }

  .dash { display: none; max-width: 960px; margin: 0 auto; }
  .dash.visible { display: block; }

  /* ── Header card ── */
  .header {
    background: linear-gradient(145deg, #1a1f2e 0%, #12151c 100%);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    padding: var(--space-lg) var(--space-xl);
    margin-bottom: var(--space-lg);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-md);
    box-shadow: var(--shadow);
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), #818cf8, #a78bfa);
  }
  .header-text { flex: 1; min-width: 0; }
  .header h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
    margin-bottom: 6px;
  }
  .header p {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }
  .expand-btn {
    flex-shrink: 0;
    background: var(--accent-soft);
    border: 1px solid rgba(99, 102, 241, 0.35);
    color: #c7d2fe;
    border-radius: var(--radius-sm);
    padding: 10px 16px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .expand-btn:hover {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.5);
  }

  /* ── KPI cards ── */
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .kpi {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-lg) var(--space-md);
    box-shadow: var(--shadow-card);
    transition: border-color 0.15s, transform 0.15s;
  }
  .kpi:hover {
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }
  .kpi-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: var(--space-sm);
  }
  .kpi-value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text);
    line-height: 1.1;
  }
  .kpi-hint {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: var(--space-xs);
    padding-top: var(--space-xs);
    border-top: 1px solid var(--border);
  }

  /* ── Two-column grid ── */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }
  @media (max-width: 640px) {
    body { padding: var(--space-md); }
    .grid-2 { grid-template-columns: 1fr; }
    .header { padding: var(--space-md); flex-direction: column; }
    .kpi-value { font-size: 24px; }
  }

  /* ── Panel cards ── */
  .panel {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    box-shadow: var(--shadow-card);
    min-height: 180px;
  }
  .panel-full { margin-bottom: var(--space-lg); }
  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border);
  }
  .panel-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
  }
  .panel h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .empty-msg {
    font-size: 13px;
    color: var(--text-dim);
    padding: var(--space-md) 0;
    text-align: center;
  }

  /* ── Segment bars ── */
  .bar-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }
  .bar-row:last-child { margin-bottom: 0; }
  .bar-label {
    width: 80px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .bar-track {
    flex: 1;
    height: 10px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #818cf8);
    border-radius: 999px;
    box-shadow: 0 0 12px var(--accent-glow);
    transition: width 0.4s ease;
  }
  .bar-val {
    width: 44px;
    flex-shrink: 0;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  /* ── Growth chart ── */
  .growth-wrap {
    padding: var(--space-sm) 0 var(--space-xs);
  }
  .growth-bars {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-xs);
    height: 120px;
    padding: var(--space-md) var(--space-xs) 0;
  }
  .growth-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    min-width: 0;
  }
  .growth-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(180deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%);
    border-radius: 6px 6px 2px 2px;
    min-height: 6px;
    box-shadow: 0 -2px 12px var(--accent-glow);
    transition: height 0.4s ease;
  }
  .growth-label {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-dim);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    padding-top: 4px;
  }

  /* ── Table ── */
  .table-wrap { overflow-x: auto; margin: 0 calc(var(--space-sm) * -1); }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 13px;
  }
  thead th {
    text-align: left;
    padding: var(--space-sm) var(--space-md);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid var(--border);
  }
  thead th:first-child { border-radius: var(--radius-sm) 0 0 0; }
  thead th:last-child { border-radius: 0 var(--radius-sm) 0 0; }
  tbody td {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td {
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
  }
  tbody td:first-child {
    color: var(--text);
    font-weight: 500;
  }
  .segment-pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    background: var(--accent-soft);
    color: #c7d2fe;
    border: 1px solid rgba(99, 102, 241, 0.25);
  }
</style>
</head>
<body>
  <div id="fallback" class="fallback"></div>
  <div id="dash" class="dash">
    <div class="header">
      <div class="header-text">
        <h1 id="title">Customer Analytics</h1>
        <p id="subtitle"></p>
      </div>
      <button class="expand-btn" id="expand">Expand</button>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><span class="panel-dot"></span><h2>Segments</h2></div>
        <div id="segments"></div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-dot"></span><h2>Monthly signups</h2></div>
        <div class="growth-wrap"><div class="growth-bars" id="growth"></div></div>
      </div>
    </div>
    <div class="panel panel-full">
      <div class="panel-header"><span class="panel-dot"></span><h2>Recent customers</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Joined</th><th>Segment</th></tr></thead>
          <tbody id="recent"></tbody>
        </table>
      </div>
    </div>
  </div>
<script>
(function () {
  function getData() {
    return window.openai?.toolOutput ?? window.openai?.structuredContent ?? null;
  }

  function fmt(n) {
    return typeof n === "number" ? n.toLocaleString() : String(n ?? "—");
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(data) {
    var fallback = document.getElementById("fallback");
    var dash = document.getElementById("dash");
    if (!data || data.error && !data.kpis?.length) {
      fallback.textContent = data?.textSummary || data?.error || "Customer analytics unavailable. See chat for details.";
      fallback.classList.add("visible");
      dash.classList.remove("visible");
      return;
    }
    fallback.classList.remove("visible");
    dash.classList.add("visible");

    document.getElementById("title").textContent = data.title || "Customer Analytics";
    document.getElementById("subtitle").textContent =
      (data.database || "") + (data.customerTable ? " · " + data.customerTable : "");

    var kpisEl = document.getElementById("kpis");
    kpisEl.innerHTML = (data.kpis || []).map(function (k) {
      return '<div class="kpi"><div class="kpi-label">' + esc(k.label) + '</div><div class="kpi-value">' + esc(k.value) + '</div>' +
        (k.hint ? '<div class="kpi-hint">' + esc(k.hint) + '</div>' : '') + '</div>';
    }).join("");

    var maxSeg = Math.max.apply(null, (data.segments || []).map(function (s) { return s.count; }).concat([1]));
    document.getElementById("segments").innerHTML = (data.segments || []).map(function (s) {
      var pct = Math.round((s.count / maxSeg) * 100);
      return '<div class="bar-row"><div class="bar-label" title="' + esc(s.name) + '">' + esc(s.name) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div class="bar-val">' + fmt(s.count) + '</div></div>';
    }).join("") || '<p class="empty-msg">No segment column detected</p>';

    var maxG = Math.max.apply(null, (data.growth || []).map(function (g) { return g.count; }).concat([1]));
    document.getElementById("growth").innerHTML = (data.growth || []).map(function (g) {
      var h = Math.max(6, Math.round((g.count / maxG) * 90));
      return '<div class="growth-col"><div class="growth-bar" style="height:' + h + 'px"></div><div class="growth-label">' + esc((g.period || "").slice(5)) + '</div></div>';
    }).join("") || '<p class="empty-msg">No date column for trends</p>';

    document.getElementById("recent").innerHTML = (data.recentCustomers || []).map(function (r) {
      return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.joined) + '</td><td><span class="segment-pill">' + esc(r.segment) + '</span></td></tr>';
    }).join("");
  }

  document.getElementById("expand").onclick = function () {
    window.openai?.requestDisplayMode?.({ mode: "fullscreen" });
  };

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.method === "ui/notifications/tool-result") {
      render(msg.params?.structuredContent ?? msg.params);
    }
  }, { passive: true });

  window.addEventListener("openai:set_globals", function (event) {
    render(event.detail?.globals?.toolOutput ?? getData());
  }, { passive: true });

  render(getData());
})();
</script>
</body>
</html>`.trim()

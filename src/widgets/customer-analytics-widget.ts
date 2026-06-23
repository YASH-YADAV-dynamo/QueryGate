export const CUSTOMER_ANALYTICS_WIDGET_URI = "ui://widget/customer-analytics.html"

/** Self-contained ChatGPT widget — Tableau-style dashboard with text fallback. */
export const CUSTOMER_ANALYTICS_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    background: #f6f8fb;
    color: #1a2332;
    padding: 12px;
  }
  .fallback {
    display: none;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    white-space: pre-wrap;
    line-height: 1.5;
  }
  .fallback.visible { display: block; }
  .dash { display: none; }
  .dash.visible { display: block; }
  .header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
    color: #fff;
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
  .expand-btn {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 12px;
  }
  .kpi {
    background: #fff;
    border-radius: 8px;
    padding: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi-value { font-size: 22px; font-weight: 700; margin-top: 4px; color: #0f172a; }
  .kpi-hint { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }
  @media (max-width: 560px) { .grid-2 { grid-template-columns: 1fr; } }
  .panel {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
  }
  .panel h2 { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #334155; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
  .bar-label { width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #475569; }
  .bar-track { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); border-radius: 4px; }
  .bar-val { width: 40px; text-align: right; font-variant-numeric: tabular-nums; color: #64748b; }
  .growth-bars { display: flex; align-items: flex-end; gap: 6px; height: 100px; padding-top: 8px; }
  .growth-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .growth-bar { width: 100%; background: linear-gradient(180deg, #60a5fa, #2563eb); border-radius: 4px 4px 0 0; min-height: 4px; }
  .growth-label { font-size: 9px; color: #94a3b8; transform: rotate(-35deg); margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  th { color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; }
</style>
</head>
<body>
  <div id="fallback" class="fallback"></div>
  <div id="dash" class="dash">
    <div class="header">
      <div>
        <h1 id="title">Customer Analytics</h1>
        <p id="subtitle"></p>
      </div>
      <button class="expand-btn" id="expand">Expand</button>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="grid-2">
      <div class="panel"><h2>Segments</h2><div id="segments"></div></div>
      <div class="panel"><h2>Monthly signups</h2><div class="growth-bars" id="growth"></div></div>
    </div>
    <div class="panel"><h2>Recent customers</h2><table><thead><tr><th>ID</th><th>Joined</th><th>Segment</th></tr></thead><tbody id="recent"></tbody></table></div>
  </div>
<script>
(function () {
  function getData() {
    return window.openai?.toolOutput ?? window.openai?.structuredContent ?? null;
  }

  function fmt(n) {
    return typeof n === "number" ? n.toLocaleString() : String(n ?? "—");
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
      return '<div class="kpi"><div class="kpi-label">' + k.label + '</div><div class="kpi-value">' + k.value + '</div>' +
        (k.hint ? '<div class="kpi-hint">' + k.hint + '</div>' : '') + '</div>';
    }).join("");

    var maxSeg = Math.max.apply(null, (data.segments || []).map(function (s) { return s.count; }).concat([1]));
    document.getElementById("segments").innerHTML = (data.segments || []).map(function (s) {
      var pct = Math.round((s.count / maxSeg) * 100);
      return '<div class="bar-row"><div class="bar-label">' + s.name + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div class="bar-val">' + fmt(s.count) + '</div></div>';
    }).join("") || '<p style="font-size:12px;color:#94a3b8">No segment column detected</p>';

    var maxG = Math.max.apply(null, (data.growth || []).map(function (g) { return g.count; }).concat([1]));
    document.getElementById("growth").innerHTML = (data.growth || []).map(function (g) {
      var h = Math.max(4, Math.round((g.count / maxG) * 80));
      return '<div class="growth-col"><div class="growth-bar" style="height:' + h + 'px"></div><div class="growth-label">' + (g.period || "").slice(5) + '</div></div>';
    }).join("") || '<p style="font-size:12px;color:#94a3b8">No date column for trends</p>';

    document.getElementById("recent").innerHTML = (data.recentCustomers || []).map(function (r) {
      return '<tr><td>' + r.id + '</td><td>' + r.joined + '</td><td>' + r.segment + '</td></tr>';
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

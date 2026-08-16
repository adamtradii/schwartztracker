import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// Dashboard for the trading engine. Reads live state from the paper trader
// (http://localhost:8787 via the /api proxy) and falls back to the last
// backtest result (data/state.json served at /state.json).

const mono = "'JetBrains Mono', monospace";
const fmtUsd = (n) => (n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const fmtPx = (n) => (n == null ? "—" : n < 2 ? n.toFixed(3) : n.toFixed(2));
const fmtTime = (t) => new Date(t).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function StatCard({ label, value, sub, tone }) {
  const color = tone === "up" ? "#81c784" : tone === "down" ? "#e57373" : "#e8f0f8";
  return (
    <div style={{ background: "#111a24", border: "1px solid #1e3348", borderRadius: 10, padding: "14px 18px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 10, color: "#6b8aad", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3, fontFamily: mono }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: mono, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4a7a9b", marginTop: 3, fontFamily: mono }}>{sub}</div>}
    </div>
  );
}

const th = { textAlign: "left", padding: "6px 10px", fontSize: 10, color: "#6b8aad", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #1e3348", fontFamily: mono };
const td = { padding: "6px 10px", fontSize: 12, color: "#c5d5e5", borderBottom: "1px solid #14212f", fontFamily: mono };

function Panel({ title, children }) {
  return (
    <div style={{ background: "#0f1922", border: "1px solid #1e3348", borderRadius: 12, padding: 18 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "#4fc3f7", fontFamily: mono }}>{title}</h3>
      {children}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [source, setSource] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error("no live engine");
        const data = await res.json();
        if (alive) { setState(data); setSource("live"); setError(null); }
      } catch {
        try {
          const res = await fetch("/state.json");
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (alive) { setState(data); setSource("backtest"); setError(null); }
        } catch {
          if (alive) setError("No engine running and no backtest results found. Run `npm run backtest` or `npm run paper`.");
        }
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (error && !state) {
    return (
      <div style={{ minHeight: "100vh", background: "#080e14", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b8aad", fontFamily: mono, fontSize: 13, padding: 40, textAlign: "center" }}>
        {error}
      </div>
    );
  }
  if (!state) return <div style={{ minHeight: "100vh", background: "#080e14" }} />;

  const { stats, positions, trades, equityCurve, events, prices } = state;
  const pnl = state.equity - stats.startingCash;
  const curve = equityCurve.map((p) => ({ ...p, label: fmtTime(p.time) }));

  return (
    <div style={{ minHeight: "100vh", background: "#080e14", padding: "24px clamp(16px, 4vw, 48px)", color: "#e8f0f8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontFamily: mono, color: "#4fc3f7" }}>
          ⚡ Day Trader <span style={{ color: "#6b8aad", fontWeight: 400 }}>— {state.strategy} on {state.adapter}</span>
        </h1>
        <div style={{ fontSize: 10, fontFamily: mono, color: source === "live" ? "#81c784" : "#f0ad4e" }}>
          ● {source === "live" ? "LIVE ENGINE" : "BACKTEST RESULT"}{state.haltedForDay ? "  ·  ⛔ DAILY LOSS LIMIT HIT" : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Equity" value={fmtUsd(state.equity)} sub={`cash ${fmtUsd(state.cash)}`} />
        <StatCard label="P&L" value={fmtUsd(pnl)} tone={pnl >= 0 ? "up" : "down"} sub={`${stats.totalReturnPct.toFixed(2)}% return`} />
        <StatCard label="Unrealized" value={fmtUsd(state.unrealized)} tone={state.unrealized >= 0 ? "up" : "down"} sub={`${positions.length} open`} />
        <StatCard label="Trades" value={stats.trades} sub={`win rate ${stats.winRate.toFixed(1)}%`} />
        <StatCard label="Profit Factor" value={stats.profitFactor === null ? "—" : Number(stats.profitFactor).toFixed(2)} sub={`avg win ${fmtUsd(stats.avgWin)}`} />
        <StatCard label="Max Drawdown" value={`${stats.maxDrawdownPct.toFixed(2)}%`} tone={stats.maxDrawdownPct > 5 ? "down" : undefined} />
      </div>

      <Panel title="EQUITY CURVE">
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4fc3f7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4fc3f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#14212f" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#4a7a9b", fontFamily: mono }} minTickGap={60} axisLine={false} tickLine={false} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#4a7a9b", fontFamily: mono }} width={70} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} />
              <Tooltip contentStyle={{ background: "#0d1820", border: "1px solid #1e3348", borderRadius: 6, fontSize: 11, fontFamily: mono }} formatter={(v) => [fmtUsd(v), "equity"]} />
              <Area type="monotone" dataKey="equity" stroke="#4fc3f7" strokeWidth={1.5} fill="url(#eq)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginTop: 16 }}>
        <Panel title={`OPEN POSITIONS (${positions.length})`}>
          {positions.length === 0 ? (
            <div style={{ fontSize: 11, color: "#4a7a9b", fontFamily: mono }}>flat</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Symbol</th><th style={th}>Side</th><th style={th}>Qty</th><th style={th}>Entry</th><th style={th}>Last</th><th style={th}>Stop</th><th style={th}>Target</th><th style={th}>P&L</th></tr></thead>
                <tbody>
                  {positions.map((p) => {
                    const last = prices[p.symbol];
                    const dir = p.side === "long" ? 1 : -1;
                    const upnl = last != null ? dir * (last - p.entryPrice) * p.qty : null;
                    return (
                      <tr key={p.symbol}>
                        <td style={td}>{p.symbol}</td>
                        <td style={{ ...td, color: p.side === "long" ? "#81c784" : "#e57373" }}>{p.side}</td>
                        <td style={td}>{p.qty}</td>
                        <td style={td}>{fmtPx(p.entryPrice)}</td>
                        <td style={td}>{fmtPx(last)}</td>
                        <td style={td}>{fmtPx(p.stopPrice)}</td>
                        <td style={td}>{fmtPx(p.targetPrice)}</td>
                        <td style={{ ...td, color: upnl >= 0 ? "#81c784" : "#e57373" }}>{upnl == null ? "—" : fmtUsd(upnl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="ENGINE LOG">
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column-reverse" }}>
            {[...events].reverse().map((e, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: mono, color: e.msg.startsWith("OPEN") ? "#81c784" : e.msg.includes("P&L -") ? "#e57373" : "#8fa8c0", padding: "3px 0", borderBottom: "1px solid #0e1a26" }}>
                <span style={{ color: "#4a7a9b" }}>{fmtTime(e.time)}</span> {e.msg}
              </div>
            ))}
            {events.length === 0 && <div style={{ fontSize: 11, color: "#4a7a9b", fontFamily: mono }}>no events yet</div>}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title={`CLOSED TRADES (${trades.length} most recent)`}>
          <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Exit Time</th><th style={th}>Symbol</th><th style={th}>Side</th><th style={th}>Qty</th><th style={th}>Entry</th><th style={th}>Exit</th><th style={th}>Reason</th><th style={th}>P&L</th></tr></thead>
              <tbody>
                {[...trades].reverse().map((t, i) => (
                  <tr key={i}>
                    <td style={td}>{fmtTime(t.exitTime)}</td>
                    <td style={td}>{t.symbol}</td>
                    <td style={{ ...td, color: t.side === "long" ? "#81c784" : "#e57373" }}>{t.side}</td>
                    <td style={td}>{t.qty}</td>
                    <td style={td}>{fmtPx(t.entryPrice)}</td>
                    <td style={td}>{fmtPx(t.exitPrice)}</td>
                    <td style={{ ...td, color: "#6b8aad" }}>{t.reason}</td>
                    <td style={{ ...td, color: t.pnl >= 0 ? "#81c784" : "#e57373" }}>{t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {trades.length === 0 && <div style={{ fontSize: 11, color: "#4a7a9b", fontFamily: mono, padding: 8 }}>no closed trades yet</div>}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 20, fontSize: 10, color: "#3a5570", fontFamily: mono, textAlign: "center" }}>
        Paper trading by default. Nothing here is financial advice — day trading routinely loses money.
      </div>
    </div>
  );
}

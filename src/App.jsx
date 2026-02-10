import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";
import { loadAllDaily, loadAllCallbacks, getDataMode } from "./lib/data-layer.js";
import { upsertDailyEntry, deleteDailyEntry, insertCallback, updateCallback, deleteCallbackDb } from "./lib/supabase.js";

// ─── Utility ───
const fmt = (n) => `$${(n || 0).toLocaleString()}`;
const shortDate = (d) => { if (!d || !d.includes("-")) return d || ""; const p = d.split("-"); return `${parseInt(p[1])}/${parseInt(p[2])}`; };
const getWeekStart = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0];
};

// ─── Styles ───
const inputStyle = { background: "#0a1420", border: "1px solid #1e3348", borderRadius: 6, padding: "7px 10px", color: "#e8f0f8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", width: "100%", boxSizing: "border-box" };
const btnPrimary = { padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #1a5276 0%, #1a3a5c 100%)", color: "#4fc3f7", fontFamily: "'JetBrains Mono', monospace" };
const btnGhost = { ...btnPrimary, background: "transparent", border: "1px solid #1e3348", color: "#6b8aad" };

// ─── Sub-components ───
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: accent ? "linear-gradient(135deg, #1a3a5c 0%, #0d2137 100%)" : "#111a24", border: "1px solid #1e3348", borderRadius: 10, padding: "14px 18px" }}>
      <div style={{ fontSize: 10, color: "#6b8aad", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? "#4fc3f7" : "#e8f0f8", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4a7a9b", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "#000000aa" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#0f1922", border: "1px solid #1e3348", borderRadius: 12, padding: 24, width: "90%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#4fc3f7", fontFamily: "'JetBrains Mono', monospace" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b8aad", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ connected, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: connected ? "#81c784" : "#6b8aad", fontFamily: "'JetBrains Mono', monospace" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#81c784" : "#4a5568", display: "inline-block" }} />
      {label}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d1820", border: "1px solid #1e3348", borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ color: "#6b8aad", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" && (p.name.includes("Raised") || p.name.includes("Pledged")) ? fmt(p.value) : p.value}</div>
      ))}
    </div>
  );
};

// ─── Main App ───
export default function App() {
  const [daily, setDaily] = useState([]);
  const [callbacks, setCallbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [showAddDay, setShowAddDay] = useState(false);
  const [showAddCallback, setShowAddCallback] = useState(false);
  const [editingDay, setEditingDay] = useState(null);
  const [callbackFilter, setCallbackFilter] = useState("all");
  const [dayForm, setDayForm] = useState({ date: "", hours: "", calls: "", pickups: "", pledges: "", followUps: "", followUpsComplete: "", raised: "", pledged: "", list: "" });
  const [cbForm, setCbForm] = useState({ recorded: "", name: "", callbackOn: "", callMade: false, notes: "" });

  const dataMode = getDataMode();

  // ─── Load data ───
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [d, c] = await Promise.all([loadAllDaily(), loadAllCallbacks()]);
      setDaily(d);
      setCallbacks(c);
    } catch (err) {
      console.error("Refresh failed:", err);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // ─── Daily CRUD ───
  const addOrUpdateDay = async () => {
    const entry = {
      date: dayForm.date,
      hours: parseFloat(dayForm.hours) || 0,
      calls: parseInt(dayForm.calls) || 0,
      pickups: parseInt(dayForm.pickups) || 0,
      pledges: parseInt(dayForm.pledges) || 0,
      followUps: parseInt(dayForm.followUps) || 0,
      followUpsComplete: parseInt(dayForm.followUpsComplete) || 0,
      raised: parseFloat(dayForm.raised) || 0,
      pledged: parseFloat(dayForm.pledged) || 0,
      list: dayForm.list,
      source: "app",
    };

    // Optimistic local update
    setDaily(prev => {
      const idx = prev.findIndex(d => d.date === entry.date);
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
      return [...prev, entry].sort((a, b) => a.localeCompare(b));
    });

    // Persist to Supabase
    await upsertDailyEntry(entry);

    setDayForm({ date: "", hours: "", calls: "", pickups: "", pledges: "", followUps: "", followUpsComplete: "", raised: "", pledged: "", list: "" });
    setShowAddDay(false);
    setEditingDay(null);
  };

  const handleDeleteDay = async (date) => {
    setDaily(prev => prev.filter(d => d.date !== date));
    await deleteDailyEntry(date);
  };

  const startEditDay = (day) => {
    setDayForm({ ...day, hours: String(day.hours), calls: String(day.calls), pickups: String(day.pickups), pledges: String(day.pledges), followUps: String(day.followUps), followUpsComplete: String(day.followUpsComplete), raised: String(day.raised), pledged: String(day.pledged) });
    setEditingDay(day.date);
    setShowAddDay(true);
  };

  // ─── Callback CRUD ───
  const addCallbackHandler = async () => {
    const cb = { ...cbForm };
    const result = await insertCallback(cb);
    if (result) {
      setCallbacks(prev => [...prev, { ...result, callbackOn: result.callback_on || cb.callbackOn, callMade: result.call_made || false, source: "supabase" }]);
    } else {
      // Fallback local-only
      setCallbacks(prev => [...prev, { ...cb, id: `local-${Date.now()}`, source: "app" }]);
    }
    setCbForm({ recorded: "", name: "", callbackOn: "", callMade: false, notes: "" });
    setShowAddCallback(false);
  };

  const toggleCallbackDone = async (cb) => {
    const newVal = !cb.callMade;
    setCallbacks(prev => prev.map(c => c.id === cb.id ? { ...c, callMade: newVal } : c));
    if (typeof cb.id === "number") await updateCallback(cb.id, { callMade: newVal });
  };

  const handleDeleteCallback = async (cb) => {
    setCallbacks(prev => prev.filter(c => c.id !== cb.id));
    if (typeof cb.id === "number") await deleteCallbackDb(cb.id);
  };

  // ─── Computed ───
  const totals = useMemo(() => daily.reduce((acc, d) => ({
    hours: acc.hours + d.hours, calls: acc.calls + d.calls, pickups: acc.pickups + d.pickups,
    pledges: acc.pledges + d.pledges, raised: acc.raised + d.raised, pledged: acc.pledged + d.pledged,
  }), { hours: 0, calls: 0, pickups: 0, pledges: 0, raised: 0, pledged: 0 }), [daily]);

  const weeklyChart = useMemo(() => {
    const weeks = {};
    daily.forEach(d => {
      if (!d.date || d.hours === 0) return;
      const ws = getWeekStart(d.date);
      if (!weeks[ws]) weeks[ws] = { hours: 0, calls: 0, raised: 0, pledged: 0, pickups: 0, pledges: 0 };
      weeks[ws].hours += d.hours; weeks[ws].calls += d.calls; weeks[ws].raised += d.raised;
      weeks[ws].pledged += d.pledged; weeks[ws].pickups += d.pickups; weeks[ws].pledges += d.pledges;
    });
    return Object.entries(weeks).sort(([a],[b]) => a.localeCompare(b)).map(([ws, t]) => ({ week: shortDate(ws), ...t }));
  }, [daily]);

  const filteredCallbacks = callbackFilter === "all" ? callbacks
    : callbackFilter === "pending" ? callbacks.filter(c => !c.callMade)
    : callbacks.filter(c => c.callMade);

  const activeDays = daily.filter(d => d.hours > 0).length;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080e14", display: "flex", alignItems: "center", justifyContent: "center", color: "#4fc3f7", fontFamily: "'JetBrains Mono', monospace", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 16 }}>Loading call time data...</div>
      <div style={{ fontSize: 11, color: "#4a7a9b" }}>
        {dataMode.sheetsConnected && "Google Sheets"}{dataMode.sheetsConnected && dataMode.supabaseConnected && " + "}{dataMode.supabaseConnected && "Supabase"}
        {!dataMode.sheetsConnected && !dataMode.supabaseConnected && "Using seed data"}
      </div>
    </div>
  );

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "daily", label: "Daily Log" },
    { id: "callbacks", label: `Callbacks (${callbacks.filter(c=>!c.callMade).length})` },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080e14", color: "#e8f0f8", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(180deg, #0f1922 0%, #080e14 100%)", borderBottom: "1px solid #1e3348", padding: "16px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'JetBrains Mono', monospace", background: "linear-gradient(135deg, #4fc3f7 0%, #81c784 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SCHWARTZ</h1>
          <span style={{ fontSize: 13, color: "#4a7a9b" }}>Call Time Tracker</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <StatusBadge connected={dataMode.sheetsConnected} label="Sheets" />
            <StatusBadge connected={dataMode.supabaseConnected} label="Supabase" />
            <button onClick={refresh} disabled={refreshing} style={{ ...btnGhost, padding: "4px 10px", fontSize: 10, opacity: refreshing ? 0.5 : 1 }}>
              {refreshing ? "..." : "Refresh"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0, marginTop: 12 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: tab === t.id ? "#111a24" : "transparent",
              color: tab === t.id ? "#4fc3f7" : "#4a7a9b",
              border: "none", borderBottom: tab === t.id ? "2px solid #4fc3f7" : "2px solid transparent",
              borderRadius: "6px 6px 0 0", fontFamily: "'JetBrains Mono', monospace",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ═══ DASHBOARD ═══ */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
              <StatCard label="Total Hours" value={totals.hours.toFixed(1)} sub={`${activeDays} active days`} accent />
              <StatCard label="Total Calls" value={totals.calls.toLocaleString()} sub={totals.hours > 0 ? `${(totals.calls/totals.hours).toFixed(1)} calls/hr` : ""} />
              <StatCard label="Pickups" value={totals.pickups} sub={totals.calls > 0 ? `${((totals.pickups/totals.calls)*100).toFixed(1)}% rate` : ""} />
              <StatCard label="Pledges" value={totals.pledges} />
              <StatCard label="$ Raised" value={fmt(totals.raised)} accent />
              <StatCard label="$ Pledged" value={fmt(totals.pledged)} />
              <StatCard label="Pipeline" value={fmt(totals.raised + totals.pledged)} sub={totals.hours > 0 ? `${fmt(Math.round((totals.raised+totals.pledged)/totals.hours))}/hr` : ""} accent />
            </div>

            <div style={{ background: "#111a24", border: "1px solid #1e3348", borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 12, color: "#6b8aad", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Weekly Revenue</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyChart} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3348" />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#4a7a9b" }} axisLine={{ stroke: "#1e3348" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#4a7a9b" }} axisLine={{ stroke: "#1e3348" }} tickFormatter={v => `$${v>=1000?(v/1000).toFixed(0)+"k":v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="raised" name="$ Raised" fill="#81c784" radius={[3,3,0,0]} />
                  <Bar dataKey="pledged" name="$ Pledged" fill="#4fc3f7" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#111a24", border: "1px solid #1e3348", borderRadius: 10, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 12, color: "#6b8aad", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>Calls / Week</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={weeklyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3348" />
                    <XAxis dataKey="week" tick={{ fontSize: 8, fill: "#4a7a9b" }} axisLine={{ stroke: "#1e3348" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#4a7a9b" }} axisLine={{ stroke: "#1e3348" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="calls" name="Calls" fill="#4fc3f722" stroke="#4fc3f7" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: "#111a24", border: "1px solid #1e3348", borderRadius: 10, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 12, color: "#6b8aad", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>Hours / Week</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={weeklyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3348" />
                    <XAxis dataKey="week" tick={{ fontSize: 8, fill: "#4a7a9b" }} axisLine={{ stroke: "#1e3348" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#4a7a9b" }} axisLine={{ stroke: "#1e3348" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="hours" name="Hours" fill="#1a3a5c" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ═══ DAILY LOG ═══ */}
        {tab === "daily" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#6b8aad", fontFamily: "'JetBrains Mono', monospace" }}>{daily.length} entries &middot; {activeDays} active days</span>
              <button onClick={() => { setDayForm({ date: new Date().toISOString().split("T")[0], hours: "", calls: "", pickups: "", pledges: "", followUps: "", followUpsComplete: "", raised: "", pledged: "", list: "" }); setEditingDay(null); setShowAddDay(true); }} style={btnPrimary}>+ Add Day</button>
            </div>
            <div style={{ background: "#111a24", border: "1px solid #1e3348", borderRadius: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #1e3348" }}>
                    {["Date","Hrs","Calls","Rate","Pickups","Pledges","FU","Raised","Pledged","List","Src",""].map(h => (
                      <th key={h} style={{ padding: "8px 5px", textAlign: "left", color: "#6b8aad", fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map(d => (
                    <tr key={d.date} style={{ borderBottom: "1px solid #0f1922", opacity: d.hours === 0 ? 0.4 : 1 }}>
                      <td style={{ padding: "6px 5px", color: "#c8dae8", whiteSpace: "nowrap" }}>{shortDate(d.date)}</td>
                      <td style={{ padding: "6px 5px", color: "#e8f0f8" }}>{d.hours}</td>
                      <td style={{ padding: "6px 5px", color: "#e8f0f8" }}>{d.calls}</td>
                      <td style={{ padding: "6px 5px", color: "#4a7a9b" }}>{d.hours > 0 ? (d.calls/d.hours).toFixed(1) : "–"}</td>
                      <td style={{ padding: "6px 5px", color: d.pickups > 10 ? "#4fc3f7" : "#e8f0f8" }}>{d.pickups}</td>
                      <td style={{ padding: "6px 5px", color: d.pledges > 0 ? "#81c784" : "#4a5568" }}>{d.pledges}</td>
                      <td style={{ padding: "6px 5px", color: "#e8f0f8" }}>{d.followUps}</td>
                      <td style={{ padding: "6px 5px", color: d.raised > 0 ? "#81c784" : "#4a5568", fontWeight: d.raised >= 1000 ? 700 : 400 }}>{fmt(d.raised)}</td>
                      <td style={{ padding: "6px 5px", color: d.pledged > 0 ? "#4fc3f7" : "#4a5568" }}>{fmt(d.pledged)}</td>
                      <td style={{ padding: "6px 5px", color: "#8aa4bd", fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.list}>{d.list || "–"}</td>
                      <td style={{ padding: "6px 5px" }}>
                        <span style={{ fontSize: 8, color: d.source === "sheets" ? "#4fc3f7" : d.source === "supabase" ? "#81c784" : "#6b8aad", background: "#0a1420", padding: "1px 4px", borderRadius: 3 }}>
                          {d.source === "sheets" ? "GS" : d.source === "supabase" ? "DB" : d.source === "app" ? "APP" : "SD"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 5px", whiteSpace: "nowrap" }}>
                        <button onClick={() => startEditDay(d)} style={{ background: "none", border: "none", color: "#4fc3f7", cursor: "pointer", fontSize: 10, padding: "2px 4px" }}>edit</button>
                        <button onClick={() => handleDeleteDay(d.date)} style={{ background: "none", border: "none", color: "#ff8a65", cursor: "pointer", fontSize: 10, padding: "2px 4px" }}>del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ CALLBACKS ═══ */}
        {tab === "callbacks" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              {["all", "pending", "completed"].map(f => (
                <button key={f} onClick={() => setCallbackFilter(f)} style={{
                  padding: "6px 14px", fontSize: 11, cursor: "pointer",
                  background: callbackFilter === f ? "#1a3a5c" : "#111a24",
                  color: callbackFilter === f ? "#4fc3f7" : "#6b8aad",
                  border: callbackFilter === f ? "1px solid #4fc3f7" : "1px solid #1e3348",
                  borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", textTransform: "capitalize",
                }}>{f}</button>
              ))}
              <span style={{ fontSize: 11, color: "#4a7a9b", fontFamily: "'JetBrains Mono', monospace" }}>
                {callbacks.filter(c => !c.callMade).length} pending
              </span>
              <button onClick={() => { setCbForm({ recorded: new Date().toISOString().split("T")[0], name: "", callbackOn: "", callMade: false, notes: "" }); setShowAddCallback(true); }} style={{ ...btnPrimary, marginLeft: "auto" }}>+ Add Callback</button>
            </div>
            <div style={{ background: "#111a24", border: "1px solid #1e3348", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #1e3348" }}>
                    {["Recorded","Name","Call Back On","Status","Notes",""].map(h => (
                      <th key={h} style={{ padding: "10px 10px", textAlign: "left", color: "#6b8aad", fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCallbacks.map(c => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #0f1922" }}>
                      <td style={{ padding: "8px 10px", color: "#8aa4bd", fontSize: 11 }}>{c.recorded && c.recorded.includes("-") ? shortDate(c.recorded) : c.recorded}</td>
                      <td style={{ padding: "8px 10px", color: "#e8f0f8", fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: "8px 10px", color: "#8aa4bd" }}>{c.callbackOn}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <button onClick={() => toggleCallbackDone(c)} style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "none",
                          background: c.callMade ? "#81c78422" : "#ff8a6522", color: c.callMade ? "#81c784" : "#ff8a65",
                        }}>{c.callMade ? "DONE" : "PENDING"}</button>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#6b8aad", fontSize: 11, maxWidth: 250 }}>{c.notes || "–"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <button onClick={() => handleDeleteCallback(c)} style={{ background: "none", border: "none", color: "#ff8a65", cursor: "pointer", fontSize: 10 }}>del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ ADD/EDIT DAY MODAL ═══ */}
      <Modal open={showAddDay} onClose={() => { setShowAddDay(false); setEditingDay(null); }} title={editingDay ? "Edit Day" : "Log Call Time"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>DATE</label>
            <input type="date" value={dayForm.date} onChange={e => setDayForm(f => ({...f, date: e.target.value}))} style={inputStyle} />
          </div>
          {[["hours","Hours Spent"],["calls","Calls Made"],["pickups","Pickups"],["pledges","Hard Pledges"],["followUps","Follow Ups"],["followUpsComplete","FU Complete"],["raised","$ Raised"],["pledged","$ Pledged"]].map(([k, label]) => (
            <div key={k}>
              <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>{label.toUpperCase()}</label>
              <input type="number" step={k === "hours" ? "0.25" : "1"} value={dayForm[k]} onChange={e => setDayForm(f => ({...f, [k]: e.target.value}))} style={inputStyle} placeholder="0" />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>LIST CALLED</label>
            <input type="text" value={dayForm.list} onChange={e => setDayForm(f => ({...f, list: e.target.value}))} style={inputStyle} placeholder="e.g. Biden Matchlist + Healthcare" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={() => { setShowAddDay(false); setEditingDay(null); }} style={btnGhost}>Cancel</button>
          <button onClick={addOrUpdateDay} style={btnPrimary} disabled={!dayForm.date}>{editingDay ? "Save" : "Log Day"}</button>
        </div>
      </Modal>

      {/* ═══ ADD CALLBACK MODAL ═══ */}
      <Modal open={showAddCallback} onClose={() => setShowAddCallback(false)} title="Add Callback">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>DATE RECORDED</label>
              <input type="date" value={cbForm.recorded} onChange={e => setCbForm(f => ({...f, recorded: e.target.value}))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>CALL BACK ON</label>
              <input type="text" value={cbForm.callbackOn} onChange={e => setCbForm(f => ({...f, callbackOn: e.target.value}))} style={inputStyle} placeholder="e.g. 2/15, 2/16" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>NAME</label>
            <input type="text" value={cbForm.name} onChange={e => setCbForm(f => ({...f, name: e.target.value}))} style={inputStyle} placeholder="Prospect name" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "#6b8aad", display: "block", marginBottom: 3 }}>NOTES</label>
            <input type="text" value={cbForm.notes} onChange={e => setCbForm(f => ({...f, notes: e.target.value}))} style={inputStyle} placeholder="Optional notes" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={() => setShowAddCallback(false)} style={btnGhost}>Cancel</button>
          <button onClick={addCallbackHandler} style={btnPrimary} disabled={!cbForm.name || !cbForm.recorded}>Add Callback</button>
        </div>
      </Modal>
    </div>
  );
}

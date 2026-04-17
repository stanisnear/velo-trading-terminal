import { useState, useMemo } from "react";
import { PAIRS } from "../utils/constants.jsx";
import { fmt, playSound } from "../utils/helpers.jsx";

// Mini sparkline
const Spark = ({ data, width = 56, height = 22 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / r) * height}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} style={{ overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? "#10b981" : "#ef4444"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default function PairSelector({ open, onClose, onSelect, prices, changes24h, sparklines }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return PAIRS;
    const q = search.toLowerCase();
    return PAIRS.filter(p => p.id.toLowerCase().includes(q) || p.coin.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [search]);

  if (!open) return null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ position: "relative" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth={2} strokeLinecap="round" style={{ position: "absolute", left: 12, top: 12 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input autoFocus placeholder="Search markets…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...S.input, paddingLeft: 38 }} />
          </div>
        </div>

        {/* List */}
        <div style={S.list}>
          {filtered.map(p => {
            const price = prices[p.id];
            const change = changes24h[p.id] || 0;
            const spark = sparklines[p.id];
            return (
              <button key={p.id}
                onClick={() => { onSelect(p); onClose(); playSound("click"); }}
                style={S.row}
                onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                onMouseOut={e => e.currentTarget.style.background = "none"}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={p.icon} width={32} height={32}
                    style={{ borderRadius: "50%", background: "#222", flexShrink: 0 }}
                    onError={e => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${p.coin}&size=32&background=1a1a1a&color=888&bold=true&font-size=0.4`;
                    }} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#e5e5e5" }}>{p.id}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{p.name}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Spark data={spark} />
                  <div style={{ textAlign: "right", minWidth: 80 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "monospace", color: "#e5e5e5" }}>
                      ${price ? fmt(price) : "—"}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: change >= 0 ? "#10b981" : "#ef4444" }}>
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 13 }}>No results for "{search}"</div>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  box: { background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "75vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", overflow: "hidden" },
  header: { padding: 14, borderBottom: "1px solid rgba(255,255,255,0.04)" },
  input: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px", color: "#e5e5e5", fontSize: 14, fontWeight: 500, outline: "none" },
  list: { overflowY: "auto", flex: 1, padding: 4 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "none", background: "none", color: "inherit", cursor: "pointer", width: "100%", borderRadius: 10, transition: "background 0.1s" },
};

import { useMemo } from "react";
import { fmt, fmtCompact, genOrderBook } from "../utils/helpers.jsx";

export default function OrderBook({ price, pair, rows = 14 }) {
  const { asks, bids } = useMemo(() => genOrderBook(price || 0, rows), [price, pair, rows]);
  
  const maxTotal = useMemo(() => {
    if (asks.length === 0 && bids.length === 0) return 1;
    return Math.max(
      asks.length > 0 ? asks[0].total : 0,
      bids.length > 0 ? bids[bids.length - 1].total : 0
    );
  }, [asks, bids]);

  const spread = asks.length > 0 && bids.length > 0 
    ? asks[asks.length - 1].price - bids[0].price 
    : 0;
  const spreadPct = price > 0 ? (spread / price * 100) : 0;

  if (!price || price <= 0) {
    return (
      <div style={S.wrap}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#555", fontSize: 11, fontWeight: 600 }}>
          Waiting for price data…
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>Order Book</span>
        <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>{pair}</span>
      </div>

      {/* Column labels */}
      <div style={S.labels}>
        <span>Price (USD)</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {/* Asks (sells) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden", minHeight: 0 }}>
        {asks.map((a, i) => (
          <div key={`a${i}`} style={S.row} title={`$${fmt(a.price)} × ${fmtCompact(a.size)}`}>
            <div style={{ ...S.depthBar, background: "rgba(239,68,68,0.06)", width: `${(a.total / maxTotal) * 100}%` }} />
            <span style={{ ...S.price, color: "#ef4444" }}>{fmt(a.price)}</span>
            <span style={S.size}>{fmtCompact(a.size)}</span>
            <span style={S.total}>{fmtCompact(a.total)}</span>
          </div>
        ))}
      </div>

      {/* Spread / Mid price */}
      <div style={S.mid}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#e5e5e5", fontFamily: "'JetBrains Mono', monospace" }}>${fmt(price)}</span>
        <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#555" }}>
          <span>Spread: {fmt(spread)}</span>
          <span>({spreadPct.toFixed(3)}%)</span>
        </div>
      </div>

      {/* Bids (buys) */}
      <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {bids.map((b, i) => (
          <div key={`b${i}`} style={S.row} title={`$${fmt(b.price)} × ${fmtCompact(b.size)}`}>
            <div style={{ ...S.depthBar, background: "rgba(16,185,129,0.06)", width: `${(b.total / maxTotal) * 100}%` }} />
            <span style={{ ...S.price, color: "#10b981" }}>{fmt(b.price)}</span>
            <span style={S.size}>{fmtCompact(b.size)}</span>
            <span style={S.total}>{fmtCompact(b.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", height: "100%", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, userSelect: "none", overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px 6px", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  title: { fontSize: 10, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: 1.5 },
  labels: { display: "flex", justifyContent: "space-between", padding: "3px 10px", fontSize: 8, color: "#444", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 10px", position: "relative", height: 20, cursor: "pointer", transition: "background 0.1s" },
  depthBar: { position: "absolute", right: 0, top: 0, bottom: 0, transition: "width 0.4s ease", pointerEvents: "none" },
  price: { position: "relative", zIndex: 1, fontWeight: 600, flex: 1 },
  size: { position: "relative", zIndex: 1, color: "#777", flex: 1, textAlign: "right" },
  total: { position: "relative", zIndex: 1, color: "#555", flex: 1, textAlign: "right", fontSize: 9 },
  mid: { padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
};

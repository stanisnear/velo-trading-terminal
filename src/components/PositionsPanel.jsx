import { useState } from "react";
import { fmt, pnlColor, pnlSign, calcPnl, calcRoe, fmtCompact } from "../utils/helpers.jsx";
import { PAIR_MAP } from "../utils/constants.jsx";

export default function PositionsPanel({ positions, tradeHistory, prices, onClose }) {
  const [tab, setTab] = useState("POSITIONS");

  return (
    <div style={S.wrap}>
      {/* Tabs */}
      <div style={S.tabs}>
        {["POSITIONS", "HISTORY"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...S.tab, ...(tab === t ? S.tabActive : {}), color: tab === t ? "#3b82f6" : "#555" }}>
            {t}
            {t === "POSITIONS" && positions.length > 0 && (
              <span style={S.badge}>{positions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={S.content}>
        {tab === "POSITIONS" && (
          positions.length === 0 ? (
            <div style={S.empty}>No open positions</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {positions.map(p => {
                const cp = prices[p.pair] || p.entryPrice;
                const pnl = calcPnl(p, cp);
                const margin = p.size / p.leverage;
                const roe = calcRoe(pnl, margin);
                const pairInfo = PAIR_MAP[p.pair];
                return (
                  <div key={p.id} style={S.row}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      {pairInfo?.icon && (
                        <img src={pairInfo.icon} width={22} height={22} style={{ borderRadius: "50%", flexShrink: 0 }}
                          onError={e => { e.target.style.display = "none"; }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 12 }}>{p.pair}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                            color: p.side === "LONG" ? "#10b981" : "#ef4444",
                            background: p.side === "LONG" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          }}>{p.side}</span>
                          <span style={{ fontSize: 9, color: "#555" }}>{p.leverage}x</span>
                          <span style={{ fontSize: 9, color: "#444", fontStyle: "italic" }}>{p.marginMode}</span>
                        </div>
                        <div style={{ fontSize: 9, color: "#555", fontFamily: "monospace", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          Entry: ${fmt(p.entryPrice)} · Mark: ${fmt(cp)} · Liq: <span style={{ color: "#f59e0b" }}>${fmt(p.liquidationPrice)}</span>
                          {p.takeProfit && <> · TP: <span style={{ color: "#10b981" }}>${fmt(p.takeProfit)}</span></>}
                          {p.stopLoss && <> · SL: <span style={{ color: "#ef4444" }}>${fmt(p.stopLoss)}</span></>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "monospace", color: pnlColor(pnl) }}>
                          {pnlSign(pnl)}${fmt(Math.abs(pnl))}
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: pnlColor(roe), fontFamily: "monospace" }}>
                          {pnlSign(roe)}{roe.toFixed(2)}% ROE
                        </div>
                      </div>
                      <div style={{ textAlign: "right", color: "#555", fontSize: 10 }}>
                        ${fmtCompact(p.size)}
                      </div>
                      <button onClick={() => onClose(p.id)} style={S.closeBtn}>Close</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === "HISTORY" && (
          tradeHistory.length === 0 ? (
            <div style={S.empty}>No trade history yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {tradeHistory.slice(0, 30).map(t => (
                <div key={t.id} style={S.histRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 11 }}>{t.pair}</span>
                    <span style={{ fontSize: 9, fontWeight: 700,
                      color: t.side === "LONG" ? "#10b981" : "#ef4444",
                    }}>{t.side}</span>
                    <span style={{ fontSize: 9, color: "#444" }}>{t.leverage}x</span>
                    {t.reason && (
                      <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                        background: t.reason === "TP HIT" ? "rgba(16,185,129,0.12)" : t.reason === "LIQUIDATED" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)",
                        color: t.reason === "TP HIT" ? "#10b981" : t.reason === "LIQUIDATED" ? "#ef4444" : "#666",
                      }}>{t.reason}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <span style={{ color: "#444", fontFamily: "monospace", fontSize: 10 }}>
                      ${fmt(t.entryPrice)} → ${fmt(t.exitPrice)}
                    </span>
                    <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11, color: pnlColor(t.pnl), minWidth: 70, textAlign: "right" }}>
                      {pnlSign(t.pnl)}${fmt(Math.abs(t.pnl))}
                    </span>
                    <span style={{ fontSize: 9, color: "#444", minWidth: 50, textAlign: "right" }}>
                      {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  tabs: { display: "flex", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "0 12px", flexShrink: 0 },
  tab: { padding: "8px 16px", fontSize: 11, fontWeight: 700, border: "none", background: "none", cursor: "pointer", borderBottom: "2px solid transparent", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 },
  tabActive: { borderBottom: "2px solid #3b82f6" },
  badge: { background: "#3b82f6", color: "#fff", padding: "1px 6px", borderRadius: 10, fontSize: 9, fontWeight: 800 },
  content: { flex: 1, overflowY: "auto", padding: 8, minHeight: 0 },
  empty: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#333", fontSize: 12, fontWeight: 600 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "rgba(255,255,255,0.015)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.03)" },
  histRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.01)", fontSize: 11, opacity: 0.85 },
  closeBtn: { padding: "5px 14px", fontSize: 10, fontWeight: 700, borderRadius: 6, border: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.06)", color: "#ef4444", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" },
};

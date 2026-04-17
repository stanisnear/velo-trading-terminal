import { useState, useMemo } from "react";
import { fmt, fmtCompact, riskLevel, calcLiqPrice, playSound } from "../utils/helpers.jsx";
import { LEVERAGE_OPTIONS } from "../utils/constants.jsx";

export default function OrderForm({ pair, currentPrice, user, onSubmit, onLogin }) {
  const [side, setSide] = useState("LONG");
  const [orderType, setOrderType] = useState("MARKET");
  const [leverage, setLeverage] = useState(10);
  const [marginMode, setMarginMode] = useState("ISOLATED");
  const [sizeSlider, setSizeSlider] = useState(25);
  const [limitPrice, setLimitPrice] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  const balance = user?.balance || 0;
  const sizeMargin = (balance * sizeSlider) / 100;
  const notional = sizeMargin * leverage;
  const execPrice = orderType === "MARKET" ? currentPrice : (parseFloat(limitPrice) || 0);
  const liqPrice = execPrice > 0 ? calcLiqPrice(execPrice, leverage, side) : 0;
  const risk = riskLevel(leverage);

  const handleSubmit = () => {
    if (!user) { onLogin?.(); return; }
    const tp = takeProfit ? parseFloat(takeProfit) : undefined;
    const sl = stopLoss ? parseFloat(stopLoss) : undefined;
    
    const result = onSubmit(pair.id, side, sizeMargin, leverage, execPrice, marginMode, tp, sl);
    if (result?.success) {
      setSizeSlider(25); setTakeProfit(""); setStopLoss(""); setLimitPrice("");
    }
  };

  return (
    <div style={S.wrap}>
      {/* Auth overlay */}
      {!user && (
        <div style={S.authOverlay}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#e5e5e5" }}>Connect to Trade</div>
          <button onClick={onLogin} style={S.btnPrimary}>Log In</button>
        </div>
      )}

      <div style={{ opacity: user ? 1 : 0.15, pointerEvents: user ? "auto" : "none" }}>
        {/* Margin Mode */}
        <div style={S.toggle}>
          {["ISOLATED", "CROSS"].map(m => (
            <button key={m} onClick={() => setMarginMode(m)}
              style={{ ...S.toggleBtn, ...(marginMode === m ? S.toggleActive : {}) }}>{m}</button>
          ))}
        </div>

        {/* Order Type */}
        <div style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6, marginBottom: 10 }}>
          {["MARKET", "LIMIT", "STOP"].map(t => (
            <button key={t} onClick={() => setOrderType(t)}
              style={{ fontSize: 10, fontWeight: 700, border: "none", background: "none", cursor: "pointer", paddingBottom: 4,
                color: orderType === t ? "#3b82f6" : "#555",
                borderBottom: orderType === t ? "2px solid #3b82f6" : "2px solid transparent",
              }}>{t}</button>
          ))}
        </div>

        {/* Side toggle */}
        <div style={{ ...S.toggle, marginBottom: 12, position: "relative" }}>
          <div style={{ position: "absolute", top: 2, left: side === "SHORT" ? "50%" : 2, width: "calc(50% - 2px)", height: "calc(100% - 4px)", background: "rgba(255,255,255,0.06)", borderRadius: 6, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
          <button onClick={() => setSide("LONG")} style={{ ...S.toggleBtn, position: "relative", zIndex: 1, color: side === "LONG" ? "#10b981" : "#555", fontWeight: 800 }}>Buy / Long</button>
          <button onClick={() => setSide("SHORT")} style={{ ...S.toggleBtn, position: "relative", zIndex: 1, color: side === "SHORT" ? "#ef4444" : "#555", fontWeight: 800 }}>Sell / Short</button>
        </div>

        {/* Limit Price */}
        {orderType !== "MARKET" && (
          <div style={{ marginBottom: 8 }}>
            <label style={S.label}>Price</label>
            <input type="number" placeholder={fmt(currentPrice)} value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)} style={S.input} />
          </div>
        )}

        {/* Size */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <label style={S.label}>Size (Margin %)</label>
            <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{sizeSlider}%</span>
          </div>
          <input type="range" min={0} max={100} step={1} value={sizeSlider}
            onChange={e => setSizeSlider(Number(e.target.value))}
            style={{ width: "100%", accentColor: side === "LONG" ? "#10b981" : "#ef4444", height: 4 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#e5e5e5" }}>${fmt(sizeMargin)}</span>
            <span style={{ fontSize: 9, color: "#555" }}>Notional: ${fmtCompact(notional)}</span>
          </div>
          {/* Quick size buttons */}
          <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
            {[10, 25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => setSizeSlider(v)}
                style={{ flex: 1, padding: "4px 0", fontSize: 9, fontWeight: 700, borderRadius: 5, cursor: "pointer",
                  border: sizeSlider === v ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.04)",
                  background: sizeSlider === v ? "rgba(59,130,246,0.08)" : "none",
                  color: sizeSlider === v ? "#3b82f6" : "#555",
                }}>{v}%</button>
            ))}
          </div>
        </div>

        {/* Leverage */}
        <div style={{ marginBottom: 10 }}>
          <label style={S.label}>Leverage</label>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {LEVERAGE_OPTIONS.map(l => (
              <button key={l} onClick={() => setLeverage(l)}
                style={{ padding: "4px 0", fontSize: 9, fontWeight: 700, borderRadius: 5, cursor: "pointer",
                  flex: "1 1 auto", minWidth: 32,
                  border: leverage === l ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.04)",
                  background: leverage === l ? "rgba(59,130,246,0.1)" : "none",
                  color: leverage === l ? "#3b82f6" : "#555",
                }}>{l}x</button>
            ))}
          </div>
        </div>

        {/* TP/SL */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Take Profit</label>
            <input type="number" placeholder="Optional" value={takeProfit}
              onChange={e => setTakeProfit(e.target.value)} style={{ ...S.input, fontSize: 11 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Stop Loss</label>
            <input type="number" placeholder="Optional" value={stopLoss}
              onChange={e => setStopLoss(e.target.value)} style={{ ...S.input, fontSize: 11 }} />
          </div>
        </div>

        {/* Summary */}
        <div style={S.summary}>
          {[
            ["Margin Mode", marginMode, "#e5e5e5"],
            ["Leverage", `${leverage}x`, "#e5e5e5"],
            ["Est. Liq Price", `$${fmt(Math.max(0, liqPrice))}`, "#f59e0b"],
            ["Risk Level", risk.label, risk.color],
          ].map(([label, val, color]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#555" }}>{label}</span>
              <span style={{ fontWeight: 700, color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Cost */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 3 }}>
          <span>Cost (Margin)</span>
          <span style={{ fontWeight: 700, color: "#e5e5e5", fontFamily: "monospace" }}>${fmt(sizeMargin)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 12 }}>
          <span>Available</span>
          <span style={{ fontWeight: 700, color: "#10b981", fontFamily: "monospace" }}>${fmt(balance)}</span>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={sizeMargin <= 0}
          style={{
            width: "100%", padding: "13px 0", fontSize: 13, fontWeight: 800, borderRadius: 10, border: "none",
            color: "#fff", cursor: sizeMargin > 0 ? "pointer" : "not-allowed",
            letterSpacing: 0.5, textTransform: "uppercase",
            background: side === "LONG" ? "#10b981" : "#ef4444",
            boxShadow: side === "LONG" ? "0 4px 20px rgba(16,185,129,0.2)" : "0 4px 20px rgba(239,68,68,0.2)",
            opacity: sizeMargin > 0 ? 1 : 0.35, transition: "all 0.15s",
          }}>
          {user ? (orderType === "MARKET" ? `${side} ${pair.coin}` : `Place ${orderType} ${side}`) : "Connect Wallet"}
        </button>
      </div>
    </div>
  );
}

const S = {
  wrap: { padding: 12, position: "relative", minHeight: 0 },
  authOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 0 },
  btnPrimary: { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", padding: "9px 28px", fontSize: 12 },
  toggle: { display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 2, marginBottom: 8 },
  toggleBtn: { flex: 1, padding: "5px 0", fontSize: 10, fontWeight: 700, borderRadius: 6, border: "none", background: "none", color: "#555", cursor: "pointer" },
  toggleActive: { background: "rgba(255,255,255,0.07)", color: "#e5e5e5", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" },
  label: { display: "block", fontSize: 9, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  input: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 10px", color: "#e5e5e5", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, outline: "none" },
  summary: { background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 10, display: "flex", flexDirection: "column", gap: 4, border: "1px solid rgba(255,255,255,0.03)" },
};

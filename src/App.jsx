import { useState, useMemo } from "react";
import { usePriceFeed } from "./services/priceService.jsx";
import { useTrading } from "./hooks/useTrading.jsx";
import TradingChart from "./components/TradingChart.jsx";
import OrderBook from "./components/OrderBook.jsx";
import OrderForm from "./components/OrderForm.jsx";
import PositionsPanel from "./components/PositionsPanel.jsx";
import PairSelector from "./components/PairSelector.jsx";
import { Header, LoginModal, Toast } from "./components/UI.jsx";
import { PAIRS, PAIR_MAP } from "./utils/constants.jsx";
import { fmt, calcPnl } from "./utils/helpers.jsx";

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pairModalOpen, setPairModalOpen] = useState(false);
  const [pair, setPair] = useState(PAIRS[0]);

  const { prices, changes24h, status, sparklines, candles } = usePriceFeed();
  const { user, positions, tradeHistory, openPosition, closePosition, login } = useTrading(prices, setToast);

  const currentPrice = prices[pair.id] || 0;
  const change24h = changes24h[pair.id] || 0;
  const pairPositions = positions.filter(p => p.pair === pair.id);

  const totalEquity = useMemo(() => {
    if (!user) return 0;
    const unrealized = positions.reduce((acc, p) => acc + calcPnl(p, prices[p.pair] || p.entryPrice), 0);
    const marginUsed = positions.reduce((acc, p) => acc + p.size / p.leverage, 0);
    return user.balance + marginUsed + unrealized;
  }, [user, positions, prices]);

  const handleTrade = (pairId, side, sizeMargin, leverage, price, marginMode, tp, sl) => {
    const result = openPosition(pairId, side, sizeMargin, leverage, price, marginMode, tp, sl);
    if (result.error) {
      setToast({ msg: result.error, type: "error" });
      return result;
    }
    const p = result.position;
    setToast({ msg: `${p.side} ${p.pair.split("/")[0]} — $${fmt(p.size)} @ ${fmt(p.entryPrice)}`, type: "success" });
    return result;
  };

  const handleClose = (posId) => {
    const pnl = closePosition(posId);
    if (pnl !== undefined) {
      setToast({
        msg: `Position closed — PnL: ${pnl >= 0 ? "+" : ""}$${fmt(Math.abs(pnl))}`,
        type: pnl >= 0 ? "success" : "error",
      });
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#e5e5e5", fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type="range"] { -webkit-appearance: none; height: 3px; border-radius: 4px; background: rgba(255,255,255,0.08); outline: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; cursor: pointer; border: 2px solid #3b82f6; background: #111; }
        input::placeholder { color: #333; }
        input:focus { border-color: rgba(59,130,246,0.4) !important; }
        button { font-family: inherit; }
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={(name) => { login(name); setLoginOpen(false); setToast({ msg: `Welcome ${name}! $10,000 demo balance loaded.`, type: "success" }); }} />
      <PairSelector open={pairModalOpen} onClose={() => setPairModalOpen(false)} onSelect={setPair} prices={prices} changes24h={changes24h} sparklines={sparklines} />
      <Header user={user} status={status} theme={theme} onToggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")} onLogin={() => setLoginOpen(true)} totalEquity={totalEquity} />

      <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" }}>
        {/* LEFT: Chart + Positions */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
          {/* Pair bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)", flexShrink: 0 }}>
            <button onClick={() => setPairModalOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "#e5e5e5", padding: "4px 8px", borderRadius: 8 }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseOut={e => e.currentTarget.style.background = "none"}>
              <img src={PAIR_MAP[pair.id]?.icon} width={26} height={26} style={{ borderRadius: "50%", background: "#222" }}
                onError={e => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${pair.coin}&size=26&background=1a1a1a&color=888&bold=true&font-size=0.4`; }} />
              <span style={{ fontWeight: 800, fontSize: 15 }}>{pair.id}</span>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth={3}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: change24h >= 0 ? "#10b981" : "#ef4444" }}>${fmt(currentPrice)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: change24h >= 0 ? "#10b981" : "#ef4444", background: change24h >= 0 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)" }}>
              {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
            </div>
            {pairPositions.length > 0 && (
              <div style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                {pairPositions.length} open
              </div>
            )}
          </div>

          {/* Chart */}
          <div style={{ flex: 1, minHeight: 0, background: "#0a0a0a" }}>
            <TradingChart candles={candles[pair.id]} currentPrice={currentPrice} positions={pairPositions} pair={pair.id} />
          </div>

          {/* Positions */}
          <div style={{ height: 220, minHeight: 170, borderTop: "1px solid rgba(255,255,255,0.04)", background: "#0d0d0d" }}>
            <PositionsPanel positions={positions} tradeHistory={tradeHistory} prices={prices} onClose={handleClose} />
          </div>
        </div>

        {/* RIGHT: Order Book + Order Form */}
        <div style={{ width: 310, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0, background: "#0b0b0b" }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <OrderBook price={currentPrice} pair={pair.id} rows={14} />
          </div>
          <div style={{ overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <OrderForm pair={pair} currentPrice={currentPrice} user={user} onSubmit={handleTrade} onLogin={() => setLoginOpen(true)} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { uid, calcPnl, calcLiqPrice, playSound } from "../utils/helpers.jsx";

export function useTrading(prices, setToast) {
  const [user, setUser] = useState(null);
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const posRef = useRef(positions);
  posRef.current = positions;

  // ─── TP / SL / LIQUIDATION ENGINE ───────────────────────────────────
  useEffect(() => {
    if (positions.length === 0) return;
    const toClose = [];
    
    positions.forEach(p => {
      const cp = prices[p.pair];
      if (!cp) return;
      
      // Liquidation
      if (p.side === "LONG" && cp <= p.liquidationPrice)
        toClose.push({ ...p, reason: "LIQUIDATED", exitPrice: p.liquidationPrice });
      else if (p.side === "SHORT" && cp >= p.liquidationPrice)
        toClose.push({ ...p, reason: "LIQUIDATED", exitPrice: p.liquidationPrice });
      // TP
      else if (p.takeProfit && p.side === "LONG" && cp >= p.takeProfit)
        toClose.push({ ...p, reason: "TP HIT", exitPrice: p.takeProfit });
      else if (p.takeProfit && p.side === "SHORT" && cp <= p.takeProfit)
        toClose.push({ ...p, reason: "TP HIT", exitPrice: p.takeProfit });
      // SL
      else if (p.stopLoss && p.side === "LONG" && cp <= p.stopLoss)
        toClose.push({ ...p, reason: "SL HIT", exitPrice: p.stopLoss });
      else if (p.stopLoss && p.side === "SHORT" && cp >= p.stopLoss)
        toClose.push({ ...p, reason: "SL HIT", exitPrice: p.stopLoss });
    });

    if (toClose.length === 0) return;

    const closeIds = new Set(toClose.map(p => p.id));
    let totalPnl = 0, totalMargin = 0;
    const hist = [];

    toClose.forEach(p => {
      const pnl = p.side === "LONG"
        ? ((p.exitPrice - p.entryPrice) / p.entryPrice) * p.size
        : ((p.entryPrice - p.exitPrice) / p.entryPrice) * p.size;
      const margin = p.size / p.leverage;
      
      // Liquidation returns nothing
      if (p.reason === "LIQUIDATED") {
        totalPnl -= margin; // lose the margin
      } else {
        totalPnl += pnl;
        totalMargin += margin;
      }

      hist.push({
        id: uid(), pair: p.pair, side: p.side,
        entryPrice: p.entryPrice, exitPrice: p.exitPrice,
        size: p.size, leverage: p.leverage,
        pnl: p.reason === "LIQUIDATED" ? -margin : pnl,
        timestamp: Date.now(), reason: p.reason,
      });
    });

    setPositions(prev => prev.filter(p => !closeIds.has(p.id)));
    setTradeHistory(prev => [...hist, ...prev]);
    if (user) {
      setUser(u => ({ ...u, balance: u.balance + totalMargin + totalPnl }));
    }

    const first = toClose[0];
    const msg = first.reason === "LIQUIDATED" ? `Liquidated ${first.pair}!` : `${first.reason}: ${first.pair}`;
    setToast({ msg, type: first.reason === "TP HIT" ? "success" : "error" });
    playSound(first.reason === "TP HIT" ? "success" : "error");
  }, [prices]);

  // ─── OPEN POSITION ──────────────────────────────────────────────────
  const openPosition = (pair, side, sizeMargin, leverage, entryPrice, marginMode, tp, sl) => {
    if (!user) return { error: "Not logged in" };
    if (sizeMargin <= 0) return { error: "Invalid size" };
    if (sizeMargin > user.balance) return { error: "Insufficient margin" };
    if (!entryPrice || entryPrice <= 0) return { error: "Invalid price" };

    // TP/SL validation
    if (side === "LONG") {
      if (tp && tp <= entryPrice) return { error: "TP must be above entry for longs" };
      if (sl && sl >= entryPrice) return { error: "SL must be below entry for longs" };
    } else {
      if (tp && tp >= entryPrice) return { error: "TP must be below entry for shorts" };
      if (sl && sl <= entryPrice) return { error: "SL must be above entry for shorts" };
    }

    const notional = sizeMargin * leverage;
    const liqPrice = calcLiqPrice(entryPrice, leverage, side);

    const pos = {
      id: uid(), pair, side, entryPrice,
      size: notional, leverage, marginMode,
      liquidationPrice: Math.max(0, liqPrice),
      takeProfit: tp || undefined,
      stopLoss: sl || undefined,
      timestamp: Date.now(),
    };

    setPositions(prev => [pos, ...prev]);
    setUser(u => ({ ...u, balance: u.balance - sizeMargin }));
    playSound("success");
    return { success: true, position: pos };
  };

  // ─── CLOSE POSITION ─────────────────────────────────────────────────
  const closePosition = (posId) => {
    const pos = posRef.current.find(p => p.id === posId);
    if (!pos) return;
    
    const cp = prices[pos.pair] || pos.entryPrice;
    const pnl = calcPnl(pos, cp);
    const margin = pos.size / pos.leverage;

    setPositions(prev => prev.filter(p => p.id !== posId));
    setUser(u => ({ ...u, balance: u.balance + margin + pnl }));
    setTradeHistory(prev => [{
      id: uid(), pair: pos.pair, side: pos.side,
      entryPrice: pos.entryPrice, exitPrice: cp,
      size: pos.size, leverage: pos.leverage,
      pnl, timestamp: Date.now(), reason: "MANUAL",
    }, ...prev]);

    playSound(pnl >= 0 ? "success" : "error");
    return pnl;
  };

  // ─── UPDATE TP/SL ───────────────────────────────────────────────────
  const updatePosition = (posId, tp, sl) => {
    setPositions(prev => prev.map(p => {
      if (p.id !== posId) return p;
      return { ...p, takeProfit: tp || undefined, stopLoss: sl || undefined };
    }));
  };

  // ─── LOGIN ──────────────────────────────────────────────────────────
  const login = (username) => {
    setUser({
      id: uid(), username,
      balance: 10000,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=3b82f6&color=fff&bold=true&size=64`,
    });
    playSound("success");
  };

  return {
    user, setUser, positions, tradeHistory,
    openPosition, closePosition, updatePosition, login,
  };
}

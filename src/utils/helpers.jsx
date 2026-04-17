// ─── FORMATTING ────────────────────────────────────────────────────────
export const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return "0.00";
  const abs = Math.abs(n);
  if (abs < 0.0001) return n.toFixed(8);
  if (abs < 0.01) return n.toFixed(6);
  if (abs < 1) return n.toFixed(4);
  if (abs < 100) return n.toFixed(3);
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
};

export const fmtCompact = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return fmt(n);
};

export const pnlColor = (v) => (v >= 0 ? "#10b981" : "#ef4444");
export const pnlSign = (v) => (v >= 0 ? "+" : "");
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ─── TRADING CALCULATIONS ──────────────────────────────────────────────
export const calcPnl = (pos, currentPrice) => {
  const cp = currentPrice || pos.entryPrice;
  return pos.side === "LONG"
    ? ((cp - pos.entryPrice) / pos.entryPrice) * pos.size
    : ((pos.entryPrice - cp) / pos.entryPrice) * pos.size;
};

export const calcLiqPrice = (entryPrice, leverage, side) => {
  const mm = 0.005; // maintenance margin
  return side === "LONG"
    ? entryPrice * (1 - 1 / leverage + mm)
    : entryPrice * (1 + 1 / leverage - mm);
};

export const calcRoe = (pnl, margin) => margin > 0 ? (pnl / margin) * 100 : 0;

export const riskLevel = (lev) => {
  if (lev <= 5) return { label: "LOW", color: "#10b981" };
  if (lev <= 20) return { label: "MEDIUM", color: "#f59e0b" };
  if (lev <= 50) return { label: "HIGH", color: "#ef4444" };
  return { label: "EXTREME", color: "#dc2626" };
};

// ─── INDICATOR CALCULATIONS ────────────────────────────────────────────
export const calcSMA = (data, period) => {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
};

export const calcEMA = (data, period) => {
  const k = 2 / (period + 1);
  const result = [];
  let ema = data.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  result.push({ time: data[period - 1].time, value: ema });
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
};

export const calcBollingerBands = (data, period = 20, stdDev = 2) => {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += Math.pow(data[i - j].close - mean, 2);
    const std = Math.sqrt(variance / period);
    result.push({
      time: data[i].time,
      middle: mean,
      upper: mean + stdDev * std,
      lower: mean - stdDev * std,
    });
  }
  return result;
};

// ─── CANDLE GENERATION ─────────────────────────────────────────────────
export const genCandles = (basePrice, count = 200) => {
  let p = basePrice * (0.97 + Math.random() * 0.06);
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * 900;
    const vol = p * (0.002 + Math.random() * 0.005);
    const c = p + (Math.random() - 0.5) * vol;
    const h = Math.max(p, c) + Math.random() * vol * 0.5;
    const l = Math.min(p, c) - Math.random() * vol * 0.5;
    candles.push({ time: t, open: p, high: h, low: l, close: c, volume: 10000 + Math.random() * 150000 });
    p = c;
  }
  return candles;
};

// ─── ORDER BOOK GENERATION ─────────────────────────────────────────────
export const genOrderBook = (midPrice, rows = 16) => {
  if (!midPrice || midPrice <= 0) return { asks: [], bids: [] };
  const spread = midPrice * 0.00012;
  const asks = [], bids = [];
  let cumAsk = 0, cumBid = 0;
  for (let i = 0; i < rows; i++) {
    const noise = 0.8 + Math.random() * 0.8;
    const step = spread * (1 + i * 0.5 + Math.random() * 0.2);
    const askSize = (100 + Math.random() * 2500 + i * 120) * noise;
    const bidSize = (100 + Math.random() * 2500 + i * 120) * noise;
    cumAsk += askSize;
    cumBid += bidSize;
    asks.push({ price: midPrice + step, size: askSize, total: cumAsk });
    bids.push({ price: midPrice - step, size: bidSize, total: cumBid });
  }
  return { asks: asks.reverse(), bids };
};

// ─── SOUND SERVICE ─────────────────────────────────────────────────────
export const playSound = (type) => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    if (type === "success") {
      osc.type = "sine"; osc.frequency.setValueAtTime(523, t);
      osc.frequency.exponentialRampToValueAtTime(659, t + 0.08);
      g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    } else if (type === "error") {
      osc.type = "triangle"; osc.frequency.setValueAtTime(150, t);
      osc.frequency.linearRampToValueAtTime(100, t + 0.12);
      g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    } else {
      osc.type = "sine"; osc.frequency.setValueAtTime(1100, t);
      g.gain.setValueAtTime(0.012, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.start(t); osc.stop(t + 0.04);
    }
  } catch (e) {}
};

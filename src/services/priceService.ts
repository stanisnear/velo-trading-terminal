import { PAIRS } from '../utils/types';

// ── Binance symbol map ────────────────────────────────────────────────────────
const BINANCE_SYMBOLS: Record<string, string> = {
  'BTC/USD':  'btcusdt',
  'ETH/USD':  'ethusdt',
  'SOL/USD':  'solusdt',
  'AVAX/USD': 'avaxusdt',
  'LINK/USD': 'linkusdt',
  'DOGE/USD': 'dogeusdt',
  'NEAR/USD': 'nearusdt',
  'INJ/USD':  'injusdt',
  'RNDR/USD': 'renderusdt',
  'TIA/USD':  'tiausdt',
  'WIF/USD':  'wifusdt',
  'JUP/USD':  'jupusdt',
  'BONK/USD': 'bonkusdt',
  'PEPE/USD': 'pepeusdt',
  'PYTH/USD': 'pythusdt',
};

// ── One-shot REST fetch (used on startup) ─────────────────────────────────────
export async function fetchRealPrices(): Promise<{
  prices: Record<string, number>;
  changes: Record<string, number>;
  status: string;
}> {
  try {
    const symbols = Object.values(BINANCE_SYMBOLS)
      .map(s => `"${s.toUpperCase()}"`)
      .join(',');

    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: Array<{ symbol: string; lastPrice: string; priceChangePercent: string }> =
      await res.json();

    const prices: Record<string, number> = {};
    const changes: Record<string, number> = {};

    for (const pair of PAIRS) {
      const binanceSymbol = (BINANCE_SYMBOLS[pair.id] || '').toUpperCase();
      const ticker = data.find(d => d.symbol === binanceSymbol);
      if (ticker) {
        prices[pair.id] = parseFloat(ticker.lastPrice);
        changes[pair.id] = parseFloat(ticker.priceChangePercent);
      }
    }

    return { prices, changes, status: 'live' };
  } catch (e) {
    console.warn('Binance REST fetch failed:', e);
    // Fallback to CoinGecko
    try {
      const geckoIds = PAIRS.map((p: any) => p.geckoId).filter(Boolean).join(',');
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const gecko = await res.json();
      const prices: Record<string, number> = {};
      const changes: Record<string, number> = {};
      for (const pair of PAIRS) {
        const id = (pair as any).geckoId;
        if (id && gecko[id]?.usd) {
          prices[pair.id] = gecko[id].usd;
          changes[pair.id] = gecko[id].usd_24h_change ?? 0;
        }
      }
      return { prices, changes, status: 'gecko' };
    } catch (e2) {
      console.warn('CoinGecko fallback also failed:', e2);
      return { prices: {}, changes: {}, status: 'error' };
    }
  }
}

// ── WebSocket manager — one persistent connection for all pairs ───────────────
type PriceCallback = (prices: Record<string, number>) => void;

class BinancePriceStream {
  private ws: WebSocket | null = null;
  private callbacks: Set<PriceCallback> = new Set();
  private latestPrices: Record<string, number> = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = false;

  private buildStreamUrl(): string {
    const streams = Object.values(BINANCE_SYMBOLS)
      .map(s => `${s}@miniTicker`)
      .join('/');
    return `wss://stream.binance.com:9443/stream?streams=${streams}`;
  }

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.alive = true;

    try {
      this.ws = new WebSocket(this.buildStreamUrl());

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Combined stream payload: { stream: "solusdt@miniTicker", data: { c: "price", s: "SOLUSDT" } }
          const ticker = msg.data || msg;
          if (!ticker?.s || !ticker?.c) return;

          const symbol = ticker.s.toLowerCase();
          const price = parseFloat(ticker.c);
          if (!price || isNaN(price)) return;

          // Map back to pair id
          for (const [pairId, binanceSym] of Object.entries(BINANCE_SYMBOLS)) {
            if (binanceSym === symbol) {
              this.latestPrices[pairId] = price;
              break;
            }
          }

          if (Object.keys(this.latestPrices).length > 0) {
            const snapshot = { ...this.latestPrices };
            this.callbacks.forEach(cb => cb(snapshot));
          }
        } catch (_) {}
      };

      this.ws.onerror = () => this.scheduleReconnect();
      this.ws.onclose = () => { if (this.alive) this.scheduleReconnect(); };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.alive) this.connect();
    }, 3000);
  }

  disconnect() {
    this.alive = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  subscribe(cb: PriceCallback): () => void {
    this.callbacks.add(cb);
    if (Object.keys(this.latestPrices).length > 0) cb({ ...this.latestPrices });
    return () => this.callbacks.delete(cb);
  }
}

// Singleton
export const binancePriceStream = new BinancePriceStream();

// ── Real OHLCV candle fetcher ─────────────────────────────────────────────────
// Maps our internal ChartTimeframe strings to Binance kline intervals + candle counts.
const TF_TO_BINANCE: Record<string, { interval: string; limit: number }> = {
  '1m':  { interval: '1m',  limit: 200 },
  '3m':  { interval: '3m',  limit: 200 },
  '5m':  { interval: '5m',  limit: 200 },
  '15m': { interval: '15m', limit: 200 },
  '30m': { interval: '30m', limit: 200 },
  '1H':  { interval: '1h',  limit: 200 },
  '2H':  { interval: '2h',  limit: 200 },
  '4H':  { interval: '4h',  limit: 200 },
  '6H':  { interval: '6h',  limit: 200 },
  '12H': { interval: '12h', limit: 200 },
  '1D':  { interval: '1d',  limit: 365 },
  '3D':  { interval: '3d',  limit: 200 },
  '1W':  { interval: '1w',  limit: 104 },
  '1M':  { interval: '1M',  limit: 60  },
};

export interface KlineCandle {
  time: number;   // Unix seconds (lightweight-charts format)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch real OHLCV candles from Binance for a given pair + timeframe.
 * Falls back to an empty array (chart will show nothing) rather than mock data.
 *
 * @param pairId   e.g. "ETH/USD"
 * @param tf       e.g. "1H", "4H", "1D"
 * @returns        Array of KlineCandle sorted oldest→newest
 */
export async function fetchKlines(pairId: string, tf = '1H'): Promise<KlineCandle[]> {
  const binanceSym = BINANCE_SYMBOLS[pairId];
  if (!binanceSym) return [];

  const { interval, limit } = TF_TO_BINANCE[tf] ?? TF_TO_BINANCE['1H'];

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSym.toUpperCase()}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: any[][] = await res.json();

    return raw.map(k => ({
      time:   Math.floor(Number(k[0]) / 1000), // ms → seconds
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    console.warn(`[velo] fetchKlines(${pairId}, ${tf}) failed:`, e);
    return [];
  }
}

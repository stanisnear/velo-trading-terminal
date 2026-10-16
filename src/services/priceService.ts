import { PAIRS } from '../utils/types';

// ── Binance symbol map ────────────────────────────────────────────────────────
const BINANCE_SYMBOLS: Record<string, string> = Object.fromEntries(
  PAIRS.filter(pair => pair.binance).map(pair => [pair.id, pair.binance!.toLowerCase()]),
);

// ── One-shot REST fetch (used on startup) ─────────────────────────────────────
export async function fetchRealPrices(): Promise<{
  prices: Record<string, number>;
  changes: Record<string, number>;
  status: string;
}> {
  const prices: Record<string, number> = {};
  const changes: Record<string, number> = {};
  let status = 'error';
  try {
    const symbols = Object.values(BINANCE_SYMBOLS)
      .map(s => `"${s.toUpperCase()}"`)
      .join(',');

    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`, { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: Array<{ symbol: string; lastPrice: string; priceChangePercent: string }> =
      await res.json();

    for (const pair of PAIRS) {
      const binanceSymbol = (BINANCE_SYMBOLS[pair.id] || '').toUpperCase();
      const ticker = data.find(d => d.symbol === binanceSymbol);
      if (ticker && Number(ticker.lastPrice) > 0 && Number.isFinite(Number(ticker.lastPrice))) {
        prices[pair.id] = parseFloat(ticker.lastPrice);
        changes[pair.id] = parseFloat(ticker.priceChangePercent);
      }
    }

    status = 'live';
  } catch (e) {
    console.warn('Binance REST fetch failed:', e);
  }
  // Several entitled feeds have no equivalent Binance spot pair. Fill those
  // independently without replacing a successful quote or inventing a price.
  const missing = PAIRS.filter(pair => !prices[pair.id]);
  if (missing.length) {
    try {
      const geckoIds = missing.map(p => p.geckoId).join(',');
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const gecko = await res.json();
      for (const pair of missing) {
        const id = pair.geckoId;
        if (Number.isFinite(gecko[id]?.usd) && gecko[id].usd > 0) {
          prices[pair.id] = gecko[id].usd;
          changes[pair.id] = gecko[id].usd_24h_change ?? 0;
        }
      }
      if (Object.keys(prices).length) status = status === 'live' ? 'mixed' : 'gecko';
    } catch (e2) {
      console.warn('CoinGecko fallback also failed:', e2);
    }
  }
  return { prices, changes, status };
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
// Binance returns at most 1,000 candles per request. Load a useful initial
// window, then the chart requests older pages as the user pans left.
const TF_TO_BINANCE: Record<string, { interval: string; history: number }> = {
  '1m':  { interval: '1m',  history: 2000 },
  '3m':  { interval: '3m',  history: 2000 },
  '5m':  { interval: '5m',  history: 2000 },
  '15m': { interval: '15m', history: 2000 },
  '30m': { interval: '30m', history: 2000 },
  '1H':  { interval: '1h',  history: 2000 },
  '2H':  { interval: '2h',  history: 2000 },
  '4H':  { interval: '4h',  history: 2000 },
  '6H':  { interval: '6h',  history: 2000 },
  '12H': { interval: '12h', history: 2000 },
  '1D':  { interval: '1d',  history: 2000 },
  '3D':  { interval: '3d',  history: 2000 },
  '1W':  { interval: '1w',  history: 520  },
  '1M':  { interval: '1M',  history: 120  },
};

const BINANCE_PAGE_LIMIT = 1000;

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
async function fetchBinancePage(symbol: string, interval: string, limit: number, endTime?: number): Promise<any[][]> {
  const params = new URLSearchParams({ symbol: symbol.toUpperCase(), interval, limit: String(limit) });
  if (endTime !== undefined) params.set('endTime', String(endTime));
  const res = await fetch(`https://api.binance.com/api/v3/klines?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseBinanceKlines(raw: any[][]): KlineCandle[] {
  return raw.map(k => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function fetchKlines(pairId: string, tf = '1H'): Promise<KlineCandle[]> {
  const binanceSym = BINANCE_SYMBOLS[pairId];
  if (!binanceSym) return [];

  const { interval, history: requestedHistory } = TF_TO_BINANCE[tf] ?? TF_TO_BINANCE['1H'];
  const history = Math.min(requestedHistory, 300);

  try {
    const pages: any[][] = [];
    let endTime: number | undefined;
    while (pages.length < history) {
      const limit = Math.min(BINANCE_PAGE_LIMIT, history - pages.length);
      const page = await fetchBinancePage(binanceSym, interval, limit, endTime);
      if (!page.length) break;
      pages.push(...page);
      if (page.length < limit) break;
      endTime = Number(page[0][0]) - 1;
    }
    return parseBinanceKlines(pages).sort((a, b) => a.time - b.time);
  } catch (e) {
    console.warn(`[velo] fetchKlines(${pairId}, ${tf}) failed:`, e);
    return [];
  }
}

export async function fetchKlinesBefore(pairId: string, tf: string, beforeTime: number): Promise<KlineCandle[]> {
  const binanceSym = BINANCE_SYMBOLS[pairId];
  if (!binanceSym || !Number.isFinite(beforeTime)) return [];
  const { interval } = TF_TO_BINANCE[tf] ?? TF_TO_BINANCE['1H'];
  try {
    const raw = await fetchBinancePage(binanceSym, interval, BINANCE_PAGE_LIMIT, Math.floor(beforeTime * 1000) - 1);
    return parseBinanceKlines(raw).sort((a, b) => a.time - b.time);
  } catch (e) {
    console.warn(`[velo] fetchKlinesBefore(${pairId}, ${tf}) failed:`, e);
    throw e;
  }
}

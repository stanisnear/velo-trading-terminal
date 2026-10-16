import { firstChartPage } from './firstChartPage.mjs';
import { MARKETS } from '../../shared/markets.mjs';
/**
 * pythPriceService — single source of truth for displayed prices.
 *
 * WHY THIS EXISTS
 * ---------------
 * VeloPerps settles every trade against the Pyth oracle on-chain: the entry
 * price stored on a position is the Pyth price at the moment the keeper
 * executed the transaction. Previously the UI showed Binance prices for the
 * mark price and the chart, while fills came from Pyth — so a position would
 * open at $81.41 (Pyth) while the ticker, chart, and fill notification showed
 * $81.52 (Binance). Two different oracles → a permanent, confusing gap.
 *
 * This service makes the *entire* UI read Pyth, the same feed the contract
 * settles on:
 *   • Live mark price  → Hermes SSE stream      (/v2/updates/price/stream)
 *   • Initial snapshot → Hermes latest REST     (/v2/updates/price/latest)
 *   • Chart candles    → authenticated Pyth OHLC history
 *
 * After this, entry / mark / chart all come from one oracle. The only
 * remaining difference is normal tick timing (your entry is locked at fill
 * time; the mark keeps ticking) — exactly how every real exchange behaves.
 *
 * Docs:
 *   https://docs.pyth.network/price-feeds/fetch-price-updates
 *   https://docs.pyth.network/price-feeds/pro/api-reference/history
 */

// Binance/CoinGecko are kept as a *fallback* price source. Pyth stays primary
// (it's what the contract settles on), but Hermes can be rate-limited, network-
// blocked, or blocked by an aggressive browser extension — and when it was the
// ONLY source the whole app went priceless. The fallback keeps prices flowing.
import { binancePriceStream, fetchKlines, fetchKlinesBefore, fetchRealPrices } from './priceService';
import { fetchPyth, PythEventStream } from './pythConnection';

const HERMES_URL = '/api/pyth';

// ── pair id → Pyth feed id ────────────────────────────────────────────────────
// Verified against https://hermes.pyth.network/v2/price_feeds (crypto, USD quote).
// These are chain-independent — the same ids work everywhere Pyth is deployed.
// Only feeds entitled to the configured Pyth account belong in batch requests.
export const PAIR_TO_PYTH_FEED: Record<string, string> = Object.fromEntries(MARKETS.map(market => [market.id, '0x' + market.feed]));

// Reverse lookup: bare feed id (lowercase, no 0x) → pair id. Built once.
const FEED_TO_PAIR: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [pair, feed] of Object.entries(PAIR_TO_PYTH_FEED)) {
    const bare = feed.replace(/^0x/, '').toLowerCase();
    if (!(bare in m)) m[bare] = pair;
  }
  return m;
})();

const ALL_FEED_IDS = [...new Set(Object.values(PAIR_TO_PYTH_FEED).map(f => f.replace(/^0x/, '').toLowerCase()))];

/** Benchmarks TradingView symbol for a pair (e.g. "SOL/USD" → "Crypto.SOL/USD"). */
function benchmarksSymbol(pairId: string): string | null {
  if (!PAIR_TO_PYTH_FEED[pairId]) return null;
  let base = pairId.split('/')[0].toUpperCase();
  if (base === 'RNDR') base = 'RENDER'; // Pyth lists it as RENDER
  return `Crypto.${base}/USD`;
}

function parsedToPrice(p: { price: string | number; expo: number }): number {
  return Number(p.price) * Math.pow(10, Number(p.expo));
}

// ── REST snapshot (used on startup + 30s fallback poll) ───────────────────────
export async function fetchPythPrices(): Promise<{
  prices: Record<string, number>;
  status: string;
}> {
  try {
    const params = new URLSearchParams();
    for (const id of ALL_FEED_IDS) params.append('ids[]', id);
    params.set('parsed', 'true');

    const res = await fetchPyth(`${HERMES_URL}/v2/updates/price/latest?${params.toString()}`);
    if (!res.ok) throw new Error(`Hermes ${res.status}`);
    const data = await res.json();

    const prices: Record<string, number> = {};
    for (const entry of (data?.parsed ?? [])) {
      const bare = String(entry.id).replace(/^0x/, '').toLowerCase();
      const pair = FEED_TO_PAIR[bare];
      const priceObj = entry?.price;
      if (!pair || !priceObj) continue;
      const px = parsedToPrice(priceObj);
      const age = Date.now() / 1000 - Number(priceObj.publish_time);
      if (Number.isFinite(px) && px > 0 && age >= -5 && age <= 60) prices[pair] = px;
    }
    return { prices, status: 'pyth' };
  } catch (e) {
    console.warn('[velo] fetchPythPrices failed:', e);
    return { prices: {}, status: 'error' };
  }
}

/**
 * Resilient price snapshot. Tries Pyth first (consistent with on-chain fills),
 * then fills any missing pairs from the Binance/CoinGecko REST source so the UI
 * is never left without prices when Hermes is unreachable. Returns the merged
 * map plus the 24h change map (which only the fallback source provides).
 */
export async function fetchPricesResilient(): Promise<{
  prices: Record<string, number>;
  changes: Record<string, number>;
  status: string;
}> {
  const [pyth, fallback] = await Promise.all([
    fetchPythPrices(),
    fetchRealPrices().catch(() => ({ prices: {} as Record<string, number>, changes: {} as Record<string, number>, status: 'error' })),
  ]);
  // Pyth wins per-pair; Binance/CoinGecko fills the gaps.
  const prices: Record<string, number> = { ...(fallback.prices || {}), ...pyth.prices };
  const status = Object.keys(pyth.prices).length > 0
    ? (Object.keys(fallback.prices || {}).length > 0 ? 'pyth+fallback' : 'pyth')
    : 'fallback';
  return { prices, changes: fallback.changes || {}, status };
}

// ── Live SSE stream — mirrors the binancePriceStream interface ────────────────
type PriceCallback = (prices: Record<string, number>) => void;

class PythPriceStream {
  private es: PythEventStream | null = null;
  private callbacks: Set<PriceCallback> = new Set();
  // Real Pyth oracle metadata per pair (confidence band + publish time).
  private latestMeta: Record<string, { conf: number; publishTime: number }> = {};
  private latestPrices: Record<string, number> = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = false;
  private failCount = 0;
  private lastTickAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private fallbackUnsub: (() => void) | null = null;

  // After repeated failures, keep the display fallback and retry every 30s.
  // This also recovers when a visitor signs in after opening the terminal.
  private static MAX_SSE_FAILS = 4;

  private buildStreamUrl(): string {
    const params = new URLSearchParams();
    for (const id of ALL_FEED_IDS) params.append('ids[]', id);
    params.set('parsed', 'true');
    params.set('allow_unordered', 'true'); // lower latency; we only read the latest tick
    return `${HERMES_URL}/v2/updates/price/stream?${params.toString()}`;
  }

  private emit() {
    const snapshot = { ...this.latestPrices };
    this.callbacks.forEach(cb => cb(snapshot));
  }

  // Binance fallback: only runs when Pyth has gone silent. Pyth ticks take over
  // again as soon as they resume, so a healthy Pyth connection never mixes in
  // Binance prices (which is what kept mark/chart/fills consistent).
  private startFallback() {
    if (this.fallbackUnsub) return;
    binancePriceStream.connect();
    this.fallbackUnsub = binancePriceStream.subscribe(prices => {
      let changed = false;
      for (const [pair, px] of Object.entries(prices)) {
        if (px > 0 && this.latestPrices[pair] !== px) { this.latestPrices[pair] = px; changed = true; }
      }
      if (changed) this.emit();
    });
  }
  private stopFallback() {
    if (this.fallbackUnsub) { this.fallbackUnsub(); this.fallbackUnsub = null; }
    try { binancePriceStream.disconnect(); } catch (_) {}
  }

  connect() {
    if (typeof window === 'undefined') return;
    if (this.es && this.es.readyState !== 2) return;
    this.alive = true;

    // Watchdog: if no Pyth tick for >8s, bring up the Binance fallback; once Pyth
    // resumes, drop it again.
    if (!this.watchdog) {
      this.watchdog = setInterval(() => {
        if (!this.alive) return;
        const silent = Date.now() - this.lastTickAt > 8000;
        if (silent && !this.fallbackUnsub) this.startFallback();
        else if (!silent && this.fallbackUnsub) this.stopFallback();
      }, 4000);
    }

    try {
      this.es = new PythEventStream(this.buildStreamUrl());

      this.es.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          const parsed = msg?.parsed;
          if (!Array.isArray(parsed) || parsed.length === 0) return;

          this.failCount = 0;
          this.lastTickAt = Date.now();
          if (this.fallbackUnsub) this.stopFallback(); // Pyth is back — take over

          let changed = false;
          for (const entry of parsed) {
            const bare = String(entry.id).replace(/^0x/, '').toLowerCase();
            const pair = FEED_TO_PAIR[bare];
            const priceObj = entry?.price;
            if (!pair || !priceObj) continue;
            const px = parsedToPrice(priceObj);
            // Capture the REAL oracle metadata Pyth publishes alongside price:
            // the confidence interval (oracle's own ± uncertainty band) and the
            // publish timestamp. These drive the honest oracle-depth panel.
            const expo = Number(priceObj.expo) || 0;
            const conf = priceObj.conf != null ? Number(priceObj.conf) * Math.pow(10, expo) : 0;
            const pub  = Number(priceObj.publish_time) || 0;
            if (px > 0) {
              this.latestMeta[pair] = { conf, publishTime: pub };
              if (this.latestPrices[pair] !== px) { this.latestPrices[pair] = px; changed = true; }
            }
          }
          if (changed) this.emit();
        } catch (_) { /* malformed frame — skip */ }
      };

      this.es.onerror = () => {
        if (this.es && this.es.readyState === 2) this.scheduleReconnect();
      };
    } catch (_) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.alive) return;
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
    this.failCount++;
    // Back off after failures while retaining recovery after a later sign-in.
    if (this.failCount >= PythPriceStream.MAX_SSE_FAILS) {
      this.startFallback();
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.alive) this.connect();
    }, this.failCount >= PythPriceStream.MAX_SSE_FAILS ? 30000 : 3000);
  }

  disconnect() {
    this.alive = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    this.stopFallback();
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
  }

  /** Real oracle metadata for a pair: confidence interval (± band, in quote
   *  units) and publish_time (epoch seconds). Empty until the first tick. */
  getMeta(pair: string): { conf: number; publishTime: number } | null {
    return this.latestMeta[pair] || null;
  }

  subscribe(cb: PriceCallback): () => void {
    this.callbacks.add(cb);
    if (Object.keys(this.latestPrices).length > 0) cb({ ...this.latestPrices });
    return () => this.callbacks.delete(cb);
  }
}

export const pythPriceStream = new PythPriceStream();

// ── Pyth Benchmarks OHLC candles ──────────────────────────────────────────────
export interface KlineCandle {
  time: number;   // Unix seconds (lightweight-charts format)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Pyth is an oracle, not an exchange — volume is always 0
  source?: 'pyth' | 'exchange';
}

// Velo timeframe → Benchmarks resolution. Unsupported 3m/3D intervals use
// 1m/daily source candles and are aggregated into the exact requested bars.
const TF_TO_BENCHMARKS: Record<string, string> = {
  '1m': '1', '3m': '1', '5m': '5', '15m': '15', '30m': '30',
  '1H': '60', '2H': '120', '4H': '240', '6H': '360', '12H': '720',
  '1D': 'D', '3D': 'D', '1W': 'W', '1M': 'M',
};

const RESOLUTION_SECONDS: Record<string, number> = {
  '1': 60, '2': 120, '5': 300, '15': 900, '30': 1800,
  '60': 3600, '120': 7200, '240': 14400, '360': 21600, '720': 43200,
  'D': 86400, 'W': 604800, 'M': 2592000,
};

const PYTH_PAGE_CANDLES = 500;
const INITIAL_HISTORY_CANDLES = 300;
const PYTH_MAX_HISTORY_SECONDS = 5 * 366 * 24 * 60 * 60;

function parsePythHistory(data: any): KlineCandle[] {
  if (data?.s !== 'ok' || !Array.isArray(data.t)) return [];
  const parsed: KlineCandle[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const rawTime = Number(data.t[i]);
    const close = Number(data.c[i]);
    if (!Number.isFinite(rawTime) || !Number.isFinite(close) || close <= 0) continue;
    parsed.push({
      time: Math.floor(rawTime > 1e12 ? rawTime / 1000 : rawTime),
      open: Number.isFinite(Number(data.o[i])) ? Number(data.o[i]) : close,
      high: Number.isFinite(Number(data.h[i])) ? Number(data.h[i]) : close,
      low: Number.isFinite(Number(data.l[i])) ? Number(data.l[i]) : close,
      close,
      volume: Array.isArray(data.v) && Number.isFinite(Number(data.v[i])) ? Number(data.v[i]) : 0,
      source: 'pyth',
    });
  }
  return parsed;
}

async function fetchPythHistoryRange(symbol: string, resolution: string, from: number, to: number): Promise<KlineCandle[]> {
  const url = '/api/pyth/history'
    + `?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`;
  const res = await fetchPyth(url, AbortSignal.timeout(8000));
  if (!res.ok) throw new Error(`Benchmarks ${res.status}`);
  return parsePythHistory(await res.json());
}

function aggregateCandles(candles: KlineCandle[], targetSeconds: number): KlineCandle[] {
  if (!candles.length || !targetSeconds) return [];
  const grouped = new Map<number, KlineCandle[]>();
  for (const candle of candles) {
    const bucket = Math.floor(candle.time / targetSeconds) * targetSeconds;
    const group = grouped.get(bucket);
    if (group) group.push(candle);
    else grouped.set(bucket, [candle]);
  }
  return [...grouped.entries()].map(([time, group]) => ({
    time,
    open: group[0].open,
    high: Math.max(...group.map(candle => candle.high)),
    low: Math.min(...group.map(candle => candle.low)),
    close: group[group.length - 1].close,
    volume: 0,
    source: 'pyth' as const,
  })).sort((a, b) => a.time - b.time);
}

function pythHistoryConfig(tf: string) {
  const resolution = TF_TO_BENCHMARKS[tf] ?? '60';
  const sourceSeconds = RESOLUTION_SECONDS[resolution] ?? 3600;
  const targetSeconds = tf === '3m' ? 180 : tf === '3D' ? 259200 : sourceSeconds;
  const barsPerTarget = Math.max(1, targetSeconds / sourceSeconds);
  const pageCandles = Math.floor(PYTH_PAGE_CANDLES / barsPerTarget) * barsPerTarget;
  return { resolution, sourceSeconds, targetSeconds, barsPerTarget, pageCandles };
}

/**
 * Fetch real OHLC candles from Pyth Benchmarks for a pair + timeframe.
 * Same return shape as the old Binance fetchKlines so it is a drop-in swap.
 * Uses the authenticated oracle history when available, then falls back to
 * real public exchange candles for signed-out/unavailable states. The caller
 * can label the source so exchange candles are never mistaken for the mark.
 */
const historyCache = new Map<string, { at: number; rows: KlineCandle[] }>();
const historyRequests = new Map<string, Promise<KlineCandle[]>>();
export async function fetchPythKlines(pairId: string, tf = '1H', options: { authenticated?: boolean; force?: boolean } = {}): Promise<KlineCandle[]> {
  const key = `${pairId}:${tf}:${options.authenticated !== false}`;
  const cached = historyCache.get(key);
  if (!options.force && cached && Date.now() - cached.at < 30000) return cached.rows;
  if (historyRequests.has(key)) return historyRequests.get(key)!;
  const fallback = async () => (await fetchKlines(pairId, tf)).map(c => ({ ...c, source: 'exchange' as const }));
  const primary = async () => {
    const symbol = benchmarksSymbol(pairId);
    if (!symbol) return [];
    const { resolution, sourceSeconds, targetSeconds, barsPerTarget } = pythHistoryConfig(tf);
    const to = Math.floor(Date.now() / 1000);
    const count = Math.floor(Math.min(INITIAL_HISTORY_CANDLES, PYTH_MAX_HISTORY_SECONDS / sourceSeconds - 1) / barsPerTarget) * barsPerTarget;
    if (count < 1) return [];
    const rows = await fetchPythHistoryRange(symbol, resolution, to - sourceSeconds * count, to);
    const unique = [...new Map(rows.map(c => [c.time, c])).values()].sort((a,b) => a.time-b.time);
    return targetSeconds > sourceSeconds ? aggregateCandles(unique, targetSeconds) : unique;
  };
  const request = (options.authenticated === false ? fallback() : firstChartPage(primary, fallback))
    .then(rows => {
      if (rows.length) {
        if (historyCache.size >= 32) historyCache.delete(historyCache.keys().next().value!);
        historyCache.set(key, { at: Date.now(), rows });
      }
      return rows;
    }).finally(() => historyRequests.delete(key));
  historyRequests.set(key, request);
  return request;
}

export async function fetchOlderPythKlines(
  pairId: string,
  tf: string,
  beforeTime: number,
  source: 'pyth' | 'exchange' = 'pyth',
): Promise<KlineCandle[]> {
  if (source === 'exchange') {
    const fallback = await fetchKlinesBefore(pairId, tf, beforeTime);
    return fallback.map(candle => ({ ...candle, source: 'exchange' as const }));
  }
  const symbol = benchmarksSymbol(pairId);
  if (!symbol || !Number.isFinite(beforeTime)) return [];
  const { resolution, sourceSeconds, targetSeconds, pageCandles } = pythHistoryConfig(tf);
  const to = Math.floor(beforeTime / targetSeconds) * targetSeconds - 1;
  const historyFloor = Math.floor(Date.now() / 1000) - PYTH_MAX_HISTORY_SECONDS;
  const from = Math.max(historyFloor, to - sourceSeconds * pageCandles);
  if (from >= to) return [];
  try {
    const sourceCandles = await fetchPythHistoryRange(symbol, resolution, from, to);
    return targetSeconds > sourceSeconds ? aggregateCandles(sourceCandles, targetSeconds) : sourceCandles;
  } catch (e) {
    console.warn(`[velo] fetchOlderPythKlines(${pairId}, ${tf}) failed:`, e);
    throw e;
  }
}

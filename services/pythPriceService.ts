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
 *   • Chart candles    → Pyth Benchmarks shim   (/v1/shims/tradingview/history)
 *
 * After this, entry / mark / chart all come from one oracle. The only
 * remaining difference is normal tick timing (your entry is locked at fill
 * time; the mark keeps ticking) — exactly how every real exchange behaves.
 *
 * Docs:
 *   https://docs.pyth.network/price-feeds/fetch-price-updates
 *   https://benchmarks.pyth.network  (TradingView-compatible OHLC shim)
 */

// Binance/CoinGecko are kept as a *fallback* price source. Pyth stays primary
// (it's what the contract settles on), but Hermes can be rate-limited, network-
// blocked, or blocked by an aggressive browser extension — and when it was the
// ONLY source the whole app went priceless. The fallback keeps prices flowing.
import { binancePriceStream, fetchRealPrices } from './priceService';

const HERMES_URL = import.meta.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';
const BENCHMARKS_URL = import.meta.env.VITE_PYTH_BENCHMARKS_URL || 'https://benchmarks.pyth.network';

// ── pair id → Pyth feed id ────────────────────────────────────────────────────
// Verified against https://hermes.pyth.network/v2/price_feeds (crypto, USD quote).
// These are chain-independent — the same ids work everywhere Pyth is deployed.
// The first 17 mirror the on-chain VeloPerps registry exactly; the remainder
// cover the broader display/markets list so every visible pair is Pyth-priced.
export const PAIR_TO_PYTH_FEED: Record<string, string> = {
  'BTC/USD':    '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH/USD':    '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL/USD':    '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'AVAX/USD':   '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  'LINK/USD':   '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  'DOGE/USD':   '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  'NEAR/USD':   '0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750',
  'INJ/USD':    '0x7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592',
  'APT/USD':    '0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5',
  'ARB/USD':    '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
  'OP/USD':     '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf',
  'SUI/USD':    '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
  'TIA/USD':    '0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723',
  'SEI/USD':    '0x53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb',
  'RENDER/USD': '0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d',
  'WLFI/USD':   '0xd41369178d64f41d51ca95465c144a2c74d2fff30be69164835911943fa64c3e',
  'POL/USD':    '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472',
  // Display-only (not yet on-chain) pairs from the broad PAIRS list:
  'RNDR/USD':   '0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d', // alias of RENDER
  'WIF/USD':    '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  'JUP/USD':    '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  'BONK/USD':   '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
  'PEPE/USD':   '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  'PYTH/USD':   '0x0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff',
};

// Reverse lookup: bare feed id (lowercase, no 0x) → pair id. Built once.
const FEED_TO_PAIR: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [pair, feed] of Object.entries(PAIR_TO_PYTH_FEED)) {
    // When two pairs share a feed (RENDER/RNDR), keep the canonical on-chain id.
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

    const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params.toString()}`);
    if (!res.ok) throw new Error(`Hermes ${res.status}`);
    const data = await res.json();

    const prices: Record<string, number> = {};
    for (const entry of (data?.parsed ?? [])) {
      const bare = String(entry.id).replace(/^0x/, '').toLowerCase();
      const pair = FEED_TO_PAIR[bare];
      const priceObj = entry?.price;
      if (!pair || !priceObj) continue;
      const px = parsedToPrice(priceObj);
      if (px > 0) prices[pair] = px;
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
  private es: EventSource | null = null;
  private callbacks: Set<PriceCallback> = new Set();
  private latestPrices: Record<string, number> = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = false;
  private failCount = 0;
  private lastTickAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private fallbackUnsub: (() => void) | null = null;

  // After this many consecutive failed SSE connects we stop hammering Hermes and
  // lean on the Binance fallback + the 30s REST poll instead (avoids console spam
  // and wasted retries when the stream is blocked in this environment).
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
    if (typeof EventSource === 'undefined') { this.startFallback(); return; } // SSR / unsupported
    if (this.es && this.es.readyState !== EventSource.CLOSED) return;
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
      this.es = new EventSource(this.buildStreamUrl());

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
            if (px > 0 && this.latestPrices[pair] !== px) {
              this.latestPrices[pair] = px;
              changed = true;
            }
          }
          if (changed) this.emit();
        } catch (_) { /* malformed frame — skip */ }
      };

      this.es.onerror = () => {
        if (this.es && this.es.readyState === EventSource.CLOSED) this.scheduleReconnect();
      };
    } catch (_) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.alive) return;
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
    this.failCount++;
    // Give up on the SSE after a few failures and rely on the fallback + REST poll.
    if (this.failCount >= PythPriceStream.MAX_SSE_FAILS) {
      this.startFallback();
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.alive) this.connect();
    }, 3000);
  }

  disconnect() {
    this.alive = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    this.stopFallback();
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
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
}

// Velo timeframe → Benchmarks resolution. Benchmarks supports the intraday
// multipliers 1,2,5,15,30,60,120,240,360,720 plus D/W/M. Velo's 3m and 3D have
// no exact Pyth equivalent, so they fall back to the nearest finer resolution.
const TF_TO_BENCHMARKS: Record<string, string> = {
  '1m': '1', '3m': '5', '5m': '5', '15m': '15', '30m': '30',
  '1H': '60', '2H': '120', '4H': '240', '6H': '360', '12H': '720',
  '1D': 'D', '3D': 'D', '1W': 'W', '1M': 'M',
};

const RESOLUTION_SECONDS: Record<string, number> = {
  '1': 60, '2': 120, '5': 300, '15': 900, '30': 1800,
  '60': 3600, '120': 7200, '240': 14400, '360': 21600, '720': 43200,
  'D': 86400, 'W': 604800, 'M': 2592000,
};

/**
 * Fetch real OHLC candles from Pyth Benchmarks for a pair + timeframe.
 * Same return shape as the old Binance fetchKlines so it is a drop-in swap.
 * Returns [] on failure (chart simply shows nothing rather than mock data).
 */
export async function fetchPythKlines(pairId: string, tf = '1H'): Promise<KlineCandle[]> {
  const symbol = benchmarksSymbol(pairId);
  if (!symbol) return [];

  const resolution = TF_TO_BENCHMARKS[tf] ?? '60';
  const secs = RESOLUTION_SECONDS[resolution] ?? 3600;
  // Bars to request: ~300 intraday, more headroom for coarse frames.
  const count = resolution === 'D' ? 365 : resolution === 'W' ? 104 : resolution === 'M' ? 60 : 300;
  const to = Math.floor(Date.now() / 1000);
  const from = to - secs * count;

  try {
    const url = `${BENCHMARKS_URL}/v1/shims/tradingview/history`
      + `?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Benchmarks ${res.status}`);
    const d = await res.json();
    if (d?.s !== 'ok' || !Array.isArray(d.t)) return [];

    const out: KlineCandle[] = [];
    for (let i = 0; i < d.t.length; i++) {
      const open = Number(d.o[i]);
      const high = Number(d.h[i]);
      const low = Number(d.l[i]);
      const close = Number(d.c[i]);
      if (!Number.isFinite(close) || close <= 0) continue;
      out.push({
        time: Number(d.t[i]),
        open: Number.isFinite(open) ? open : close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
        close,
        volume: Array.isArray(d.v) && Number.isFinite(Number(d.v[i])) ? Number(d.v[i]) : 0,
      });
    }
    return out;
  } catch (e) {
    console.warn(`[velo] fetchPythKlines(${pairId}, ${tf}) failed:`, e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Orderly Network — Real orderbook WebSocket stream
// Public endpoint — no auth required for market data.
// wss://testnet-ws-evm.orderly.org/ws/stream/{account_id}
// For public data we use a static sentinel account ID path.
// ═══════════════════════════════════════════════════════════════════════════════

import { ORDERLY_SYMBOL_MAP } from './orderlyService';

export const ORDERLY_WS_PUBLIC = 'wss://testnet-ws-evm.orderly.org/ws/stream';

// Static public stream ID — Orderly accepts any string for public-only subscriptions
const PUBLIC_STREAM_ID = '0x0000000000000000000000000000000000000000000000000000000000000000';

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookSnapshot {
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  ts: number;
}

type OrderbookCallback = (snap: OrderbookSnapshot) => void;

export class OrderlyOrderbookStream {
  private ws: WebSocket | null = null;
  private symbol: string = '';
  private cb: OrderbookCallback;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private snapshot: OrderbookSnapshot = { asks: [], bids: [], ts: 0 };
  private connected = false;

  constructor(cb: OrderbookCallback) {
    this.cb = cb;
  }

  subscribe(veloPair: string) {
    const orderlySymbol = ORDERLY_SYMBOL_MAP[veloPair];
    if (!orderlySymbol) return;
    if (this.symbol === orderlySymbol && this.connected) return;
    this.symbol = orderlySymbol;
    this.snapshot = { asks: [], bids: [], ts: 0 };
    this._connect();
  }

  destroy() {
    this.destroyed = true;
    this._clearTimers();
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  private _clearTimers() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
  }

  private _connect() {
    this._clearTimers();
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.destroyed) return;

    const url = `${ORDERLY_WS_PUBLIC}/${PUBLIC_STREAM_ID}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.connected = false;

    ws.onopen = () => {
      if (this.destroyed || ws !== this.ws) return;
      this.connected = true;
      // Subscribe to orderbook snapshot + update topic
      ws.send(JSON.stringify({
        id:    'ob_sub',
        event: 'subscribe',
        topic: `${this.symbol}@orderbook`,
      }));
      // Keepalive ping every 10s
      this.pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'ping' }));
        }
      }, 10_000);
    };

    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.event === 'pong') return;

        // Orderly sends { topic, ts, data: { asks: [[price,size],...], bids: [...] } }
        if (msg.data && Array.isArray(msg.data.asks) && Array.isArray(msg.data.bids)) {
          const asks: OrderbookLevel[] = msg.data.asks.map(([price, size]: [number, number]) => ({ price, size }));
          const bids: OrderbookLevel[] = msg.data.bids.map(([price, size]: [number, number]) => ({ price, size }));
          // Asks: ascending (lowest ask first). Bids: descending (highest bid first).
          asks.sort((a, b) => a.price - b.price);
          bids.sort((a, b) => b.price - a.price);
          this.snapshot = { asks, bids, ts: msg.ts || Date.now() };
          this.cb(this.snapshot);
        }
      } catch {}
    };

    ws.onerror = () => {
      this.connected = false;
    };

    ws.onclose = () => {
      if (this.destroyed || ws !== this.ws) return;
      this.connected = false;
      this._scheduleReconnect();
    };
  }

  private _scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectTimeout = setTimeout(() => {
      if (!this.destroyed) this._connect();
    }, 3000);
  }

  // Update the symbol without full reconnect — just resubscribe
  changeSymbol(veloPair: string) {
    const orderlySymbol = ORDERLY_SYMBOL_MAP[veloPair];
    if (!orderlySymbol || orderlySymbol === this.symbol) return;
    if (this.ws && this.connected && this.symbol) {
      // Unsubscribe old
      try {
        this.ws.send(JSON.stringify({
          id:    'ob_unsub',
          event: 'unsubscribe',
          topic: `${this.symbol}@orderbook`,
        }));
      } catch {}
    }
    this.symbol = orderlySymbol;
    this.snapshot = { asks: [], bids: [], ts: 0 };
    if (this.ws && this.connected) {
      try {
        this.ws.send(JSON.stringify({
          id:    'ob_sub',
          event: 'subscribe',
          topic: `${this.symbol}@orderbook`,
        }));
      } catch {
        this._connect();
      }
    } else {
      this._connect();
    }
  }
}

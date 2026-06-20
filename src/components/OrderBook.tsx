import React, { useMemo, useState, useEffect, useRef } from 'react';
import { supabase } from '@/services/supabaseStore';

/**
 * Velo order flow — a live, Binance-style tape of REAL Velo fills + a depth
 * ladder aggregated from that same real activity.
 *
 * Velo is oracle-settled (no maker book), so rather than fake bid/ask depth we
 * surface the genuine thing: every long/short that actually fills on Velo,
 * streamed live from `trade_history` via Supabase realtime. New fills flash in
 * at the top like a CEX trades tape; the Depth view buckets recent fills by
 * price so you can see where flow is clustering. Nothing here is simulated —
 * empty states show honestly until real trades arrive.
 */

interface OrderBookProps {
  price: number;
  pair: string;
  rows?: number;
}

interface Fill {
  id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  price: number;
  size: number;        // base units
  action: string;      // OPEN | CLOSE | LIQUIDATION
  ts: number;          // epoch ms
  flash?: boolean;     // animate on arrival
}

function fmtPrice(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(6);
}
function fmtSize(v: number): string {
  if (!isFinite(v)) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}
function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// A Velo fill is a "buy" (green) if it's a long open or a short close (buying to
// cover); a "sell" (red) if a short open or a long close. Liquidations count as
// forced closes on the side that was holding.
function isBuy(f: Fill): boolean {
  const closing = f.action === 'CLOSE' || f.action === 'LIQUIDATION';
  return closing ? f.side === 'SHORT' : f.side === 'LONG';
}

function rowToFill(r: any, flash = false): Fill | null {
  if (!r) return null;
  const closing = r.action === 'CLOSE' || r.action === 'LIQUIDATION';
  const price = Number(closing ? (r.exit_price ?? r.entry_price) : r.entry_price);
  const size = Number(r.size);
  if (!price || price <= 0 || !size || size <= 0) return null;
  return {
    id: String(r.id),
    pair: r.pair,
    side: (r.side === 'SHORT' ? 'SHORT' : 'LONG'),
    price,
    size: size / price,             // store stores notional USD in `size`; convert to base units
    action: r.action || 'OPEN',
    ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    flash,
  };
}

export const OrderBook: React.FC<OrderBookProps> = ({ price, pair }) => {
  const [view, setView] = useState<'trades' | 'depth'>('trades');
  const [fills, setFills] = useState<Fill[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  // Load recent real fills for this pair + subscribe to new ones live.
  useEffect(() => {
    let active = true;
    seen.current = new Set();
    setLoading(true);
    setFills([]);

    (async () => {
      const { data } = await supabase
        .from('trade_history')
        .select('id,pair,side,entry_price,exit_price,size,action,created_at')
        .eq('pair', pair)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!active) return;
      const mapped = (data || []).map((r: any) => rowToFill(r)).filter(Boolean) as Fill[];
      mapped.forEach(f => seen.current.add(f.id));
      setFills(mapped);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`fills_${pair}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_history', filter: `pair=eq.${pair}` }, (payload: any) => {
        const f = rowToFill(payload.new, true);
        if (!f || seen.current.has(f.id)) return;
        seen.current.add(f.id);
        setFills(prev => [f, ...prev].slice(0, 60));
        // clear the flash flag shortly after so the animation can re-trigger
        setTimeout(() => setFills(prev => prev.map(x => x.id === f.id ? { ...x, flash: false } : x)), 700);
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [pair]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Depth: bucket recent fills by price into bids (buys) / asks (sells).
  const depth = useMemo(() => {
    if (fills.length === 0) return { bids: [] as any[], asks: [] as any[], max: 1 };
    const tick = price >= 1000 ? 1 : price >= 100 ? 0.1 : price >= 1 ? 0.01 : 0.0001;
    const bucket = (p: number) => Math.round(p / tick) * tick;
    const bidMap = new Map<number, number>();
    const askMap = new Map<number, number>();
    for (const f of fills) {
      const b = bucket(f.price);
      const m = isBuy(f) ? bidMap : askMap;
      m.set(b, (m.get(b) || 0) + f.size);
    }
    const bids = [...bidMap.entries()].map(([p, s]) => ({ price: p, size: s }))
      .filter(x => x.price <= price).sort((a, b) => b.price - a.price).slice(0, 8);
    const asks = [...askMap.entries()].map(([p, s]) => ({ price: p, size: s }))
      .filter(x => x.price >= price).sort((a, b) => a.price - b.price).slice(0, 8);
    let cb = 0, ca = 0;
    bids.forEach(b => { cb += b.size; (b as any).total = cb; });
    asks.forEach(a => { ca += a.size; (a as any).total = ca; });
    const max = Math.max(cb, ca, 1);
    return { bids, asks: asks.reverse(), max };
  }, [fills, price]);

  const Tabs = (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {(['trades', 'depth'] as const).map(v => (
        <button key={v} onClick={() => setView(v)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: view === v ? 'var(--fg)' : 'var(--fg-subtle)',
          borderBottom: view === v ? '1.5px solid var(--iris-violet, #8b7cf6)' : '1.5px solid transparent',
        }}>{v === 'trades' ? 'Trades' : 'Depth'}</button>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', fontFamily: 'var(--font-mono)', userSelect: 'none', overflow: 'hidden', background: 'var(--bg-base-2)' }}>
      <style>{`@keyframes veloFillFlashBuy{0%{background:rgba(62,207,142,0.28)}100%{background:transparent}}@keyframes veloFillFlashSell{0%{background:rgba(255,80,80,0.28)}100%{background:transparent}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        {Tabs}
        <span style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{pair}</span>
      </div>

      {/* Column header */}
      <div style={{ display: 'flex', color: 'var(--fg-subtle)', padding: '5px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0, fontWeight: 700 }}>
        <span style={{ flex: 1 }}>Price</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Size</span>
        <span style={{ flex: 1, textAlign: 'right' }}>{view === 'trades' ? 'Time' : 'Total'}</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-subtle)', fontSize: 11 }}>Loading fills…</div>
        ) : fills.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-subtle)', fontSize: 10, textAlign: 'center', padding: '0 16px' }}>
            <span style={{ fontWeight: 700 }}>No fills yet</span>
            <span style={{ opacity: 0.7 }}>Live {pair} trades will stream here as they happen on Velo.</span>
          </div>
        ) : view === 'trades' ? (
          // ── Live trades tape ──────────────────────────────────────────────
          fills.map((f) => {
            const buy = isBuy(f);
            return (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', padding: '0 12px', height: 24, fontSize: 11,
                animation: f.flash ? `${buy ? 'veloFillFlashBuy' : 'veloFillFlashSell'} 0.7s ease-out` : undefined,
              }}>
                <span style={{ flex: 1, color: buy ? 'var(--pnl-up)' : 'var(--pnl-down)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {f.action === 'LIQUIDATION' && <span title="Liquidation" style={{ fontSize: 8, opacity: 0.85 }}>⚡</span>}
                  {fmtPrice(f.price)}
                </span>
                <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-muted)' }}>{fmtSize(f.size)}</span>
                <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-subtle)', fontSize: 10 }}>{ago(f.ts, now)}</span>
              </div>
            );
          })
        ) : (
          // ── Depth ladder (aggregated from real fills) ─────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {depth.asks.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 9, padding: 8, opacity: 0.6 }}>no sell-side flow yet</div>
              ) : depth.asks.map((a, i) => (
                <div key={`a${i}`} style={{ display: 'flex', alignItems: 'center', position: 'relative', padding: '0 12px', height: 24, fontSize: 11 }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(a.total / depth.max) * 100}%`, background: 'rgba(255,80,80,0.10)' }} />
                  <span style={{ flex: 1, color: 'var(--pnl-down)', fontWeight: 600, zIndex: 1 }}>{fmtPrice(a.price)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-muted)', zIndex: 1 }}>{fmtSize(a.size)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-subtle)', fontSize: 10, zIndex: 1 }}>{fmtSize(a.total)}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '6px 12px', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', background: 'var(--chip-bg)', textAlign: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>${fmtPrice(price)}</span>
            </div>
            <div style={{ flex: 1 }}>
              {depth.bids.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 9, padding: 8, opacity: 0.6 }}>no buy-side flow yet</div>
              ) : depth.bids.map((b, i) => (
                <div key={`b${i}`} style={{ display: 'flex', alignItems: 'center', position: 'relative', padding: '0 12px', height: 24, fontSize: 11 }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(b.total / depth.max) * 100}%`, background: 'rgba(62,207,142,0.10)' }} />
                  <span style={{ flex: 1, color: 'var(--pnl-up)', fontWeight: 600, zIndex: 1 }}>{fmtPrice(b.price)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-muted)', zIndex: 1 }}>{fmtSize(b.size)}</span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-subtle)', fontSize: 10, zIndex: 1 }}>{fmtSize(b.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

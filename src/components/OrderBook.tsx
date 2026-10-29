import { AnimatedText } from './ui/AnimatedValue';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { supabase, publicSupabase } from '@/services/supabaseStore';
import { pythPriceStream } from '@/services/pythPriceService';

/**
 * Velo order flow + book — three selectable views:
 *   • Trades — live, Binance-style tape of REAL Velo fills (from trade_history,
 *     streamed via Supabase realtime). New fills flash green/red on arrival.
 *   • Depth  — a ladder aggregated from those same real fills.
 *   • Book   — a resting order book built from REAL pending limit/stop orders
 *     (conditional orders that haven't filled yet), bid/ask around the mark.
 *
 * Velo is oracle-settled, so there's no maker depth to fake — every number here
 * is genuine platform activity, with honest empty states until trades arrive.
 */

interface OrderBookProps { price: number; pair: string; rows?: number; openOrders?: any[]; compact?: boolean; }

interface Fill {
  id: string; pair: string; side: 'LONG' | 'SHORT';
  price: number; size: number; action: string; ts: number; flash?: boolean;
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
    id: String(r.id), pair: r.pair, side: (r.side === 'SHORT' ? 'SHORT' : 'LONG'),
    price, size: size / price, action: r.action || 'OPEN',
    ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(), flash,
  };
}

export const OrderBook: React.FC<OrderBookProps> = ({ price, pair, rows = 8, openOrders: liveOpenOrders, compact = false }) => {
  const [view, setView] = useState<'trades' | 'depth' | 'book'>('trades');
  const [showAllFills, setShowAllFills] = useState(false);
  const [fills, setFills] = useState<Fill[]>([]);
  const [orders, setOrders] = useState<{ side: 'LONG' | 'SHORT'; price: number; size: number }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const seen = useRef<Set<string>>(new Set());

  // Public reads do not depend on authentication. Errors never masquerade as
  // an empty market, and reconnect/focus/poll fill gaps missed by Realtime.
  useEffect(() => {
    let active = true;
    let reading = false;
    const flashes = new Set<ReturnType<typeof setTimeout>>();
    const controller = new AbortController();
    seen.current = new Set(); setLoading(true); setFills([]); setLoadError('');
    const refresh = async () => {
      if (!active || reading) return;
      reading = true;
      const requestedAt = Date.now();
      try {
        const { data, error } = await publicSupabase.from('trade_history')
          .select('id,pair,side,entry_price,exit_price,size,action,created_at')
          .eq('pair', pair).order('created_at', { ascending: false }).limit(60)
          .abortSignal(controller.signal);
        if (!active) return;
        if (error) throw error;
        const mapped = (data || []).map(r => rowToFill(r)).filter(Boolean) as Fill[];
        setFills(prev => {
          const merged = [...new Map([...prev.filter(f => f.ts > requestedAt), ...mapped].map(f => [f.id, f])).values()]
            .sort((a, b) => b.ts - a.ts).slice(0, 60);
          seen.current = new Set(merged.map(f => f.id));
          return merged;
        });
        setLoadError('');
      } catch { if (active) setLoadError('Unable to refresh fills. Check your connection and retry.'); }
      finally { reading = false; if (active) setLoading(false); }
    };
    void refresh();
    const channel = publicSupabase.channel(`public_fills_${pair}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_history', filter: `pair=eq.${pair}` }, payload => {
        if (!active) return;
        const fill = rowToFill(payload.new, true);
        if (!fill || seen.current.has(fill.id)) return;
        seen.current.add(fill.id); setFills(prev => [fill, ...prev].slice(0, 60));
        const timer = setTimeout(() => { flashes.delete(timer); if (active) setFills(prev => prev.map(f => f.id === fill.id ? { ...f, flash: false } : f)); }, 700);
        flashes.add(timer);
      }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trade_history', filter: `pair=eq.${pair}` }, () => void refresh())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trade_history' }, () => void refresh())
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(onVisible, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { active = false; controller.abort(); clearInterval(timer); flashes.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); void publicSupabase.removeChannel(channel); };
  }, [pair, reload]);

  // Load real resting orders for the Book view. Prefer the live in-app
  // openOrders (exactly what the OPEN ORDERS panel shows — guaranteed to match,
  // no RLS/persistence gap); fall back to a DB query only if none were passed.
  useEffect(() => {
    // Live prop path — filter to this pair and map to the ladder shape.
    if (Array.isArray(liveOpenOrders)) {
      const mapped = liveOpenOrders
        .filter((o: any) => o && o.pair === pair && (o.type === 'LIMIT' || o.type === 'STOP' || o.order_type === 'LIMIT' || o.order_type === 'STOP'))
        .map((o: any) => {
          const p = Number(o.price); const s = Number(o.size);
          if (!p || p <= 0 || !s || s <= 0) return null;
          // size is notional USD → base units for consistent depth display
          return { side: (o.side === 'SHORT' ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT', price: p, size: s / p };
        }).filter(Boolean) as any[];
      setOrders(mapped);
      return;
    }
    // Fallback: DB query (used when the component is rendered without the prop).
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('open_orders')
          .select('side,price,size,order_type,pair')
          .eq('pair', pair)
          .limit(80);
        if (!active || !data) return;
        const mapped = data.map((o: any) => {
          const p = Number(o.price); const s = Number(o.size);
          if (!p || p <= 0 || !s || s <= 0) return null;
          return { side: (o.side === 'SHORT' ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT', price: p, size: s / p };
        }).filter(Boolean) as any[];
        setOrders(mapped);
      } catch { /* Book shows empty state if unavailable */ }
    })();
    return () => { active = false; };
  }, [pair, price, liveOpenOrders]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setShowAllFills(false); }, [pair]);

  // Depth: bucket recent fills by price into buy/sell sides.
  const depth = useMemo(() => {
    if (fills.length === 0) return { bids: [] as any[], asks: [] as any[], max: 1 };
    const tick = price >= 1000 ? 1 : price >= 100 ? 0.1 : price >= 1 ? 0.01 : 0.0001;
    const bucket = (p: number) => Math.round(p / tick) * tick;
    const bidMap = new Map<number, number>(); const askMap = new Map<number, number>();
    for (const f of fills) { const b = bucket(f.price); (isBuy(f) ? bidMap : askMap).set(b, ((isBuy(f) ? bidMap : askMap).get(b) || 0) + f.size); }
    const bids = [...bidMap.entries()].map(([p, s]) => ({ price: p, size: s })).filter(x => x.price <= price).sort((a, b) => b.price - a.price).slice(0, 8);
    const asks = [...askMap.entries()].map(([p, s]) => ({ price: p, size: s })).filter(x => x.price >= price).sort((a, b) => a.price - b.price).slice(0, 8);
    let cb = 0, ca = 0; bids.forEach(b => { cb += b.size; (b as any).total = cb; }); asks.forEach(a => { ca += a.size; (a as any).total = ca; });
    return { bids, asks: asks.reverse(), max: Math.max(cb, ca, 1) };
  }, [fills, price]);

  // Book: resting limit/stop orders as bids (below mark) / asks (above mark).
  const book = useMemo(() => {
    const bids = orders.filter(o => o.price <= price).sort((a, b) => b.price - a.price).slice(0, 8);
    const asks = orders.filter(o => o.price > price).sort((a, b) => a.price - b.price).slice(0, 8);
    let cb = 0, ca = 0; bids.forEach(b => { cb += b.size; (b as any).total = cb; }); asks.forEach(a => { ca += a.size; (a as any).total = ca; });
    return { bids, asks: asks.reverse(), max: Math.max(cb, ca, 1) };
  }, [orders, price]);

  const Tabs = (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {(['trades', 'depth', 'book'] as const).map(v => (
        <button key={v} title={v === 'depth' ? 'Recent reported fills grouped by price; not executable market liquidity' : v === 'book' ? 'Conditional orders; not a matching-engine order book' : 'Reported testnet trading activity'} onClick={() => setView(v)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 3px',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: view === v ? 'var(--fg)' : 'var(--fg-subtle)',
          borderBottom: view === v ? '1.5px solid var(--accent)' : '1.5px solid transparent',
        }}>{v === 'trades' ? 'Trades' : v === 'depth' ? 'Volume' : 'Orders'}</button>
      ))}
    </div>
  );

  const LadderRows = (rowsArr: any[], kind: 'bid' | 'ask', maxTotal: number) => (
    rowsArr.map((r, i) => (
      <div key={`${kind}${i}`} style={{ display: 'flex', alignItems: 'center', position: 'relative', padding: '0 12px', height: 24, fontSize: 11 }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(r.total / maxTotal) * 100}%`, background: kind === 'ask' ? 'rgba(255,80,80,0.10)' : 'rgba(62,207,142,0.10)' }} />
        <span style={{ flex: 1, color: kind === 'ask' ? 'var(--pnl-down)' : 'var(--pnl-up)', fontWeight: 600, zIndex: 1 }}>{<AnimatedText text={fmtPrice(r.price)}/>}</span>
        <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-muted)', zIndex: 1 }}>{<AnimatedText text={fmtSize(r.size)}/>}</span>
        <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-subtle)', fontSize: 10, zIndex: 1 }}>{<AnimatedText text={fmtSize(r.total)}/>}</span>
      </div>
    ))
  );

  const MidBand = (
    <div style={{ padding: '6px 12px', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', background: 'var(--chip-bg)', textAlign: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontStyle: 'normal' }}>${<AnimatedText text={fmtPrice(price)}/>}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: compact ? 'auto' : '100%', width: '100%', fontFamily: 'var(--font-mono)', userSelect: 'none', overflow: 'hidden', background: 'var(--bg-base-2)' }}>
      <style>{`@keyframes veloFillFlashBuy{0%{background:rgba(62,207,142,0.28)}100%{background:transparent}}@keyframes veloFillFlashSell{0%{background:rgba(255,80,80,0.28)}100%{background:transparent}}`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        {Tabs}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {view === 'trades' && fills.length > rows && (
            <button
              type="button"
              onClick={() => setShowAllFills(v => !v)}
              aria-label={showAllFills ? 'Show recent fills only' : `Show all ${fills.length} fills`}
              title={showAllFills ? 'Show recent fills only' : `Show all ${fills.length} fills`}
              style={{ border: 'none', background: 'transparent', color: 'var(--fg-subtle)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 0', whiteSpace: 'nowrap' }}
            >{showAllFills ? 'RECENT' : `ALL ${fills.length}`}</button>
          )}
          <span style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{pair}</span>
        </div>
      </div>

      <div style={{ display: 'flex', color: 'var(--fg-subtle)', padding: '5px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0, fontWeight: 700 }}>
        <span style={{ flex: 1 }}>Price</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Size</span>
        <span style={{ flex: 1, textAlign: 'right' }}>{view === 'trades' ? 'Time' : 'Total'}</span>
      </div>

      {loadError && <div role="status" style={{ padding: '8px 12px', fontSize: 11, color: 'var(--fg-muted)' }}>{loadError} <button onClick={() => setReload(x => x + 1)}>Retry</button></div>}
      <div style={{ flex: compact ? '0 1 auto' : 1, minHeight: compact ? 56 : 0, maxHeight: compact ? 240 : undefined, overflowY: compact || view === 'trades' && showAllFills ? 'auto' : 'hidden', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
        {view === 'trades' ? (
          loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-subtle)', fontSize: 11 }}>Loading fills…</div>
          ) : fills.length === 0 && loadError ? null : fills.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-subtle)', fontSize: 10, textAlign: 'center', padding: '0 16px' }}>
              <span style={{ fontWeight: 700 }}>No fills yet</span>
              <span style={{ opacity: 0.7 }}>No reported {pair} trades were returned. This is public testnet activity.</span>
            </div>
          ) : (showAllFills ? fills : fills.slice(0, rows)).map((f) => {
            const buy = isBuy(f);
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: 24, fontSize: 11, animation: f.flash ? `${buy ? 'veloFillFlashBuy' : 'veloFillFlashSell'} 0.7s ease-out` : undefined }}>
                <span style={{ flex: 1, color: buy ? 'var(--pnl-up)' : 'var(--pnl-down)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {f.action === 'LIQUIDATION' && <span title="Liquidation" style={{ fontSize: 8, opacity: 0.85 }}>⚡</span>}{<AnimatedText text={fmtPrice(f.price)}/>}
                </span>
                <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-muted)' }}>{<AnimatedText text={fmtSize(f.size)}/>}</span>
                <span style={{ flex: 1, textAlign: 'right', color: 'var(--fg-subtle)', fontSize: 10 }}>{ago(f.ts, now)}</span>
              </div>
            );
          })
        ) : view === 'depth' ? (
          fills.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-subtle)', fontSize: 10, textAlign: 'center', padding: '0 16px' }}>
              <span style={{ fontWeight: 700 }}>No flow yet</span>
              <span style={{ opacity: 0.7 }}>Volume groups recent reported {pair} fills.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>{depth.asks.length ? LadderRows(depth.asks, 'ask', depth.max) : <div style={{ textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 9, padding: 8, opacity: 0.6 }}>no sell flow yet</div>}</div>
              {MidBand}
              <div style={{ flex: 1 }}>{depth.bids.length ? LadderRows(depth.bids, 'bid', depth.max) : <div style={{ textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 9, padding: 8, opacity: 0.6 }}>no buy flow yet</div>}</div>
            </div>
          )
        ) : (
          // BOOK
          (book.bids.length === 0 && book.asks.length === 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--fg-subtle)', fontSize: 10, textAlign: 'center', padding: '0 16px' }}>
              <span style={{ fontWeight: 700 }}>No resting orders</span>
              <span style={{ opacity: 0.7 }}>Pending limit & stop orders on {pair} appear here as a live book.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>{book.asks.length ? LadderRows(book.asks, 'ask', book.max) : <div style={{ textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 9, padding: 8, opacity: 0.6 }}>no asks</div>}</div>
              {MidBand}
              <div style={{ flex: 1 }}>{book.bids.length ? LadderRows(book.bids, 'bid', book.max) : <div style={{ textAlign: 'center', color: 'var(--fg-subtle)', fontSize: 9, padding: 8, opacity: 0.6 }}>no bids</div>}</div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

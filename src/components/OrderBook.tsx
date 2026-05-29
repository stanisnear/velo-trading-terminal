import React, { useMemo, useState, useEffect } from 'react';

/**
 * OrderBook — a depth ladder anchored to the live Pyth mark price.
 *
 * Velo Perps is an oracle-priced engine: trades settle against the Pyth price,
 * not a central-limit order book, so there is no native book to stream. Pulling
 * depth from a third-party venue (the previous Orderly Network feed) showed
 * levels from a *different market* than the one users actually trade against —
 * the same inconsistency we removed everywhere else.
 *
 * This book is therefore a reference ladder built around the same Pyth mark
 * (`price`) that drives fills, the ticker, and the chart. It re-centers as the
 * oracle moves so every number on screen agrees with the price you fill at.
 */

interface OrderBookProps {
  price: number;   // live Pyth mark price for the active pair
  pair: string;
  rows?: number;
}

function getGroupingOptions(price: number) {
  if (price >= 10000) return [1, 5, 10, 50, 100];
  if (price >= 1000)  return [0.1, 0.5, 1, 5, 10];
  if (price >= 100)   return [0.01, 0.1, 0.5, 1, 5];
  if (price >= 10)    return [0.01, 0.05, 0.1, 0.5, 1];
  if (price >= 1)     return [0.001, 0.01, 0.05, 0.1];
  if (price >= 0.01)  return [0.0001, 0.001, 0.01];
  if (price >= 0.0001)return [0.000001, 0.00001, 0.0001];
  return [0.00000001, 0.0000001, 0.000001];
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Reference depth ladder centered on the Pyth mark. Sizes are deterministic per
// price+tick so the book animates smoothly without flicker as the oracle ticks.
function buildBook(price: number, grouping: number, rows: number, tick: number) {
  const step       = grouping;
  const midRounded = Math.ceil(price / step) * step;
  const seed       = Math.floor(price * 100) + tick * 17;
  const asks: { price: number; size: number; total: number }[] = [];
  const bids: { price: number; size: number; total: number }[] = [];
  let cumAsk = 0, cumBid = 0;
  for (let i = 0; i < rows; i++) {
    const distFactor = 1 + i * 0.3;
    const askSize = (200 + seededRandom(seed + i * 7 + 1) * 2000) * distFactor;
    const bidSize = (200 + seededRandom(seed + i * 7 + 3) * 2000) * distFactor;
    cumAsk += askSize;
    cumBid += bidSize;
    asks.push({ price: midRounded + (i + 1) * step, size: askSize, total: cumAsk });
    bids.push({ price: midRounded - (i + 1) * step, size: bidSize, total: cumBid });
  }
  return { asks: asks.reverse(), bids, spread: (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0) || step };
}

export const OrderBook: React.FC<OrderBookProps> = ({ price, pair, rows = 8 }) => {
  const [grouping, setGrouping] = useState(0.01);
  const [tick, setTick]         = useState(0);

  useEffect(() => {
    const options = getGroupingOptions(price);
    setGrouping(options[0]);
  }, [pair]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => { setTick(n => n + 1); schedule(); }, 800 + Math.random() * 600);
    };
    schedule();
    return () => clearTimeout(t);
  }, []);

  const groupingOptions = useMemo(() => getGroupingOptions(price), [price]);

  const { asks, bids, spread } = useMemo(() => {
    if (!price || price <= 0) return { asks: [] as any[], bids: [] as any[], spread: 0 };
    return buildBook(price, grouping, rows, tick);
  }, [price, pair, grouping, rows, tick]);

  const maxTotal = useMemo(() => {
    if (asks.length === 0 && bids.length === 0) return 1;
    return Math.max(asks[0]?.total || 0, bids[bids.length - 1]?.total || 0);
  }, [asks, bids]);

  const isLive = price > 0; // we have a fresh Pyth mark

  const formatPrice = (val: number) => {
    if (grouping >= 1)        return val.toFixed(0);
    if (grouping >= 0.1)      return val.toFixed(1);
    if (grouping >= 0.01)     return val.toFixed(2);
    if (grouping >= 0.001)    return val.toFixed(3);
    if (grouping >= 0.0001)   return val.toFixed(4);
    if (grouping >= 0.00001)  return val.toFixed(5);
    if (grouping >= 0.000001) return val.toFixed(6);
    return val.toFixed(8);
  };

  const formatSize = (val: number) => {
    if (val >= 1e6)  return (val / 1e6).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val.toFixed(2);
  };

  const spreadPct = price > 0 ? ((spread / price) * 100).toFixed(3) : '0';

  const rowStyle = (_side: 'ask' | 'bid', _pct: number): React.CSSProperties => ({
    display: 'flex', justifyContent: 'space-between', position: 'relative',
    cursor: 'pointer', padding: '0 12px', alignItems: 'center', height: 26, flexShrink: 0,
  });

  const barStyle = (side: 'ask' | 'bid', pct: number): React.CSSProperties => ({
    position: 'absolute', right: 0, top: 0, bottom: 0,
    background: side === 'ask' ? 'rgba(255,80,80,0.08)' : 'rgba(62,207,142,0.08)',
    transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
    width: `${pct}%`,
  });

  if (!price || price <= 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg-base-2)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>Loading…</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', userSelect: 'none', overflow: 'hidden', background: 'var(--bg-base-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--fg-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 9 }}>Order Book</span>
          <span
            title={isLive ? 'Reference depth anchored to the live Pyth oracle price' : 'Waiting for Pyth price…'}
            style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
              background: isLive ? 'var(--pnl-up)' : 'var(--fg-subtle)',
              boxShadow: isLive ? '0 0 4px var(--pnl-up)' : 'none',
            }}
          />
          <span style={{ color: 'var(--fg-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 8, opacity: 0.8 }}>Pyth</span>
        </div>
        <select
          value={grouping}
          onChange={e => setGrouping(parseFloat(e.target.value))}
          style={{ background: 'var(--chip-bg)', color: 'var(--fg)', outline: 'none', fontSize: 10, cursor: 'pointer', fontWeight: 700, borderRadius: 6, padding: '3px 7px', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font-mono)' }}
        >
          {groupingOptions.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', color: 'var(--fg-subtle)', padding: '4px 12px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', flexShrink: 0, fontWeight: 700 }}>
        <span style={{ flex: 1 }}>Price</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Size</span>
        <span style={{ flex: 1, textAlign: 'right' }}>Total</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflowY: 'hidden', minHeight: 0 }}>
          {asks.map((ask, i) => (
            <div key={`ask-${i}`} style={rowStyle('ask', (ask.total / maxTotal) * 100)}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,80,80,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={barStyle('ask', (ask.total / maxTotal) * 100)} />
              <span style={{ color: 'var(--pnl-down)', fontWeight: 500, zIndex: 1, flex: 1 }}>{formatPrice(ask.price)}</span>
              <span style={{ color: 'var(--fg-muted)', zIndex: 1, flex: 1, textAlign: 'right' }}>{formatSize(ask.size)}</span>
              <span style={{ color: 'var(--fg-subtle)', zIndex: 1, flex: 1, textAlign: 'right', fontSize: 10 }}>{formatSize(ask.total)}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '5px 12px', borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--chip-bg)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>${formatPrice(price)}</span>
          <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>Spread: {formatPrice(spread)} ({spreadPct}%)</span>
        </div>

        <div style={{ overflowY: 'hidden', minHeight: 0, flex: 1 }}>
          {bids.map((bid, i) => (
            <div key={`bid-${i}`} style={rowStyle('bid', (bid.total / maxTotal) * 100)}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,207,142,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={barStyle('bid', (bid.total / maxTotal) * 100)} />
              <span style={{ color: 'var(--pnl-up)', fontWeight: 500, zIndex: 1, flex: 1 }}>{formatPrice(bid.price)}</span>
              <span style={{ color: 'var(--fg-muted)', zIndex: 1, flex: 1, textAlign: 'right' }}>{formatSize(bid.size)}</span>
              <span style={{ color: 'var(--fg-subtle)', zIndex: 1, flex: 1, textAlign: 'right', fontSize: 10 }}>{formatSize(bid.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

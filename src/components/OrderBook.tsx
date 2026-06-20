import React, { useMemo, useState, useEffect } from 'react';
import { pythPriceStream } from '@/services/pythPriceService';

/**
 * OraclePanel (exported as OrderBook for drop-in compatibility).
 *
 * Velo Perps is oracle-settled: a position fills at the Pyth mark price, NOT
 * against resting limit orders. There are no makers posting bids/asks, so there
 * is no central-limit order book to display — the oracle *is* the price. The
 * previous component faked a depth ladder with random sizes and a decorative
 * "Pyth" dot; this replaces it with the honest truth of how Velo prices trades:
 *
 *   • Live Pyth mark price (the exact number the contract settles on)
 *   • The real Pyth confidence interval — the oracle's own ± uncertainty band,
 *     published on-chain alongside every price update (NOT invented)
 *   • Oracle freshness (seconds since publish_time) with a staleness signal
 *   • A fill estimator: enter a size, see the notional and the exact entry the
 *     mark implies — the real pre-trade math, not a fabricated book
 *
 * Every number here is sourced from the same Pyth feed that drives fills, the
 * ticker, and the chart, so nothing on screen can disagree with your fill.
 */

interface OrderBookProps {
  price: number;   // live Pyth mark price for the active pair
  pair: string;
  rows?: number;   // accepted for API compatibility; unused
}

function fmtPrice(val: number): string {
  if (!isFinite(val)) return '—';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1)    return val.toFixed(2);
  if (val >= 0.01) return val.toFixed(4);
  return val.toFixed(8);
}

function fmtNotional(val: number): string {
  if (!isFinite(val) || val <= 0) return '$0';
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
  if (val >= 1e3) return '$' + (val / 1e3).toFixed(2) + 'K';
  return '$' + val.toFixed(2);
}

export const OrderBook: React.FC<OrderBookProps> = ({ price, pair }) => {
  // Pull the real oracle metadata (confidence band + publish time) for this pair.
  const [meta, setMeta] = useState<{ conf: number; publishTime: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sizeInput, setSizeInput] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');

  useEffect(() => {
    // Refresh meta on every oracle tick + tick a 1s clock for the freshness read.
    const unsub = pythPriceStream.subscribe(() => setMeta(pythPriceStream.getMeta(pair)));
    setMeta(pythPriceStream.getMeta(pair));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { unsub(); clearInterval(clock); };
  }, [pair]);

  const isLive = price > 0;
  const conf = meta?.conf && meta.conf > 0 ? meta.conf : 0;
  const confPct = conf > 0 && price > 0 ? (conf / price) * 100 : 0;
  const bandLow = price - conf;
  const bandHigh = price + conf;

  const ageSec = meta?.publishTime ? Math.max(0, Math.floor(now / 1000 - meta.publishTime)) : null;
  const fresh = ageSec == null ? isLive : ageSec <= 5;

  // Fill estimator — the real pre-trade math. On an oracle engine the entry IS
  // the mark; we show notional and the (currently zero) oracle slippage so the
  // user sees exactly what they'll get, honestly.
  const sizeUnits = parseFloat(sizeInput);
  const hasSize = isFinite(sizeUnits) && sizeUnits > 0;
  const notional = hasSize ? sizeUnits * price : 0;
  // Worst-case entry within the oracle confidence band (conservative read).
  const worstEntry = side === 'LONG' ? bandHigh : bandLow;

  const Row = ({ label, value, valueColor, title }: { label: string; value: React.ReactNode; valueColor?: string; title?: string }) => (
    <div title={title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 12px', borderBottom: '1px solid var(--hairline)' }}>
      <span style={{ color: 'var(--fg-subtle)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{label}</span>
      <span style={{ color: valueColor || 'var(--fg)', fontSize: 12, fontWeight: 600 }}>{value}</span>
    </div>
  );

  if (!isLive) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg-base-2)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)' }}>Waiting for Pyth oracle…</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', fontFamily: 'var(--font-mono)', userSelect: 'none', overflow: 'hidden', background: 'var(--bg-base-2)' }}>
      {/* Header — honest source label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--fg-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 9 }}>Oracle Price</span>
          <span
            title={fresh ? 'Live Pyth oracle — fresh' : 'Oracle update delayed'}
            style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: fresh ? 'var(--pnl-up)' : 'var(--clay-amber, #d9a441)', boxShadow: fresh ? '0 0 4px var(--pnl-up)' : 'none' }}
          />
          <span style={{ color: 'var(--fg-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 8, opacity: 0.8 }}>Pyth</span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>{ageSec == null ? 'live' : `${ageSec}s ago`}</span>
      </div>

      {/* Mark price — the number the contract settles on */}
      <div style={{ padding: '14px 12px 12px', borderBottom: '1px solid var(--hairline)', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 4 }}>Mark · Settlement Price</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-display)', fontStyle: 'italic', lineHeight: 1 }}>${fmtPrice(price)}</div>
      </div>

      {/* Real oracle confidence band */}
      <Row
        label="Confidence ±"
        title="Pyth's published confidence interval — the oracle's own uncertainty band for this price. A real on-chain value, not an estimate."
        value={conf > 0 ? `$${fmtPrice(conf)} (${confPct.toFixed(3)}%)` : '—'}
        valueColor="var(--fg-muted)"
      />
      <Row
        label="Oracle Band"
        title="Mark ± confidence: the range within which the true price is statistically expected to sit."
        value={conf > 0 ? `${fmtPrice(bandLow)} — ${fmtPrice(bandHigh)}` : '—'}
        valueColor="var(--fg-muted)"
      />

      {/* Honest explanation — no fake book */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--chip-bg)' }}>
        <p style={{ margin: 0, fontSize: 9.5, lineHeight: 1.5, color: 'var(--fg-subtle)' }}>
          Velo settles trades against the Pyth oracle, not an order book — fills occur at the mark above, with no maker depth to cross.
        </p>
      </div>

      {/* Fill estimator — real pre-trade math */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px' }}>
        <div style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>Fill Estimate</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['LONG', 'SHORT'] as const).map(s => (
            <button key={s} onClick={() => setSide(s)} style={{
              flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em',
              border: '1px solid ' + (side === s ? (s === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--hairline-strong)'),
              background: side === s ? (s === 'LONG' ? 'rgba(62,207,142,0.12)' : 'rgba(255,80,80,0.12)') : 'transparent',
              color: side === s ? (s === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg-subtle)',
            }}>{s}</button>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            value={sizeInput}
            onChange={e => setSizeInput(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            inputMode="decimal"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--chip-bg)', border: '1px solid var(--hairline-strong)', borderRadius: 7, padding: '8px 44px 8px 10px', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, outline: 'none' }}
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{pair.split('/')[0] || 'SIZE'}</span>
        </div>

        <Row label="Entry (mark)" value={hasSize ? `$${fmtPrice(price)}` : '—'} />
        <Row label="Notional" value={hasSize ? fmtNotional(notional) : '—'} valueColor="var(--fg)" />
        <Row
          label="Worst-case entry"
          title="Conservative entry assuming the true price sits at the far edge of the oracle confidence band."
          value={hasSize && conf > 0 ? `$${fmtPrice(worstEntry)}` : (hasSize ? `$${fmtPrice(price)}` : '—')}
          valueColor="var(--fg-muted)"
        />
      </div>
    </div>
  );
};

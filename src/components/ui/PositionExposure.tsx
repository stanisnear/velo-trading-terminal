import React, { useState } from 'react';
import { ArrowUpRight, Layers3 } from 'lucide-react';
import type { Position } from '../../utils/types';
import { AnimatedValue } from './AnimatedValue';
import { TradingDialog } from './TradingDialog';
import './PositionExposure.css';

/** Fixed-size summary; the full breakdown never changes the dashboard's height. */
export function PositionExposure({ positions, margin, pnl, onInspect }: {
  positions: Position[]; margin: number; pnl: number; onInspect: (position: Position) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const notional = (position: Position) => Number.isFinite(position.size) ? Math.max(0, position.size) : 0;
  const total = positions.reduce((sum, position) => sum + notional(position), 0);
  const highlighted = positions.some(position => position.id === focused) ? focused : null;
  const bar = <div className="position-exposure-bar" aria-hidden="true">
    {positions.map(position => <span key={position.id} data-long={position.side === 'LONG'}
      data-muted={open && highlighted !== null && highlighted !== position.id} style={{ flexGrow: notional(position) }}/>) }
  </div>;
  return <section className="position-exposure" aria-label="Open exposure">
    <header><span><Layers3 size={15} aria-hidden="true"/>Open exposure</span><small>{positions.length} open</small></header>
    <div className="position-exposure-summary">
      <div><span>Margin in use</span><strong><AnimatedValue value={margin}/></strong></div>
      <div><span>Unrealized PnL</span><strong data-positive={pnl >= 0}><AnimatedValue value={pnl}/></strong></div>
    </div>
    {bar}
    <button type="button" className="position-exposure-more" disabled={positions.length === 0} onClick={() => setOpen(true)}>
      {positions.length ? 'View breakdown' : 'No open positions'}{positions.length > 0 && <ArrowUpRight size={13}/>}</button>
    <TradingDialog open={open} onClose={() => {setOpen(false);setFocused(null);}} title="Exposure breakdown"
      identity={<span>{positions.length} open · Position size, notional</span>}
      footer={<button type="button" onClick={() => {setOpen(false);setFocused(null);}}>Done</button>}>
      <div className="position-exposure-detail">
        <p className="position-exposure-note">Share of total open notional. Margin and PnL are shown separately on your dashboard.</p>
        {bar}
        <div className="position-exposure-list">{positions.map(position => <button type="button" className="position-exposure-row" key={position.id}
          aria-label={`Inspect ${position.pair} ${position.side.toLowerCase()} position`}
          onMouseEnter={() => setFocused(position.id)} onMouseLeave={() => setFocused(null)}
          onFocus={() => setFocused(position.id)} onBlur={() => setFocused(null)} onClick={() => {setOpen(false);setFocused(null);onInspect(position);}}>
          <span className="position-exposure-symbol"><i data-long={position.side === 'LONG'} aria-hidden="true"/>
            <span><strong>{position.pair}</strong><small>{position.side === 'LONG' ? 'Long' : 'Short'} · {position.leverage}×</small></span></span>
          <span className="position-exposure-size"><AnimatedValue value={notional(position)}/><small>{total > 0 ? (notional(position) / total * 100).toFixed(1) : '0.0'}% of notional</small></span>
          <ArrowUpRight size={14} aria-hidden="true"/>
        </button>)}</div>
        {!positions.length && <p className="position-exposure-empty">No open positions.</p>}
      </div>
    </TradingDialog>
  </section>;
}

import React, { useId, useState } from 'react';
import { ArrowUpRight, ChevronDown, Layers3 } from 'lucide-react';
import type { Position } from '../../utils/types';
import { AnimatedValue } from './AnimatedValue';
import { ContentDisclosure } from './ProductMotion';
import './PositionExposure.css';

/** A read-only view of actual position notionals; never a solvency/risk estimate. */
export function PositionExposure({ positions, margin, pnl, onInspect }: {
  positions: Position[]; margin: number; pnl: number; onInspect: (position: Position) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const listId = useId();
  const notional = (position: Position) => Number.isFinite(position.size) ? Math.max(0, position.size) : 0;
  const total = positions.reduce((sum, position) => sum + notional(position), 0);
  const highlighted = (expanded ? positions : positions.slice(0, 3)).some(position => position.id === focused) ? focused : null;
  const row = (position: Position) => <button type="button" className="position-exposure-row" key={position.id}
    aria-label={`Inspect ${position.pair} ${position.side.toLowerCase()} position`}
    onMouseEnter={() => setFocused(position.id)} onMouseLeave={() => setFocused(null)}
    onFocus={() => setFocused(position.id)} onBlur={() => setFocused(null)} onClick={() => onInspect(position)}>
    <span className="position-exposure-symbol"><i data-long={position.side === 'LONG'} aria-hidden="true"/>
      <span><strong>{position.pair}</strong><small>{position.side === 'LONG' ? 'Long' : 'Short'} · {position.leverage}×</small></span>
    </span>
    <span className="position-exposure-size"><AnimatedValue value={notional(position)}/><small>{total > 0 ? (notional(position) / total * 100).toFixed(1) : '0.0'}% of notional</small></span>
    <ArrowUpRight size={14} aria-hidden="true"/>
  </button>;
  return <section className="position-exposure" aria-label="Open exposure">
    <header><span><Layers3 size={15} aria-hidden="true"/>Open exposure</span><small>{positions.length} open</small></header>
    <div className="position-exposure-summary">
      <div><span>Margin in use</span><strong><AnimatedValue value={margin}/></strong></div>
      <div><span>Unrealized PnL</span><strong data-positive={pnl >= 0}><AnimatedValue value={pnl}/></strong></div>
    </div>
    {positions.length > 0 ? <>
      <div className="position-exposure-bar" aria-hidden="true">
        {positions.map(position => <span key={position.id} data-long={position.side === 'LONG'}
          data-muted={highlighted !== null && highlighted !== position.id} style={{ flexGrow: notional(position) }}/>) }
      </div>
      <p className="position-exposure-caption">Position size · notional</p>
      <div className="position-exposure-list">{positions.slice(0, 3).map(row)}</div>
      {positions.length > 3 && <>
        <ContentDisclosure open={expanded} id={listId}><div className="position-exposure-list">{positions.slice(3).map(row)}</div></ContentDisclosure>
        <button type="button" className="position-exposure-more" aria-expanded={expanded} aria-controls={listId}
          onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `Show ${positions.length - 3} more`}<ChevronDown size={14}/></button>
      </>}
    </> : <p className="position-exposure-empty">Your open positions will appear here.</p>}
  </section>;
}

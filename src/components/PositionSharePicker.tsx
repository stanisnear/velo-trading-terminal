import { AnimatedText } from './ui/AnimatedValue';
import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import type { Position, TradeHistoryItem } from '../utils/types';
export function PositionSharePicker({ open, onClose, positions, history, onPosition, onHistory }: {
  open: boolean; onClose: () => void; positions: Position[]; history: TradeHistoryItem[];
  onPosition: (position: Position) => void; onHistory: (trade: TradeHistoryItem) => void;
}) {
  const [closed, setClosed] = useState(false);
  const results = history.filter(t => t.action === 'CLOSE' || t.action === 'LIQUIDATION').slice(0, 20);
  return <Dialog open={open} onClose={onClose} title="Share a position"><div className="trade-share-body">
    <div className="trade-share-actions" role="group" aria-label="Position status"><button aria-pressed={!closed} onClick={()=>setClosed(false)}>Open · {positions.length}</button><button aria-pressed={closed} onClick={()=>setClosed(true)}>Closed · {results.length}</button></div>
    <div style={{display:'grid',gap:8,marginTop:16}}>{(closed ? results : positions).map(item => <button key={item.id} className="position-share-choice" onClick={()=>{onClose();closed ? onHistory(item as TradeHistoryItem) : onPosition(item as Position);}}><span><b>{item.pair}</b><small>{item.side} · {item.leverage || 1}×</small></span><span>{<AnimatedText text={closed ? `${(item as TradeHistoryItem).pnl >= 0 ? '+' : '−'}$${Math.abs((item as TradeHistoryItem).pnl).toFixed(2)}` : 'Share live position'}/>}<ArrowUpRight size={15}/></span></button>)}</div>
    {(closed ? results : positions).length === 0 && <p className="trade-share-feedback">{closed ? 'Your closed trades will appear here after settlement.' : 'Your open positions will appear here.'}</p>}
  </div><style>{`.position-share-choice{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border:1px solid var(--hairline);border-radius:12px;background:var(--chip-bg);color:var(--fg);text-align:left;cursor:pointer}.position-share-choice>span{display:flex;align-items:center;gap:8px;font:12px var(--font-mono)}.position-share-choice>span:first-child{display:grid;gap:5px}.position-share-choice b{font:500 20px var(--font-display)}.position-share-choice small{font-size:10px;color:var(--fg-subtle)}.position-share-choice:hover{border-color:var(--accent)}`}</style></Dialog>;
}

import { AnimatedText } from './ui/AnimatedValue';
import React from 'react';
import { CheckCircle2, Share2 } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import type { TradeShare } from '../utils/tradeShare';
export function TradeCloseReceipt({ data, onClose, onShare }: { data: TradeShare; onClose: () => void; onShare: () => void }) {
  return <Dialog open onClose={onClose} title="Position closed" className="velo-glass-dialog"><div className="close-receipt">
    <CheckCircle2 size={38}/><p>{data.pair} · {data.side} · {data.leverage}×</p>
    <strong data-positive={data.pnl >= 0}>{data.pnl >= 0 ? '+' : '−'}${<AnimatedText text={Math.abs(data.pnl).toFixed(2)}/>}</strong><small>Realized PnL · Settlement confirmed</small>
    <div><button type="button" onClick={onClose}>Done</button><button type="button" className="close-receipt-share" onClick={onShare}><Share2 size={14}/>Share</button></div>
  </div></Dialog>;
}

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { TradeShare } from '../utils/tradeShare';
import { hasPositionReference, readSharedPosition } from '../services/sharedPosition';
import { positionPnl } from '../services/positionValuation.mjs';
import { PnlImage } from './PnlImage';
import { shareUpdates, resolveSharedTrade } from '../utils/shareBehavior.mjs';
import { formatPrice, VeloAssetIcon } from './ui/shared';
import './TradeShareCard.css';

export const SharedMarkContext = createContext<Record<string, number>>({});
export function useSharedTrade(snapshot: TradeShare, enabled = true) {
  const prices = useContext(SharedMarkContext);
  const pricesRef = useRef(prices); pricesRef.current = prices;
  const live = shareUpdates(snapshot);
  const [state, setState] = useState({ data: snapshot, pending: live && hasPositionReference(snapshot) });
  const key = `${snapshot.contract}:${snapshot.tradeId}:${snapshot.txHash || ''}:${snapshot.updateMode}:${snapshot.onClose}`;
  useEffect(() => {
    if (!enabled || !live) return;
    let active = true, busy = false, settled = false, data = snapshot;
    setState({ data, pending: hasPositionReference(data) });
    if (!hasPositionReference(data)) return;
    const refresh = async () => {
      if (busy || settled || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        data = resolveSharedTrade(snapshot, await readSharedPosition(data, pricesRef.current[data.pair]));
        settled = data.status !== 'OPEN';
        if (active) setState({ data, pending: false });
      } catch { if (active) setState(previous => ({ ...previous, pending: true })); }
      finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 10_000);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [key, enabled]);
  if (!live) return { data: snapshot, pending: false };
  const mark = prices[state.data.pair];
  if (state.data.status !== 'OPEN' || !state.data.v4 || !(mark > 0)) return state;
  const data = state.data;
  const pnl = positionPnl({ ...data, timestamp: data.openedAt }, mark);
  return { ...state, data: { ...data, markPrice: mark, pnl, pnlPct: data.collateral > 0 ? pnl / data.collateral * 100 : 0, updatedAt: Date.now() } };
}
export function CompactPosition({ data, pending = false }: { data: TradeShare; pending?: boolean }) {
  const open = data.status === 'OPEN';
  return <article className="shared-position" aria-label={`${data.pair} position attachment`}>
    <div className="shared-position-heading"><VeloAssetIcon src={`/tokens/${data.pair.split('/')[0].toLowerCase()}.png`} symbol={data.pair.split('/')[0]} size={26}/><strong>{data.pair}</strong><span className={data.side.toLowerCase()}>{data.side} · {data.leverage}×</span><small>{open ? (data.updateMode === 'snapshot' ? 'Snapshot' : 'Open') : data.status === 'LIQUIDATED' ? 'Liquidated' : 'Closed'}</small></div>
    <dl><div><dt>Entry</dt><dd>${formatPrice(data.entryPrice)}</dd></div><div><dt>{open ? 'Mark' : 'Exit'}</dt><dd>${formatPrice((open ? data.markPrice : data.closePrice) || data.entryPrice)}</dd></div><div><dt>{data.closedSnapshot ? 'PnL snapshot' : open ? 'Est. net PnL' : 'Realized PnL'}</dt><dd data-positive={data.pnl >= 0}>{data.pnl >= 0 ? '+' : '−'}{data.hideAmounts ? `${Math.abs(data.pnlPct).toFixed(2)}%` : `$${Math.abs(data.pnl).toFixed(2)}`}</dd></div></dl>
    <footer>{pending ? 'Refreshing · showing last known values' : data.updateMode === 'snapshot' ? 'Captured snapshot' : open ? 'Live position · Base Sepolia' : 'Settlement confirmed · Base Sepolia'}{data.txHash && <a href={`https://sepolia.basescan.org/tx/${data.txHash}`} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}</footer>
  </article>;
}
export function SharedPositionCard({ snapshot, imageUrl }: { snapshot: TradeShare; imageUrl?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(()=>{
    if (!ref.current) return;
    if (!('IntersectionObserver' in window)) {setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'160px'});
    observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  const { data, pending } = useSharedTrade(snapshot, visible);
  return <div ref={ref}>{snapshot.presentation === 'pnl' ? <><PnlImage data={data} imageUrl={imageUrl}/>{pending && <p className="trade-share-feedback">Refreshing · showing last known values</p>}</> : <CompactPosition data={data} pending={pending}/>}</div>;
}

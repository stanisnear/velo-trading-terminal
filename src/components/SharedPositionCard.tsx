import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { TradeShare } from '../utils/tradeShare';
import { hasPositionReference, readSharedPosition } from '../services/sharedPosition';
import { positionPnl } from '../services/positionValuation.mjs';
import { TradeShareCard } from './TradeShareCard';

export const SharedMarkContext = createContext<Record<string, number>>({});
export function useSharedTrade(snapshot: TradeShare, enabled = true) {
  const prices = useContext(SharedMarkContext);
  const pricesRef = useRef(prices); pricesRef.current = prices;
  const [state, setState] = useState({ data: snapshot, pending: hasPositionReference(snapshot) });
  const key = `${snapshot.contract}:${snapshot.tradeId}:${snapshot.txHash || ''}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true, busy = false, settled = false, data = snapshot;
    setState({ data, pending: hasPositionReference(data) });
    if (!hasPositionReference(data)) return;
    const refresh = async () => {
      if (busy || settled || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        data = await readSharedPosition(data, pricesRef.current[data.pair]);
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
  const mark = prices[state.data.pair];
  if (state.data.status !== 'OPEN' || !state.data.v4 || !(mark > 0)) return state;
  const data = state.data;
  const pnl = positionPnl({ ...data, timestamp: data.openedAt }, mark);
  return { ...state, data: { ...data, markPrice: mark, pnl, pnlPct: data.collateral > 0 ? pnl / data.collateral * 100 : 0 } };
}
export function SharedPositionCard({ snapshot }: { snapshot: TradeShare }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(()=>{
    if (!ref.current) return;
    if (!('IntersectionObserver' in window)) {setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'160px'});
    observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  const { data, pending } = useSharedTrade(snapshot, visible);
  return <div ref={ref}><TradeShareCard data={data} pending={pending}/></div>;
}

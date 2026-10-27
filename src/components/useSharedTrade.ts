import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { TradeShare } from '../utils/tradeShare';
import { hasPositionReference, readSharedPosition } from '../services/sharedPosition';
import { positionPnl } from '../services/positionValuation.mjs';
import { shareUpdates, resolveSharedTrade } from '../utils/shareBehavior.mjs';

export const SharedMarkContext = createContext<Record<string, number>>({});
export function useSharedTrade(snapshot: TradeShare, enabled = true) {
  const prices = useContext(SharedMarkContext);
  const pricesRef = useRef(prices); pricesRef.current = prices;
  const live = shareUpdates(snapshot);
  const [revision,setRevision]=useState(0);
  const retry=()=>setRevision(value=>value+1);
  const [state, setState] = useState({ data: snapshot, pending: live && hasPositionReference(snapshot), verified: false, failed: false });
  const key = `${snapshot.contract}:${snapshot.trader}:${snapshot.tradeId}:${snapshot.txHash || ''}:${snapshot.updateMode}:${snapshot.onClose}:${revision}`;
  useEffect(() => {
    if (!enabled || !live) return;
    let active = true, busy = false, settled = false, data = snapshot;
    setState({ data, pending: hasPositionReference(data), verified: false, failed: false });
    if (!hasPositionReference(data)) return;
    const refresh = async () => {
      if (busy || settled || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        data = resolveSharedTrade(snapshot, await readSharedPosition(data, pricesRef.current[data.pair]));
        settled = data.status !== 'OPEN';
        if (active) setState({ data, pending: false, verified: true, failed: false });
      } catch { if (active) setState(previous => ({ ...previous, pending: true, failed: true })); }
      finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 10_000);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [key, enabled]);
  if (!live) return { data: snapshot, pending: false, verified: false, failed: false, retry, liveMark: prices[snapshot.pair]>0 };
  const presented = { ...state, retry, liveMark:prices[state.data.pair]>0, data: { ...state.data, hideAmounts: snapshot.hideAmounts, theme: snapshot.theme, design: snapshot.design } };
  const mark = prices[state.data.pair];
  if (state.data.status !== 'OPEN' || !state.data.v4 || !(mark > 0)) return presented;
  const data = presented.data;
  const pnl = positionPnl({ ...data, timestamp: data.openedAt }, mark);
  return { ...presented, data: { ...data, markPrice: mark, pnl, pnlPct: data.collateral > 0 ? pnl / data.collateral * 100 : 0, updatedAt: Date.now() } };
}

import React, { useEffect, useRef, useState } from 'react';
import type { TradeShare } from '../utils/tradeShare';
import { renderTradePng } from '../utils/tradeImage';
import { LivePnlCard } from './LivePnlCard';
import { useStoredShareImage } from '../utils/shareBehavior.mjs';
export function PnlImage({ data, imageUrl, active = true, quality = 1.5, retryable = true }: { data: TradeShare; imageUrl?: string; active?: boolean; quality?: number; retryable?: boolean }) {
  const live=data.status==='OPEN'&&data.updateMode==='live'&&!data.closedSnapshot;
  const [decoded,setDecoded]=useState('');
  const [image, setImage] = useState({url:'',key:''}), [failed, setFailed] = useState(false), [broken, setBroken] = useState(''), [retry, setRetry] = useState(0);
  // Keep quote updates smooth, but never show a previous theme/amount display
  // after the author changes presentation or selects a different trade.
  const presentationKey = JSON.stringify([data.pair,data.tradeId,data.trader,data.theme,data.design,data.hideAmounts,data.side,data.leverage,data.entryPrice,data.collateral,data.traderHandle,data.status,data.updateMode,data.closedSnapshot]);
  const currentUrl = useRef(''), retired = useRef(new Set<string>()), lastRender = useRef(0);
  const releaseRetired = () => { retired.current.forEach(value=>URL.revokeObjectURL(value)); retired.current.clear(); };
  useEffect(() => {
    if (live || !active || imageUrl && useStoredShareImage(data)) return;
    let mounted = true;
    // Throttle, rather than debounce, so a continuous quote stream cannot starve the preview.
    const timer = setTimeout(() => {
      lastRender.current = Date.now();
      void renderTradePng(data, data.theme === 'light', !!data.hideAmounts, quality).then(blob => {
        if (!mounted) return;
        const next = URL.createObjectURL(blob);
        if (currentUrl.current) retired.current.add(currentUrl.current);
        currentUrl.current = next; setImage({url:next,key:presentationKey}); setFailed(false);
      }).catch(() => { if (mounted) setFailed(true); });
    }, Math.max(0, 1000 - (Date.now() - lastRender.current)));
    return () => { mounted = false; clearTimeout(timer); };
  }, [live, active, data.pnl, data.pnlPct, data.status==='OPEN'?data.markPrice:undefined, data.closePrice, data.status, presentationKey, data.updateMode, data.closedSnapshot, imageUrl, quality, retry]);
  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); releaseRetired(); }, []);
  const src = imageUrl && useStoredShareImage(data) ? imageUrl : image.key === presentationKey ? image.url : '';
  if(live)return <LivePnlCard data={data} animated={active}/>;
  const fallback=<LivePnlCard data={data} animated={false}/>;
  return src && broken !== src ? <div className="pnl-static-frame">{decoded!==src&&fallback}<img className={`pnl-image${decoded!==src?' is-decoding':''}`} src={src} width="1200" height="800" decoding="async" loading="lazy" onLoad={()=>{setDecoded(src);releaseRetired();}} onError={()=>{setBroken(src);releaseRetired();}} key={retry}
    alt={`${data.pair} ${data.side.toLowerCase()} · ${data.status === 'OPEN' ? 'Open position' : 'Position closed'} · ${data.closedSnapshot ? 'PnL snapshot' : data.status === 'OPEN' ? 'Estimated PnL' : 'Realized PnL'} ${data.hideAmounts ? `${data.pnlPct.toFixed(2)}%` : `$${data.pnl.toFixed(2)}`}`} /></div>
    : failed || broken ? <div className="pnl-image-placeholder" role="status">Image could not load. {retryable && <button type="button" onClick={()=>{setBroken('');setRetry(value=>value+1);}}>Retry image</button>}</div> : fallback;
}
